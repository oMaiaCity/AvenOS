#!/usr/bin/env python3
"""Recover a retained runtime fleet on an empty host before admitting customer traffic."""
import argparse
import copy
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import host
import prepare
import rollout
import start

archive = prepare.archive


def contained(path, root):
    return path.is_absolute() and path.resolve() == path and path.is_relative_to(root)


def local_compose(bundle, config, images):
    resolved = copy.deepcopy(config)
    for service in resolved['services'].values():
        reference = service['image']
        if reference not in images:
            raise ValueError('recovery image is absent from the verified archive')
        service['image'] = images[reference]
        service['pull_policy'] = 'never'
    rollout.atomic(bundle / 'recovery-compose.json', resolved)
    return ['docker', 'compose', '--project-directory', str(bundle), '-f', str(bundle / 'recovery-compose.json')]


def sql(compose, service, database, statement):
    return archive.run([*compose, 'exec', '-T', service, 'psql', '--set=ON_ERROR_STOP=1',
                        '-U', 'postgres', '-d', database, '-tAc', statement]).decode().strip()


def validate_placement(customers, identities, runtime_ids):
    """A backup set is admissible only when every directory placement has its exact copy."""
    for customer in customers:
        if customer['movement_id']:
            raise ValueError('snapshot contains an unfinished customer movement; select a completed recovery boundary')
        runtime_id = customer['runtime_id']
        if runtime_id not in runtime_ids:
            raise ValueError('customer placement names an unretained runtime')
        identity = identities.get((runtime_id, customer['database_name']))
        if (not identity or identity['environment_id'] != customer['id']
                or int(identity['routing_generation']) != int(customer['routing_generation'])):
            raise ValueError('customer database snapshot differs from the restored directory generation')


