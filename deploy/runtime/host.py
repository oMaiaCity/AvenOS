#!/usr/bin/env python3
"""Install platform control services and promote an independently backed-up customer runtime."""
import argparse
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import initialize
import prepare
import rollout
import start

archive = prepare.archive
CONTROL_SERVICES = ('checkout-migrate', 'checkout-billing-sync', 'api-migrate', 'checkout',
                    'email-worker', 'platform-event-worker', 'api', 'static-site-host', 'caddy')
current_phase = 'preflight'


def phase(name):
    global current_phase
    current_phase = name
    print(f'Platform rollout: {name}.', flush=True)


def composition(bundle):
    return json.loads(archive.run(['docker', 'compose', '--profile', '*', '--project-directory', str(bundle), '-f', str(bundle / 'docker-compose.yml'),
                                   'config', '--format', 'json']))


def retain_input(source, releases):
    manifest = json.loads(archive.private_file(source / 'release.json'))
    if manifest.get('version') != 1 or not re.fullmatch('[a-f0-9]{40}', manifest.get('sha', '')):
        raise ValueError('verified release manifest required')
    files = {name: archive.private_file(source / name) for name in (*archive.FILES, 'release.json')}
    fingerprint = hashlib.sha256(archive.canonical({name: hashlib.sha256(data).hexdigest()
                                                  for name, data in files.items()})).hexdigest()
    identity = f'r-{manifest["sha"][:12]}-{fingerprint[:8]}'
    destination = releases / identity / 'input'
    if destination.exists():
        if any(archive.private_file(destination / name) != data for name, data in files.items()):
            raise ValueError('retained release configuration differs')
    else:
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        pending = Path(tempfile.mkdtemp(prefix='.preparing-', dir=destination.parent))
        for name, data in files.items(): archive.write(pending / name, data)
        for name in ('db-init.sh', 'Caddyfile'): (pending / name).chmod(0o644)
        archive.sync_directory(pending)
        pending.rename(destination)
        archive.sync_directory(destination.parent)
    rendered = composition(destination)
    if any(service['image'] not in manifest['images'].values() for service in rendered['services'].values()):
        raise ValueError('candidate composition differs from its verified image manifest')
    return identity, destination, manifest, rendered


def merge_control(current, candidate, routing_file):
    result = copy.deepcopy(current)
    if set(current['services']) != set(candidate['services']):
        raise ValueError('control service topology changed; an explicit installation transition is required')
    # Customer runtime and database credentials stay bound to the retained generation.
    # Control credentials may rotate only through a coordinated role-rotation operation.
    for name in ('database', 'database-roles'):
        if current['services'][name]['environment'] != candidate['services'][name]['environment']:
            raise ValueError('database credential or target change requires explicit rotation')
    for name in CONTROL_SERVICES:
        result['services'][name] = copy.deepcopy(candidate['services'][name])
    result['services']['api']['environment']['CUSTOMER_RUNTIMES_FILE'] = '/runtime-routing/runtimes.json'
    result['services']['api']['environment']['CUSTOMER_RUNTIME_BACKUP_HEALTH_DIRECTORY'] = '/runtime-backup-health'
    for mount in result['services']['api']['volumes']:
        if mount['target'] == '/runtime-routing': mount['source'] = str(routing_file.parent)
        if mount['target'] == '/runtime-backup-health': mount['source'] = str(routing_file.parent.parent / 'runtime-backup-health')
    # A network policy change is an infrastructure operation, not an incidental runtime update.
    if current['networks'] != candidate['networks']:
        raise ValueError('network topology changed; review the infrastructure transition')
    return result


def own_archive(directory):
    for parent, directories, files in os.walk(directory, followlinks=False):
        for path in [Path(parent), *(Path(parent) / name for name in directories + files)]:
            if path.is_symlink(): raise ValueError('archive contains a symbolic link')
            os.chown(path, 65532, 65532)


def configure_backup(config, location, release_sha):
    backup = config['services']['backup']
    backup['environment']['BACKUP_RELEASE_ARCHIVE_ROOT'] = '/var/lib/aven-release-archive'
    backup['environment']['BACKUP_RELEASE_ID'] = release_sha
    backup['volumes'] = [mount for mount in backup['volumes'] if mount['target'] != '/var/lib/aven-release-archive']
    backup['volumes'].append({'type': 'bind', 'source': str(location), 'target': '/var/lib/aven-release-archive', 'read_only': True})
    return config


