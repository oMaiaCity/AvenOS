#!/usr/bin/env python3
"""Publish prepared runtimes and move customers through the persistent movement journal."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid
import prepare

archive = prepare.archive


def atomic(path, value, group=None):
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise ValueError('installation files cannot use symbolic links')
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.pending-', delete=False) as stream:
        pending = Path(stream.name)
        try:
            os.chmod(pending, 0o600 if group is None else 0o640)
            if group is not None: os.chown(pending, 0, group)
            stream.write(archive.canonical(value)); stream.flush(); os.fsync(stream.fileno())
            pending.replace(path)
            archive.sync_directory(path.parent)
        finally:
            if pending.exists(): pending.unlink()


def validate_registry(registry, target):
    if registry.get('version') != 1 or registry.get('target') != target:
        raise ValueError('runtime registry belongs to another installation target')
    runtimes = registry['runtimes']
    if not isinstance(runtimes, list) or not 1 <= len(runtimes) <= 32:
        raise ValueError('runtime registry is empty or full')
    ids = set()
    for runtime in runtimes:
        identity = runtime['movement']
        runtime_id = identity['id']
        if (not re.fullmatch('[a-z][a-z0-9-]{0,62}', runtime_id) or runtime_id in ids
                or runtime['route']['id'] != runtime_id
                or not re.fullmatch('[a-f0-9]{40}', identity['releaseSha'])):
            raise ValueError('runtime registry identity is invalid')
        ids.add(runtime_id)
    if 'primary' not in ids:
        raise ValueError('the original control authority must be retained')
    return runtimes


def enroll(registry, bundle, target):
    runtimes = validate_registry(registry, target)
    identity = prepare.verify_prepared(bundle)
    if identity['target'] != target:
        raise ValueError('prepared runtime belongs to another target')
    runtime = {'movement': json.loads(archive.private_file(bundle / 'movement-runtime.json')),
               'route': json.loads(archive.private_file(bundle / 'route.json')),
               'bundle': str(bundle), 'releaseSha': identity['releaseSha']}
    if (runtime['movement']['id'] != identity['id'] or runtime['route']['id'] != identity['id']
            or runtime['movement']['releaseSha'] != identity['releaseSha']):
        raise ValueError('prepared runtime identity differs')
    previous = next((entry for entry in runtimes if entry['movement']['id'] == identity['id']), None)
    if previous is not None and previous != runtime:
        raise ValueError('registered runtime configuration is immutable')
    result = {**registry, 'runtimes': runtimes if previous else [*runtimes, runtime]}
    validate_registry(result, target)
    return result


def operator_config(registry, archive_directory):
    runtimes = validate_registry(registry, registry['target'])
    primary = next(entry['movement'] for entry in runtimes if entry['movement']['id'] == 'primary')
    return {'platformId': registry['target'],
            'controlDatabaseUrl': primary['provisioner']['CONTROL_DATABASE_URL'],
            'archiveDirectory': str(archive_directory),
            'runtimes': [entry['movement'] for entry in runtimes]}


def move_customers(cli, destination):
    """Retry the same database operations; never infer a rollback or abandon a held customer."""
    customers = json.loads(cli('list'))
    moved = 0
    for customer in customers:
        if customer['movement_id']:
            movement = json.loads(cli('status', customer['movement_id']))
            if movement['destination_runtime_id'] != destination or movement['mode'] != 'move':
                raise ValueError('an existing customer operation requires operator resolution')
            result = json.loads(cli('resume', customer['movement_id']))
        elif customer['runtime_id'] == destination:
            continue
        else:
            operation = str(uuid.uuid4())
            cli('begin', customer['id'], customer['runtime_id'], destination,
                str(customer['routing_generation']), operation)
            result = json.loads(cli('resume', operation))
        if result['phase'] != 'completed':
            raise ValueError('customer movement did not complete; retry the retained journal')
        moved += 1
    # New purchases use the selected runtime; a concurrent manual placement change is not hidden.
    remaining = json.loads(cli('list'))
    if any(customer['runtime_id'] != destination or customer['movement_id'] for customer in remaining):
        raise ValueError('customer placement changed during rollout; inspect and repeat')
    return moved


def rollout(registry_file, bundle, target, routing_file, archive_directory):
    if os.geteuid() != 0:
        raise ValueError('rollout requires the installation administrator')
    info = registry_file.stat()
    if info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('runtime registry must be root-owned and private')
    with (registry_file.parent / '.rollout-lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        registry = enroll(json.loads(archive.private_file(registry_file)), bundle, target)
        identity = prepare.verify_prepared(bundle)
        controller = bundle / 'controller'
        if archive.private_file(controller / 'release-sha').decode().strip() != identity['releaseSha']:
            raise ValueError('installed controller belongs to another release')
        # Installation and encrypted backup must succeed before any placement mutation.
        compose = ['docker', 'compose', '--project-directory', str(bundle)]
        archive.run([*compose, 'exec', '-T', f'{identity["id"]}-backup', '/operations/entrypoint.sh', 'health'])
        configuration = registry_file.parent / 'operator.json'
        atomic(configuration, operator_config(registry, archive_directory))
        def cli(*arguments):
            return archive.run([str(controller / 'bun'), str(controller / 'build/move-cli.js'),
                                str(configuration), *arguments]).decode()
        cli('register')
        # Persist credentials before publishing routes. Either crash boundary leaves admission closed.
        atomic(registry_file, registry)
        routing_file.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
        os.chown(routing_file.parent, 0, 1000)
        os.chmod(routing_file.parent, 0o750)
        atomic(routing_file, [entry['route'] for entry in registry['runtimes']], group=1000)
        cli('default', identity['id'])
        moved = move_customers(cli, identity['id'])
        # Take a new snapshot after activation. A fresh empty-runtime snapshot is not customer recovery proof.
        archive.run([*compose, 'exec', '-T', f'{identity["id"]}-backup', '/operations/entrypoint.sh', 'backup'])
        print(f'Runtime {identity["id"]}: {moved} customer movement(s) completed and backed up. Earlier runtimes are retained.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('registry', type=Path)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--target', required=True)
    parser.add_argument('--routing-file', type=Path, default=Path('/var/lib/aven/runtime-routing/runtimes.json'))
    parser.add_argument('--archive-directory', type=Path, default=Path('/var/lib/aven/customer-movements'))
    args = parser.parse_args()
    os.umask(0o077)
    rollout(args.registry.absolute(), args.bundle.absolute(), args.target,
            args.routing_file.absolute(), args.archive_directory.absolute())


if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        raise SystemExit('Rollout stopped. Existing runtimes, customer holds and operation journals are retained; inspect before retrying.')
