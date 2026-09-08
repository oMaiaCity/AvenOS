#!/usr/bin/env python3
"""Retain the original runtime after a verified installation of the movement-capable release."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import prepare
import rollout
import start

archive = prepare.archive


def initialize(bundle, registry_file, target):
    if os.geteuid() != 0:
        raise ValueError('runtime initialization requires the installation administrator')
    manifest = json.loads(archive.private_file(bundle / 'release.json'))
    compose = ['docker', 'compose', '--profile', '*', '--project-directory', str(bundle)]
    composition = json.loads(archive.run([*compose, 'config', '--format', 'json']))
    services = composition['services']
    if services['database']['environment']['CUSTOMER_PLATFORM_ID'] != target:
        raise ValueError('installed platform belongs to another target')
    for service in services.values():
        if service['image'] not in manifest['images'].values():
            raise ValueError('installed service image differs from the release manifest')
    def sql(database, statement):
        return archive.run([*compose, 'exec', '-T', 'database', 'psql', '--set=ON_ERROR_STOP=1',
                            '-U', 'postgres', '-d', database, '-tAc', statement]).decode().strip()
    if sql('postgres', "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='postgres'") != f'aven-platform:{target}':
        raise ValueError('database cluster identity differs')
    # Do not assign an old, running generation a new release identity.
    registered = sql('aven_api', "SELECT coalesce(release_sha,'') FROM customer_runtimes WHERE id='primary'")
    if registered and registered != manifest['sha']:
        raise ValueError('primary is already bound to another release; prepare a new runtime')
    provisioner = services['platform-provisioner']['environment'].copy()
    database_port = int(services['database-access']['ports'][0]['published'])
    provisioner_port = int(services['artifact-provisioner-access']['ports'][0]['published'])
    for name in ('database-access', 'artifact-provisioner-access'):
        if any(port.get('host_ip') != '127.0.0.1' for port in services[name]['ports']):
            raise ValueError('operator endpoints must bind only to loopback')
    provisioner['CUSTOMER_RUNTIME_ID'] = 'primary'
    provisioner['CONTROL_DATABASE_URL'] = prepare.endpoint(provisioner['CONTROL_DATABASE_URL'], '127.0.0.1', database_port)
    provisioner['CLUSTER_DATABASE_URL'] = prepare.endpoint(provisioner['CLUSTER_DATABASE_URL'], '127.0.0.1', database_port)
    provisioner['ARTIFACT_STORE_PROVISIONER_URL'] = f'http://127.0.0.1:{provisioner_port}'
    api = services['api']['environment']
    # Generated administrator credentials are URL-safe; never infer them from the application login.
    password = services['database']['environment']['POSTGRES_PASSWORD']
    from urllib.parse import quote
    recovery = f'postgres://postgres:{quote(password, safe="")}@127.0.0.1:{database_port}/postgres?sslmode=disable'
    primary = {'movement': {'id': 'primary', 'releaseSha': manifest['sha'], 'recoveryDatabaseUrl': recovery,
                            'databaseToolsImage': manifest['images']['DATABASE_IMAGE'],
                            'provisioner': provisioner},
               'route': {'id': 'primary', 'targets': json.loads(api['CUSTOMER_DOWNSTREAMS_JSON']),
                         'artifactStoreBaseUrl': api['ARTIFACT_STORE_BASE_URL'],
                         'artifactStoreBearerToken': api['ARTIFACT_STORE_BEARER_TOKEN']},
               'bundle': str(bundle), 'releaseSha': manifest['sha']}
    registry = {'version': 1, 'target': target, 'runtimes': [primary]}
    rollout.validate_registry(registry, target)
    if registry_file.exists():
        if json.loads(archive.private_file(registry_file)) != registry:
            raise ValueError('existing runtime registry differs')
    else:
        registry_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        rollout.atomic(registry_file, registry)
    controller = registry_file.parent / 'primary-controller'
    start.install_controller(manifest['images']['PLATFORM_PROVISIONER_IMAGE'], controller, manifest['sha'])
    configuration = registry_file.parent / 'operator.json'
    rollout.atomic(configuration, rollout.operator_config(registry, registry_file.parent / 'customer-movements'))
    cli = [str(controller / 'bun'), str(controller / 'build/move-cli.js'), str(configuration)]
    archive.run([*cli, 'register'])
    archive.run([*cli, 'reconcile', 'primary'])
    archive.run([*cli, 'default', 'primary'])
    print('Original runtime registered with its verified release. Customer placement is unchanged.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('registry', type=Path)
    parser.add_argument('--target', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    initialize(args.bundle.absolute(), args.registry.absolute(), args.target)


if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        raise SystemExit('Runtime registration failed. Existing customer placement and configuration are retained.')