def write_platform(platform, config, manifest, source):
    platform.mkdir(mode=0o700, parents=True, exist_ok=True)
    config = copy.deepcopy(config)
    role_script = next(mount['source'] for mount in config['services']['database-roles']['volumes']
                       if mount['target'] == '/db-init.sh')
    role_content = archive.private_file(Path(role_script))
    for service in config['services'].values():
        for mount in service.get('volumes', []):
            if mount['source'] == role_script: mount['source'] = str(platform / 'db-init.sh')
            if mount['target'] == '/etc/caddy/Caddyfile': mount['source'] = str(platform / 'Caddyfile')
    # Compose's rendered JSON already quotes literal dollars for a second parse.
    rollout.atomic(platform / 'docker-compose.yml', config)
    for name in ('.env', 'db-init.sh', 'Caddyfile'):
        data = b'' if name == '.env' else role_content if name == 'db-init.sh' else archive.private_file(source / name)
        pending = platform / f'.pending-{name.lstrip(".")}'
        if pending.exists(): pending.unlink()
        archive.write(pending, data)
        if name != '.env': pending.chmod(0o644)
        pending.replace(platform / name)
    rollout.atomic(platform / 'release.json', manifest)
    recovered_file = platform / 'restored-images.json'
    if recovered_file.exists():
        recovered = json.loads(archive.private_file(recovered_file))['images']
        # Preserve offline identities only for retained images; new control images use their verified digests.
        rollout.atomic(platform / 'docker-compose.override.yml', {'services': {
            name: {'image': recovered.get(service['image'], service['image']), 'pull_policy': 'never'}
            for name, service in config['services'].items()}})


def wait_reconciliation(platform):
    for _ in range(120):
        result = archive.run(['docker', 'compose', '--project-directory', str(platform), 'exec', '-T',
                              'database', 'psql', '-U', 'postgres', '-d', 'aven_api', '-tAc',
                              "SELECT count(*) FROM customer_environments WHERE desired_state='ready' AND observed_state<>'ready'"])
        if result.decode().strip() == '0': return
        time.sleep(2)
    raise ValueError('customer reconciliation did not become ready')


def backup_fleet(platform, registry):
    compose = ['docker', 'compose', '--project-directory', str(platform)]
    active = archive.run([*compose, 'exec', '-T', 'database', 'psql', '--set=ON_ERROR_STOP=1',
                          '-U', 'postgres', '-d', 'aven_api', '-tAc',
                          "SELECT DISTINCT runtime_id FROM customer_environments WHERE runtime_id <> 'primary' ORDER BY runtime_id"]).decode().splitlines()
    entries = {entry['movement']['id']: entry for entry in rollout.validate_registry(registry, registry['target'])}
    for runtime_id in active:
        if runtime_id not in entries:
            raise ValueError('active runtime has no retained backup configuration')
        archive.run(['docker', 'compose', '--project-directory', entries[runtime_id]['bundle'],
                     'exec', '-T', runtime_id+'-backup', '/operations/entrypoint.sh', 'backup'])
    archive.run([*compose, 'exec', '-T', 'backup', '/operations/entrypoint.sh', 'backup'])


def check_capacity(platform, volume, registry_file, selected_images):
    """Reserve space for retained images, the new database copy, dump and backup staging."""
    local_images = {}
    for image in selected_images:
        value = json.loads(archive.run(['docker', 'image', 'inspect', '--format', '{{json .}}', image]))
        local_images[value['Id']] = int(value['Size'])
    entries = [{'bundle': str(platform), 'movement': {'id': 'primary'}}] if (platform / 'docker-compose.yml').exists() else []
    if registry_file.exists():
        entries = json.loads(archive.private_file(registry_file))['runtimes']
    database_bytes = 0
    for entry in entries:
        runtime_id = entry['movement']['id']
        service = 'database' if runtime_id == 'primary' else runtime_id+'-database'
        value = archive.run(['docker', 'compose', '--project-directory', entry['bundle'], 'exec', '-T', service,
                             'psql', '--set=ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tAc',
                             "SELECT coalesce(sum(pg_database_size(oid)),0)::bigint FROM pg_database WHERE datname ~ '^cust_[a-f0-9]{32}$'"])
        database_bytes += int(value.decode().strip())
    if database_bytes < 0 or any(size < 0 for size in local_images.values()):
        raise ValueError('invalid capacity inventory')
    reserve = 2 * 1024**3
    required = reserve + 3 * database_bytes + 2 * sum(local_images.values())
    available = shutil.disk_usage(volume).free
    if available < required:
        raise ValueError(f'Insufficient lifecycle storage: need {required} bytes free, found {available}. Retire eligible retained generations or expand storage before retrying.')