def recover(source, platform, volume, target, snapshot='latest'):
    if os.geteuid() != 0 or target not in ('next', 'production'):
        raise ValueError('recovery requires the target administrator')
    source_config = host.composition(source)
    if source_config['services']['database']['environment']['CUSTOMER_PLATFORM_ID'] != target:
        raise ValueError('recovery credentials belong to another target')
    # A failed restore is evidence: never erase or overwrite it on an automatic retry.
    if platform.exists() and any(platform.iterdir()):
        raise ValueError('fleet recovery requires an empty platform directory')
    for name in ('postgres', 'lifecycle'):
        path = volume / name
        if path.exists() and any(path.iterdir()):
            raise ValueError('fleet recovery requires fresh database and lifecycle storage')
    if any((volume / 'runtimes').glob('*/postgres/PG_VERSION')):
        raise ValueError('fleet recovery requires fresh customer database storage')
    work = volume / 'recovery'
    start.directory(work)
    with (work / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (work / 'started.json').exists():
            raise ValueError('a previous recovery attempt is retained; use a fresh target')
        rollout.atomic(work / 'started.json', {'version': 1, 'target': target, 'snapshot': snapshot})
        host.phase('retrieve the exact encrypted release snapshot')
        bootstrap = work / 'bootstrap'
        start.directory(bootstrap)
        service = copy.deepcopy(source_config['services']['restore'])
        service.pop('depends_on', None); service.pop('profiles', None)
        service['networks'] = ['recovery-egress']
        service['command'] = ['restore']
        service['environment'].update(RESTORE_MODE='release-only', RESTORE_SNAPSHOT=snapshot,
                                      RESTORE_RELEASE_DESTINATION='/recovery/archive')
        service['volumes'].append({'type': 'bind', 'source': str(work), 'target': '/recovery'})
        start.directory(volume / 'backups', 65532)
        # The operations UID owns only this fresh recovery scratch space.
        os.chown(work, 65532, 65532)
        rollout.atomic(bootstrap / 'docker-compose.yml', {'name': 'aven-fleet-retrieval',
                       'services': {'retrieve': service}, 'networks': {'recovery-egress': {}}})
        archive.run(['docker', 'compose', '--project-directory', str(bootstrap), 'run', '--rm', 'retrieve'])
        os.chown(work, 0, 0)
        receipt = json.loads(archive.private_file(work / 'archive/restore-receipt.json'))
        if platform.exists(): platform.rmdir()
        archive.restore(work / 'archive', platform, target)
        requested = json.loads(archive.private_file(source / 'release.json'))
        retained = json.loads(archive.private_file(platform / 'release.json'))
        if (requested['sha'] != retained['sha'] or any(retained['images'].get(key) != value
                                                     for key, value in requested['images'].items())):
            raise ValueError('The backup belongs to another verified release; select that release for recovery.')
        images = json.loads(archive.private_file(platform / 'restored-images.json'))['images']
        fleet = json.loads(archive.private_file(platform / 'fleet.json'))
        registry = fleet['registry']
        runtimes = rollout.validate_registry(registry, target)
        if fleet.get('version') != 1:
            raise ValueError('unsupported runtime fleet archive')
        primary = next(entry for entry in runtimes if entry['movement']['id'] == 'primary')
        if Path(primary['bundle']) != platform:
            raise ValueError('recovery requires the retained installation paths')
        lifecycle = volume / 'lifecycle'
        start.directory(lifecycle)
        configurations = {'primary': host.composition(platform)}
        restored_control = configurations['primary']['services']
        if (restored_control['restore']['environment']['RESTIC_REPOSITORY'] != source_config['services']['restore']['environment']['RESTIC_REPOSITORY']
                or restored_control['api']['environment']['API_PUBLIC_BASE_URL'] != source_config['services']['api']['environment']['API_PUBLIC_BASE_URL']):
            raise ValueError('The backup repository or public origin differs from the selected installation.')
        for entry in runtimes:
            runtime_id = entry['movement']['id']
            if runtime_id == 'primary': continue
            bundle = Path(entry['bundle'])
            if not contained(bundle, lifecycle / 'releases'):
                raise ValueError('runtime configuration path is outside the installation')
            files = fleet['bundles'][runtime_id]
            if set(files) != prepare.OUTPUTS | {'preparation.json'}:
                raise ValueError('runtime recovery bundle is incomplete')
            start.directory(bundle)
            for name, content in files.items(): archive.write(bundle / name, content.encode())
            (bundle / 'db-init.sh').chmod(0o644)
            identity = prepare.verify_prepared(bundle)
            if identity['id'] != runtime_id or identity['target'] != target:
                raise ValueError('runtime recovery identity differs')
            configurations[runtime_id] = json.loads(files['docker-compose.yml'])
            rollout.atomic(bundle / 'restored-images.json', {'version': 1, 'target': target, 'images': images})
        # Preflight every bind before creating a database or starting an application.
        for config in configurations.values():
            for service in config['services'].values():
                if service['image'] not in images:
                    raise ValueError('fleet references an image outside its retained release')
                for mount in service.get('volumes', []):
                    path = Path(mount['source'])
                    if not (contained(path, volume) or contained(path, platform)):
                        raise ValueError('fleet bind mount is outside the retained installation')
        compose_by_id = {}
        restored_identities = {}
        for entry in runtimes:
            runtime_id = entry['movement']['id']
            prefix = '' if runtime_id == 'primary' else runtime_id+'-'
            bundle = Path(entry['bundle'])
            config = configurations[runtime_id]
            storage = volume if runtime_id == 'primary' else volume / 'runtimes' / runtime_id
            start.directory(storage / 'postgres', 70)
            start.directory(storage / 'backups', 65532)
            # Normal init creates application databases. Recovery must restore into a blank cluster first.
            blank = copy.deepcopy(config)
            database = blank['services'][prefix+'database']
            database['volumes'] = [mount for mount in database['volumes']
                                   if mount['target'] == '/var/lib/postgresql/data']
            compose = local_compose(bundle, blank, images)
            host.phase('restore '+runtime_id+' databases with application services stopped')
            archive.run([*compose, 'up', '--detach', '--no-deps', '--pull', 'never', '--wait',
                         '--wait-timeout', '180', prefix+'database'])
            restore_service = blank['services'][prefix+'restore']
            selected_snapshot = receipt['snapshotId'] if runtime_id == 'primary' else receipt['manifest'].get('runtimeSnapshots', {}).get(runtime_id, 'latest')
            restore_service['command'] = ['restore']
            restore_service['environment'].update(RESTORE_SNAPSHOT=selected_snapshot)
            compose = local_compose(bundle, blank, images)
            archive.run([*compose, 'run', '--rm', '--no-deps', '--pull', 'never', prefix+'restore'])
            sql(compose, prefix+'database', 'postgres', f"COMMENT ON DATABASE postgres IS 'aven-platform:{target}'")
            databases = sql(compose, prefix+'database', 'postgres',
                            "SELECT datname FROM pg_database WHERE datname ~ '^cust_[a-f0-9]{32}$' AND datallowconn").splitlines()
            for database_name in databases:
                if not re.fullmatch('cust_[a-f0-9]{32}', database_name): raise ValueError('invalid customer database')
                value = json.loads(sql(compose, prefix+'database', database_name,
                                       'SELECT row_to_json(e) FROM aven_platform.environment_identity e WHERE singleton'))
                restored_identities[(runtime_id, database_name)] = value
                # Restore never automatically replays external effects, including effects after the snapshot.
                sql(compose, prefix+'database', database_name,
                    'UPDATE aven_platform.environment_identity SET execution_enabled=false WHERE singleton')
            compose_by_id[runtime_id] = local_compose(bundle, config, images)
        control = compose_by_id['primary']
        customers = json.loads(sql(control, 'database', 'aven_api',
                                    "SELECT coalesce(json_agg(e),'[]') FROM (SELECT id,database_name,runtime_id,routing_generation,movement_id FROM customer_environments) e"))
        validate_placement(customers, restored_identities, set(configurations))
        default = sql(control, 'database', 'aven_api', 'SELECT runtime_id FROM customer_runtime_defaults WHERE singleton')
        if default not in configurations:
            raise ValueError('default runtime is absent from the recovery archive')
        host.phase('reconcile restored credentials and customer admission')
        rollout.atomic(lifecycle / 'registry.json', registry)
        operator = rollout.operator_config(registry, volume / 'customer-movements')
        for runtime in operator['runtimes']:
            runtime['databaseToolsImage'] = images[runtime['databaseToolsImage']]
        rollout.atomic(lifecycle / 'operator.json', operator)
        for entry in runtimes:
            runtime_id = entry['movement']['id']
            prefix = '' if runtime_id == 'primary' else runtime_id+'-'
            compose = compose_by_id[runtime_id]
            archive.run([*compose, 'run', '--rm', '--no-deps', '--pull', 'never', prefix+'database-roles'])
            archive.run([*compose, 'up', '--detach', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180',
                         *[prefix+name for name in ('database-access', 'artifact-store-provisioner', 'artifact-provisioner-access')]])
            controller = lifecycle / 'primary-controller' if runtime_id == 'primary' else Path(entry['bundle']) / 'controller'
            controller_image = configurations[runtime_id]['services'][prefix+'platform-provisioner']['image']
            start.install_controller(images[controller_image], controller, entry['movement']['releaseSha'])
            archive.run([str(controller / 'bun'), str(controller / 'build/move-cli.js'),
                         str(lifecycle / 'operator.json'), 'reconcile', runtime_id])
        # Publish all reconciliation jobs before workers can claim restored pending work.
        for entry in runtimes:
            runtime_id = entry['movement']['id']
            prefix = '' if runtime_id == 'primary' else runtime_id+'-'
            archive.run([*compose_by_id[runtime_id], 'up', '--detach', '--no-deps', '--pull', 'never',
                         prefix+'platform-provisioner'])
        # Reconciliation is placement-aware; inactive copies retain NOLOGIN customer roles.
        for _ in range(120):
            if sql(control, 'database', 'aven_api', "SELECT count(*) FROM customer_environments WHERE desired_state='ready' AND observed_state<>'ready'") == '0': break
            import time
            time.sleep(2)
        else: raise ValueError('recovered customer roles did not reconcile')
        routing = volume / 'runtime-routing'
        routing.mkdir(mode=0o750, parents=True, exist_ok=True)
        os.chown(routing, 0, 1000); os.chmod(routing, 0o750)
        rollout.atomic(routing / 'runtimes.json', [entry['route'] for entry in runtimes], group=1000)
        for entry in sorted(runtimes, key=lambda entry: entry['movement']['id'] == 'primary'):
            runtime_id = entry['movement']['id']
            prefix = '' if runtime_id == 'primary' else runtime_id+'-'
            bundle = Path(entry['bundle'])
            storage = volume if runtime_id == 'primary' else volume / 'runtimes' / runtime_id
            for path in (storage / 'backups/public-status', volume / 'runtime-backup-health', volume / 'runtime-backup-health' / runtime_id):
                path.mkdir(mode=0o755, parents=True, exist_ok=True); os.chmod(path, 0o755); os.chown(path, 65532, 65532)
            if runtime_id == 'primary':
                for name, uid in (('static-sites', 10003), ('caddy/data', 0), ('caddy/config', 0)):
                    path = volume / name
                    path.mkdir(mode=0o750, parents=True, exist_ok=True); os.chown(path, uid, uid)
            archive.create(bundle, storage / 'release-archive', target)
            host.own_archive(storage / 'release-archive')
            compose = compose_by_id[runtime_id]
            services = configurations[runtime_id]['services']
            selected = [name for name, service in services.items() if name not in
                        (prefix+'database', prefix+'database-roles', prefix+'restore', prefix+'backup',
                         'checkout-migrate', 'api-migrate', 'checkout-billing-sync')]
            archive.run([*compose, 'up', '--detach', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '240', *selected])
            archive.run([*compose, '--profile', 'backup', 'up', '--detach', '--no-deps', '--pull', 'never', '--wait',
                         '--wait-timeout', '300', prefix+'backup'])
            # Normal Compose operations after recovery must continue using retained local image identities.
            rollout.atomic(bundle / 'docker-compose.override.yml', {'services': {
                name: {'image': images[service['image']], 'pull_policy': 'never'} for name, service in services.items()}})
        rollout.atomic(lifecycle / 'baseline.json', {'version': 1, 'target': target, 'candidate': 'recovered', 'complete': True})
        rollout.atomic(work / 'complete.json', {'version': 1, 'target': target, 'snapshotId': receipt['snapshotId'],
                                              'customerCount': len(customers), 'actorExecution': 'paused'})
        print('Fleet recovered and customer access reconciled. Actor execution remains paused for effect reconciliation.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--target', required=True)
    parser.add_argument('--platform', type=Path, default=Path('/opt/aven/platform'))
    parser.add_argument('--volume', type=Path, default=Path('/var/lib/aven'))
    parser.add_argument('--snapshot', default='latest')
    args = parser.parse_args()
    os.umask(0o077)
    recover(args.source.absolute(), args.platform.absolute(), args.volume.absolute(), args.target, args.snapshot)


if __name__ == '__main__':
    try: main()
    except ValueError as error:
        raise SystemExit(f'Fleet recovery stopped: {error}')
    except (OSError, KeyError, TypeError, subprocess.SubprocessError):
        raise SystemExit('Fleet recovery stopped before completion. Partial recovery is retained; inspect it and retry on fresh storage.')
