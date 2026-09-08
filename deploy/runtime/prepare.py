#!/usr/bin/env python3
"""Prepare an immutable runtime bundle alongside an existing platform authority."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import archive

SERVICES = ('database', 'database-roles', 'database-access', 'artifact-provisioner-access', 'artifact-store-provisioner', 'artifact-store',
            'platform-provisioner', 'intent-service', 'actor-runner', 'backup', 'restore')
DATABASE_KEYS = {'CUSTOMER_PLATFORM_ID', 'POSTGRES_USER', 'POSTGRES_PASSWORD',
                 'CUSTOMER_PROVISIONER_PASSWORD', 'ARTIFACT_STORE_PROVISIONER_DB_PASSWORD',
                 'PLATFORM_BACKUP_PASSWORD', 'PGHOST', 'PGPASSWORD'}
OUTPUTS = {'docker-compose.yml', '.env', 'Caddyfile', 'db-init.sh', 'release.json', 'route.json', 'movement-runtime.json'}


def verify_prepared(destination):
    existing = json.loads(archive.private_file(destination / 'preparation.json'))
    if set(existing['outputs']) != OUTPUTS:
        raise ValueError('incomplete prepared runtime')
    for name, digest in existing['outputs'].items():
        if hashlib.sha256(archive.private_file(destination / name)).hexdigest() != digest:
            raise ValueError('prepared runtime was modified')
    return existing['identity']


def endpoint(value, hostname, port):
    parsed = urlsplit(value)
    user = parsed.netloc.rsplit('@', 1)[0] + '@' if '@' in parsed.netloc else ''
    return urlunsplit((parsed.scheme, f'{user}{hostname}:{port}', parsed.path, parsed.query, parsed.fragment))


def prepare(bundle, destination, runtime_id, target, database_port, provisioner_port,
            data_root, control_network, control_port=5432):
    if not re.fullmatch('[a-z][a-z0-9-]{0,23}', runtime_id) or runtime_id == 'primary':
        raise ValueError('use a new runtime ID of at most 24 characters')
    if not re.fullmatch('[a-z][a-z0-9-]{0,62}', target):
        raise ValueError('invalid installation target')
    if not re.fullmatch('[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}', control_network):
        raise ValueError('invalid control network')
    if (any(not 1024 <= port <= 65535 for port in (database_port, provisioner_port, control_port))
            or len({database_port, provisioner_port, control_port}) != 3):
        raise ValueError('runtime ports must be distinct unprivileged loopback ports')
    if not data_root.is_absolute() or data_root == Path('/'):
        raise ValueError('runtime data root must be an absolute dedicated directory')
    manifest = json.loads(archive.private_file(bundle / 'release.json'))
    if manifest.get('version') != 1 or not re.fullmatch('[a-f0-9]{40}', manifest.get('sha', '')):
        raise ValueError('verified release manifest is required')
    inputs = {name: hashlib.sha256(archive.private_file(bundle / name)).hexdigest()
              for name in (*archive.FILES, 'release.json')}
    identity = {'version': 1, 'id': runtime_id, 'target': target, 'releaseSha': manifest['sha'],
                'databasePort': database_port, 'provisionerPort': provisioner_port,
                'controlPort': control_port, 'dataRoot': str(data_root),
                'controlNetwork': control_network, 'inputs': inputs}
    if destination.exists() or destination.is_symlink():
        if verify_prepared(destination) != identity:
            raise ValueError('runtime ID is already bound to another release or configuration')
        return identity

    source = json.loads(archive.run(['docker', 'compose', '--profile', '*', '--project-directory', str(bundle),
                                     'config', '--format', 'json']))
    if source['services']['database']['environment']['CUSTOMER_PLATFORM_ID'] != target:
        raise ValueError('source platform belongs to another target')
    for name in SERVICES:
        image = source['services'][name]['image']
        if image not in manifest['images'].values() or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.:/_-]*@sha256:[a-f0-9]{64}', image):
            raise ValueError('runtime images must match the verified immutable release')
    if (bundle / '.env').stat().st_mode & 0o077:
        raise ValueError('source credentials must be private')

    # Generate separate cluster credentials, function roots and runtime service tokens.
    # Shared directory, identity verification and model gateway credentials stay central.
    bindings = {
        'database': {'POSTGRES_PASSWORD': 'admin', 'CUSTOMER_PROVISIONER_PASSWORD': 'provisioner',
                     'ARTIFACT_STORE_PROVISIONER_DB_PASSWORD': 'artifact_database', 'PLATFORM_BACKUP_PASSWORD': 'backup'},
        'database-roles': {'PGPASSWORD': 'admin', 'CUSTOMER_PROVISIONER_PASSWORD': 'provisioner',
                           'ARTIFACT_STORE_PROVISIONER_DB_PASSWORD': 'artifact_database', 'PLATFORM_BACKUP_PASSWORD': 'backup'},
        'platform-provisioner': {'INTENTS_API_DB_CREDENTIAL_ROOT': 'intent_root', 'ACTOR_API_DB_CREDENTIAL_ROOT': 'actor_api_root',
                                 'ACTOR_WORKER_DB_CREDENTIAL_ROOT': 'actor_worker_root', 'ARTIFACT_API_DB_CREDENTIAL_ROOT': 'artifact_root',
                                 'ARTIFACT_STORE_PROVISIONER_TOKEN': 'artifact_provisioning'},
        'artifact-store-provisioner': {'ARTIFACT_STORE_PROVISIONER_BEARER_TOKEN': 'artifact_provisioning'},
        'artifact-store': {'ARTIFACT_STORE_API_DB_CREDENTIAL_ROOT': 'artifact_root', 'ARTIFACT_STORE_BEARER_TOKEN': 'artifact_token',
                           'ARTIFACT_STORE_ACTOR_RUNNER_BEARER_TOKEN': 'artifact_actor_token'},
        'intent-service': {'INTENT_DATABASE_CREDENTIAL_ROOT': 'intent_root', 'INTENT_SERVICE_BEARER_TOKEN': 'intent_token'},
        'actor-runner': {'ACTOR_API_DB_CREDENTIAL_ROOT': 'actor_api_root', 'ACTOR_WORKER_DB_CREDENTIAL_ROOT': 'actor_worker_root',
                         'ACTOR_RUNNER_SERVICE_BEARER_TOKEN': 'actor_token', 'ARTIFACT_STORE_BEARER_TOKEN': 'artifact_actor_token'},
        'backup': {'PGPASSWORD': 'backup'}, 'restore': {'PGPASSWORD': 'admin'}
    }
    credentials = {scope: secrets.token_urlsafe(48) for fields in bindings.values() for scope in fields.values()}
    database_credentials = {
        'platform-provisioner': {'CLUSTER_DATABASE_URL': 'provisioner'},
        'artifact-store-provisioner': {'ARTIFACT_STORE_PROVISIONER_DATABASE_URL': 'artifact_database'}
    }
    names = {name: f'{runtime_id}-{name}' for name in SERVICES}

    def rewrite(value):
        if isinstance(value, str):
            for old, new in names.items():
                if value == old: return new
                value = re.sub(r'(?<=//)' + re.escape(old) + r'(?=[:/])', new, value)
                value = re.sub(r'(?<=@)' + re.escape(old) + r'(?=[:/])', new, value)
            return value
        if isinstance(value, list): return [rewrite(item) for item in value]
        if isinstance(value, dict): return {key: rewrite(item) for key, item in value.items()}
        return value

    runtime = {'name': f'aven-runtime-{runtime_id}', 'services': {}, 'networks': {
        'platform-private': {'external': True, 'name': control_network},
        'platform-egress': {'name': f'aven-runtime-{runtime_id}-egress'},
        'platform-access': {'name': f'aven-runtime-{runtime_id}-access'}
    }}
    storage = data_root / runtime_id
    for name in SERVICES:
        service = rewrite(copy.deepcopy(source['services'][name]))
        for key, scope in bindings.get(name, {}).items():
            service['environment'][key] = credentials[scope]
        for key, scope in database_credentials.get(name, {}).items():
            parsed = urlsplit(service['environment'][key])
            authority = f'{parsed.username}:{credentials[scope]}@{parsed.hostname}'
            if parsed.port: authority += f':{parsed.port}'
            service['environment'][key] = urlunsplit((parsed.scheme, authority, parsed.path, parsed.query, parsed.fragment))
        dependencies = service.get('depends_on', {})
        service['depends_on'] = {names[key]: value for key, value in dependencies.items() if key in names}
        service['pull_policy'] = 'never'
        runtime['services'][names[name]] = service
        if name in ('database', 'database-roles'):
            service['environment'] = {key: value for key, value in service['environment'].items() if key in DATABASE_KEYS}
            service['environment']['CUSTOMER_PLATFORM_ID'] = target
            service['volumes'] = [{'type': 'bind', 'source': str(destination / 'db-init.sh'),
                                   'target': '/db-init.sh' if name == 'database-roles' else '/docker-entrypoint-initdb.d/10-runtime.sh',
                                   'read_only': True}]
        if name == 'database':
            service['healthcheck']['test'] = ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U postgres -d postgres']
            service['volumes'].insert(0, {'type': 'bind', 'source': str(storage / 'postgres'), 'target': '/var/lib/postgresql/data'})
        if name == 'database-access':
            service['command'] = ['TCP-LISTEN:5432,reuseaddr,fork', f'TCP:{names["database"]}:5432']
            service['ports'] = [{'target': 5432, 'published': str(database_port), 'host_ip': '127.0.0.1', 'protocol': 'tcp'}]
        if name == 'artifact-provisioner-access':
            service['command'] = ['TCP-LISTEN:8088,reuseaddr,fork', f'TCP:{names["artifact-store-provisioner"]}:8088']
            service['ports'] = [{'target': 8088, 'published': str(provisioner_port), 'host_ip': '127.0.0.1', 'protocol': 'tcp'}]
        if name == 'platform-provisioner':
            service['environment']['CUSTOMER_RUNTIME_ID'] = runtime_id
            # The central URL must never follow the runtime database host rewrite.
            service['environment']['CONTROL_DATABASE_URL'] = source['services'][name]['environment']['CONTROL_DATABASE_URL']
        if name in ('backup', 'restore'):
            service['depends_on'] = {names['database-roles']: {'condition': 'service_completed_successfully'}}
            service['environment']['RESTIC_REPOSITORY'] += f'/runtimes/{runtime_id}'
            service['environment']['BACKUP_RELEASE_ID'] = manifest['sha']
            service['environment']['BACKUP_HOST'] = runtime_id
            service['volumes'] = [{'type': 'bind', 'source': str(storage / 'backups'), 'target': '/var/lib/aven-backups'}]
            if name == 'backup':
                service['environment']['BACKUP_ALLOW_EMPTY'] = 'true'
                service['environment']['BACKUP_RETAIN_RUNTIME_SNAPSHOTS'] = 'true'
                service['environment']['BACKUP_RELEASE_ARCHIVE_ROOT'] = '/var/lib/aven-release-archive'
                service['volumes'].append({'type': 'bind', 'source': str(storage / 'release-archive'),
                                           'target': '/var/lib/aven-release-archive', 'read_only': True})
                service['volumes'].append({'type': 'bind', 'source': str(data_root.parent / 'runtime-backup-health' / runtime_id),
                                           'target': '/var/lib/aven-backups/public-status'})
            # Startup first proves the runtime and retains its images, then enables backup.
            service['profiles'] = ['backup' if name == 'backup' else 'recovery']

    api = source['services']['api']['environment']
    targets = rewrite(json.loads(api['CUSTOMER_DOWNSTREAMS_JSON']))
    target_credentials = {'artifacts': 'artifact_token', 'intents': 'intent_token', 'actor-runs': 'actor_token'}
    for route in targets:
        if route['segment'] not in target_credentials:
            raise ValueError('runtime composition does not implement a configured customer route')
        route['bearerToken'] = credentials[target_credentials[route['segment']]]
    route = {'id': runtime_id, 'targets': targets,
             'artifactStoreBaseUrl': rewrite(api['ARTIFACT_STORE_BASE_URL']),
             'artifactStoreBearerToken': credentials['artifact_token']}
    provisioner = runtime['services'][names['platform-provisioner']]['environment'].copy()
    provisioner['CLUSTER_DATABASE_URL'] = endpoint(provisioner['CLUSTER_DATABASE_URL'], '127.0.0.1', database_port)
    provisioner['CONTROL_DATABASE_URL'] = endpoint(provisioner['CONTROL_DATABASE_URL'], '127.0.0.1', control_port)
    provisioner['ARTIFACT_STORE_PROVISIONER_URL'] = f'http://127.0.0.1:{provisioner_port}'
    password = runtime['services'][names['database']]['environment']['POSTGRES_PASSWORD']
    movement = {'id': runtime_id, 'releaseSha': manifest['sha'], 'provisioner': provisioner,
                'databaseToolsImage': manifest['images']['DATABASE_IMAGE'],
                'recoveryDatabaseUrl': f'postgres://postgres:{password}@127.0.0.1:{database_port}/postgres?sslmode=disable'}
    output = {'docker-compose.yml': archive.canonical(runtime), '.env': b'', 'Caddyfile': b'',
              'db-init.sh': archive.private_file(Path(__file__).with_name('db-init.sh')),
              'release.json': archive.canonical(manifest), 'route.json': archive.canonical(route),
              'movement-runtime.json': archive.canonical(movement)}
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.preparing-', dir=destination.parent))
    try:
        for name, data in output.items(): archive.write(stage / name, data)
        # The PostgreSQL entrypoint runs this non-secret script as its database UID.
        (stage / 'db-init.sh').chmod(0o644)
        archive.write(stage / 'preparation.json', archive.canonical({'identity': identity, 'outputs': {
            name: hashlib.sha256(data).hexdigest() for name, data in output.items()}}))
        # Validate the exact generated composition without starting or modifying services.
        archive.run(['docker', 'compose', '--project-directory', str(stage), 'config', '--quiet'])
        archive.sync_directory(stage)
        stage.rename(destination)
        archive.sync_directory(destination.parent)
    finally:
        if stage.exists(): shutil.rmtree(stage)
    return identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--runtime', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--database-port', type=int, required=True)
    parser.add_argument('--provisioner-port', type=int, required=True)
    parser.add_argument('--control-port', type=int, default=5432)
    parser.add_argument('--data-root', type=Path, default=Path('/var/lib/aven/runtimes'))
    parser.add_argument('--control-network', default='aven-platform_platform-private')
    args = parser.parse_args()
    os.umask(0o077)
    result = prepare(args.bundle.absolute(), args.destination.absolute(), args.runtime, args.target,
                     args.database_port, args.provisioner_port, args.data_root,
                     args.control_network, args.control_port)
    print(f"Runtime {result['id']} prepared at release {result['releaseSha']}; customer placement is unchanged.")


if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        raise SystemExit('Runtime preparation failed; existing runtimes and customer placement are preserved.')