def deploy(source, platform, volume, target):
    if os.geteuid() != 0 or target not in ('next', 'production'):
        raise ValueError('platform deployment requires its target administrator')
    lifecycle = volume / 'lifecycle'
    start.directory(lifecycle)
    with (lifecycle / '.deployment-lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        runtime_id, candidate, manifest, rendered = retain_input(source, lifecycle / 'releases')
        if rendered['services']['database']['environment']['CUSTOMER_PLATFORM_ID'] != target:
            raise ValueError('candidate belongs to another target')
        registry_file = lifecycle / 'registry.json'
        routing_file = volume / 'runtime-routing/runtimes.json'
        release_archive = volume / 'release-archive'
        phase('verify immutable images')
        # Download and validate every selected image before stopping or modifying a running service.
        for image in sorted({service['image'] for service in rendered['services'].values()}):
            if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.:/_-]*@sha256:[a-f0-9]{64}', image):
                raise ValueError('candidate image is not immutable')
            archive.run(['docker', 'pull', image])
        check_capacity(platform, volume, registry_file, {service['image'] for service in rendered['services'].values()})
        baseline_file = lifecycle / 'baseline.json'
        if not baseline_file.exists():
            rollout.atomic(baseline_file, {'version': 1, 'target': target, 'candidate': runtime_id, 'complete': False})
        baseline = json.loads(archive.private_file(baseline_file))
        if baseline['target'] != target:
            raise ValueError('baseline belongs to another target')
        if not baseline['complete']:
            phase('initialize the original runtime')
            if baseline['candidate'] != runtime_id:
                raise ValueError('finish the interrupted baseline release before selecting another release')
            if (platform / 'docker-compose.yml').exists() and not registry_file.exists():
                # The predecessor cannot participate in a migration without execution fencing.
                # Adoption is a separate, backed-up maintenance transition; never silently replace it.
                from transition import adopt
                adopt(platform, candidate, lifecycle, release_archive, target)
            for name, uid in (('postgres', 70), ('backups', 65532)):
                start.directory(volume / name, uid)
            for name, uid, mode in (('static-sites', 10003, 0o750), ('caddy/data', 0, 0o750),
                                    ('caddy/config', 0, 0o750), ('backups/public-status', 65532, 0o755),
                                    ('runtime-routing', 0, 0o750), ('runtime-backup-health', 0, 0o755)):
                directory = volume / name
                if directory.is_symlink() or any(parent.is_symlink() for parent in directory.parents):
                    raise ValueError('installation storage cannot use symbolic links')
                directory.mkdir(mode=mode, parents=True, exist_ok=True)
                os.chown(directory, uid, 1000 if name == 'runtime-routing' else uid)
                os.chmod(directory, mode)
            config = copy.deepcopy(rendered)
            config['services']['backup']['profiles'] = ['backup']
            config = configure_backup(config, release_archive, manifest['sha'])
            write_platform(platform, config, manifest, candidate)
            compose = ['docker', 'compose', '--project-directory', str(platform)]
            archive.run([*compose, 'up', '--detach', '--pull', 'never', '--wait', '--wait-timeout', '240',
                         'database-roles', 'api-migrate', 'platform-provisioner',
                         'database-access', 'artifact-provisioner-access'])
            initialize.initialize(platform, registry_file, target)
            wait_reconciliation(platform)
            archive.run([*compose, 'up', '--detach', '--pull', 'never', '--wait', '--wait-timeout', '240'])
            archive.create(platform, release_archive, target)
            own_archive(release_archive)
            archive.run([*compose, '--profile', 'backup', 'up', '--detach', '--pull', 'never', '--wait',
                         '--wait-timeout', '300', 'backup'])
            rollout.atomic(baseline_file, {**baseline, 'complete': True})

        registry = json.loads(archive.private_file(registry_file))
        runtimes = rollout.validate_registry(registry, target)
        phase('prepare and back up the new customer runtime')
        # A stable ID binds this exact source/configuration; retry never allocates another database.
        destination = lifecycle / 'releases' / runtime_id / 'runtime'
        ports = (json.loads(archive.private_file(destination / 'preparation.json'))['identity']
                 if destination.exists() else {'databasePort': 15000+len(runtimes)*2, 'provisionerPort': 15001+len(runtimes)*2})
        prepare.prepare(candidate, destination, runtime_id, target, ports['databasePort'], ports['provisionerPort'],
                        volume / 'runtimes', rendered['networks']['platform-private']['name'],
                        int(rendered['services']['database-access']['ports'][0]['published']))
        start.start(destination, target)
        registry = rollout.enroll(registry, destination, target)
        # Publish all old routes before updating the facade; the old customer placement still wins.
        routing_file.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
        os.chown(routing_file.parent, 0, 1000); os.chmod(routing_file.parent, 0o750)
        rollout.atomic(routing_file, [entry['route'] for entry in registry['runtimes']], group=1000)
        current = composition(platform)
        updated = merge_control(current, rendered, routing_file)
        updated = configure_backup(updated, release_archive, manifest['sha'])
        updated['services']['backup']['environment']['BACKUP_RUNTIME_DIRECTORY'] = '/runtime-backup-health'
        updated['services']['backup']['volumes'] = [mount for mount in updated['services']['backup']['volumes'] if mount['target'] != '/runtime-backup-health']
        updated['services']['backup']['volumes'].append({'type': 'bind', 'source': str(volume / 'runtime-backup-health'),
                                                       'target': '/runtime-backup-health', 'read_only': True})
        inventory = {**manifest, 'images': {**manifest['images'], **{
            f'retained:{name}': service['image'] for name, service in updated['services'].items()}}}
        tools_directory = Path(__file__).resolve().parent
        retained_tools = {f'runtime/{name}.py': archive.private_file(tools_directory / f'{name}.py').decode()
                          for name in ('host', 'initialize', 'prepare', 'rollout', 'start', 'transition', 'recover')}
        retained_tools['runtime/db-init.sh'] = archive.private_file(tools_directory / 'db-init.sh').decode()
        retained_tools['release/archive.py'] = archive.private_file(tools_directory.parent / 'release/archive.py').decode()
        fleet = {'version': 1, 'registry': registry, 'bundles': {}, 'images': [], 'tools': retained_tools}
        for runtime in registry['runtimes']:
            if runtime['movement']['id'] == 'primary': continue
            runtime_bundle = Path(runtime['bundle'])
            files = {name: archive.private_file(runtime_bundle / name).decode()
                     for name in (*prepare.OUTPUTS, 'preparation.json')}
            fleet['bundles'][runtime['movement']['id']] = files
            for name, service in json.loads(files['docker-compose.yml'])['services'].items():
                inventory['images'][f'runtime:{name}'] = service['image']
                fleet['images'].append(service['image'])
        compose = ['docker', 'compose', '--project-directory', str(platform)]
        control_checkpoint = candidate.parent / 'control-backup.json'
        phase('back up the current control authority')
        if not control_checkpoint.exists():
            backup_fleet(platform, registry)
            rollout.atomic(control_checkpoint, {'target': target, 'releaseSha': manifest['sha']})
        # Do not label a snapshot of a half-migrated control database with the old release.
        archive.run([*compose, 'stop', '--timeout', '120', 'backup'])
        phase('update platform control services')
        write_platform(platform, updated, inventory, candidate)
        one_shots = ('checkout-migrate', 'api-migrate', 'checkout-billing-sync')
        for service in one_shots:
            archive.run([*compose, 'run', '--rm', '--no-deps', '--pull', 'never', service])
        archive.run([*compose, 'up', '--detach', '--no-deps', '--pull', 'never', '--wait',
                     '--wait-timeout', '240', *[name for name in CONTROL_SERVICES if name not in one_shots]])
        # Retain the directory before any customer can depend on the new runtime credentials.
        rollout.atomic(registry_file, registry)
        rollout.atomic(platform / 'fleet.json', fleet)
        phase('retain and back up the complete runtime directory')
        archive.create(platform, release_archive, target)
        own_archive(release_archive)
        archive.run([*compose, '--profile', 'backup', 'up', '--detach', '--no-deps', '--pull', 'never',
                     '--wait', '--wait-timeout', '300', 'backup'])
        backup_fleet(platform, registry)
        phase('move customers individually')
        rollout.rollout(registry_file, destination, target, routing_file, volume / 'customer-movements')
        # Persist the authoritative route generation after the last customer activation.
        backup_fleet(platform, registry)
        print(f'{target} deployment completed at release {manifest["sha"]}; old customer runtimes remain available for explicit rollback.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--target', required=True)
    parser.add_argument('--platform', type=Path, default=Path('/opt/aven/platform'))
    parser.add_argument('--volume', type=Path, default=Path('/var/lib/aven'))
    args = parser.parse_args()
    os.umask(0o077)
    deploy(args.source.absolute(), args.platform.absolute(), args.volume.absolute(), args.target)


if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        raise SystemExit(f'Platform rollout stopped during {current_phase}. Retained releases, databases and journals are preserved; repair this phase and retry.')
