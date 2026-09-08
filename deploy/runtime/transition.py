#!/usr/bin/env python3
"""One-time, quiesced adoption of a pre-movement installation with unchanged customer schemas."""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import prepare
import rollout

archive = prepare.archive


def tree(path):
    result = {}
    for entry in path.rglob('*'):
        if entry.is_symlink(): raise ValueError('release catalog contains symbolic links')
        if entry.is_file(): result[str(entry.relative_to(path))] = hashlib.sha256(entry.read_bytes()).hexdigest()
    if not result: raise ValueError('release catalog is empty')
    return result


def catalog(image, directory):
    directory.mkdir(mode=0o700)
    container = archive.run(['docker', 'create', '--network', 'none', image]).decode().strip()
    try:
        for name in ('components', 'artifact-migrations'):
            archive.run(['docker', 'cp', f'{container}:/app/{name}', str(directory / name)])
    finally: archive.run(['docker', 'rm', container])
    return tree(directory)


def adopt(platform, candidate, lifecycle, release_archive, target):
    from host import composition, own_archive
    journal = lifecycle / 'pre-movement-transition.json'
    manifest = json.loads(archive.private_file(candidate / 'release.json'))
    if journal.exists():
        state = json.loads(archive.private_file(journal))
        if state['target'] != target or state['destinationSha'] != manifest['sha']:
            raise ValueError('finish the recorded installation transition first')
        if state['phase'] == 'backed-up': return
        original = Path(state['original'])
        previous = composition(original)
    else:
        previous = composition(platform)
        environment = previous['services']['backup']['environment']
        if environment['BACKUP_ENVIRONMENT'] != target:
            raise ValueError('the running backup target differs')
        sha = environment['BACKUP_RELEASE_ID']
        if not re.fullmatch('[a-f0-9]{40}', sha):
            raise ValueError('the predecessor lacks an exact source revision')
        expected = composition(candidate)
        if previous['services']['api']['environment']['API_PUBLIC_BASE_URL'] != expected['services']['api']['environment']['API_PUBLIC_BASE_URL']:
            raise ValueError('the running platform origin differs')
        with tempfile.TemporaryDirectory(prefix='.catalog-check-', dir=lifecycle) as scratch:
            old = catalog(previous['services']['platform-provisioner']['image'], Path(scratch) / 'old')
            new = catalog(manifest['images']['PLATFORM_PROVISIONER_IMAGE'], Path(scratch) / 'new')
            if old != new:
                raise ValueError('one-time adoption requires identical customer schema catalogs')
        original = lifecycle / f'pre-movement-{sha}'
        original.mkdir(mode=0o700)
        for name in archive.FILES:
            # Resolve paths against the old installation before retaining its private configuration.
            data = archive.canonical(previous) if name == 'docker-compose.yml' else (
                b'' if name == '.env' else archive.private_file(platform / name))
            archive.write(original / name, data)
        archive.write(original / 'release.json', archive.canonical({'version': 1, 'sha': sha,
                       'images': {name: service['image'] for name, service in previous['services'].items()}}))
        state = {'version': 1, 'target': target, 'sourceSha': sha, 'destinationSha': manifest['sha'],
                 'original': str(original), 'phase': 'prepared'}
        rollout.atomic(journal, state)
    compose = ['docker', 'compose', '--project-directory', str(original)]
    def sql(database, statement):
        return archive.run([*compose, 'exec', '-T', 'database', 'psql', '--set=ON_ERROR_STOP=1',
                            '-U', 'postgres', '-d', database, '-tAc', statement]).decode().strip()
    marker = sql('postgres', "SELECT coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname='postgres'")
    if marker not in ('', 'default administrative connection database', f'aven-platform:{target}'):
        raise ValueError('the predecessor database is bound to another target')
    if sql('postgres', "SELECT count(*) FROM pg_database WHERE datname LIKE '%identity%'") != '0':
        raise ValueError('a platform transition cannot contain the identity database')
    if sql('aven_api', "SELECT count(*) FROM customer_environments WHERE desired_state<>'ready' OR observed_state<>'ready'") != '0':
        raise ValueError('resolve existing customer provisioning failures before adoption')
    databases = sql('aven_api', 'SELECT database_name FROM customer_environments ORDER BY id').splitlines()
    def settled():
        for database in databases:
            if not re.fullmatch('cust_[a-f0-9]{32}', database):
                raise ValueError('customer database name is invalid')
            if sql(database, "SELECT count(*) FROM aven_actor_runs.runs WHERE state NOT IN ('succeeded','failed','cancelled')") != '0':
                raise ValueError('finish or reconcile unfinished Actors before the one-time transition')
    settled()
    # Close all application admission and background execution. Keep only the database running.
    services = [name for name, service in previous['services'].items()
                if name != 'database' and service.get('restart') not in ('no', None) and not service.get('profiles')]
    archive.run([*compose, 'stop', '--timeout', '120', *services])
    settled()
    if sql('postgres', "SELECT count(*) FROM pg_stat_activity WHERE datname<>'postgres' AND backend_type='client backend'") != '0':
        raise ValueError('application database clients remain connected after quiescence')
    archive.create(original, release_archive, target)
    own_archive(release_archive)
    backup = copy.deepcopy(previous['services']['backup'])
    backup.update(image=manifest['images']['OPERATIONS_IMAGE'], restart='no')
    backup.pop('depends_on', None); backup.pop('profiles', None); backup.pop('healthcheck', None)
    backup['command'] = ['backup']
    backup['environment']['BACKUP_RELEASE_ARCHIVE_ROOT'] = '/var/lib/aven-release-archive'
    backup['volumes'] = [mount for mount in backup['volumes'] if mount['target'] != '/var/lib/aven-release-archive']
    backup['volumes'].append({'type': 'bind', 'source': str(release_archive), 'target': '/var/lib/aven-release-archive', 'read_only': True})
    backup_config = {'name': 'aven-transition-backup', 'services': {'backup': backup}, 'networks': {
        name: {'external': True, 'name': previous['networks'][name]['name']} for name in backup['networks']}}
    backup_file = lifecycle / 'transition-backup.json'
    rollout.atomic(backup_file, backup_config)
    archive.run(['docker', 'compose', '--file', str(backup_file), 'run', '--rm', '--no-deps', 'backup'])
    # Persist the host-local identity only after retaining an encrypted, quiesced predecessor snapshot.
    sql('postgres', f"COMMENT ON DATABASE postgres IS 'aven-platform:{target}'")
    rollout.atomic(journal, {**state, 'phase': 'backed-up'})
    print('Pre-movement installation quiesced and backed up with its exact images and configuration. Customer schema catalogs are unchanged.')
