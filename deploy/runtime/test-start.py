#!/usr/bin/env python3
"""Start the actual prepared generation using immutable images in an isolated local registry."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import uuid
from urllib.parse import urlsplit
import prepare

repository = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('prepare-test.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def run(args, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=1800)
    if result.returncode:
        # This harness receives only synthetic configuration, never deployment secrets.
        raise AssertionError(f'{args[0]} failed: {result.stdout.decode()[-2000:]}\n{result.stderr.decode()}')
    return result.stdout.decode().strip()


def port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def wait(work):
    last = None
    for _ in range(60):
        try: return work()
        except (AssertionError, OSError) as error: last = error
        time.sleep(1)
    raise last


scratch = Path(tempfile.mkdtemp(prefix='aven-runtime-start-'))
test_id = f'aven-runtime-start-{uuid.uuid4().hex[:12]}'
registry = f'{test_id}-registry'
tools_image = 'aven-runtime-test-tools:local'
containers = []
network = f'{test_id}-control'
generation = f'g-{uuid.uuid4().hex[:12]}'
started = time.monotonic()
try:
    run(['docker', 'build', '--file', str(repository / 'deploy/runtime/Dockerfile.test-tools'), '--tag', tools_image, str(repository)])
    operations_image = os.environ.get('E2E_OPERATIONS_IMAGE')
    if operations_image:
        run(['docker', 'pull', operations_image])
    else:
        operations_image = f'{test_id}-operations:local'
        run(['docker', 'build', '--build-arg', 'OS_SECURITY_REFRESH='+test_id, '--file', str(repository / 'deploy/operations/Dockerfile'), '--tag', operations_image, str(repository)])
    run(['bash', str(repository / 'scripts/scan-container-os.sh'), operations_image])
    images = {
        'DATABASE_IMAGE': os.environ.get('E2E_DATABASE_IMAGE', 'aven-e2e-database:local'),
        'API_IMAGE': os.environ.get('E2E_API_IMAGE', 'aven-e2e-api:local'),
        'PLATFORM_PROVISIONER_IMAGE': os.environ.get('E2E_PLATFORM_PROVISIONER_IMAGE', 'aven-e2e-platform-provisioner:local'),
        'INTENT_SERVICE_IMAGE': os.environ.get('E2E_INTENT_SERVICE_IMAGE', 'aven-e2e-intent-service:local'),
        'ACTOR_RUNNER_IMAGE': os.environ.get('E2E_ACTOR_RUNNER_IMAGE', 'aven-e2e-actor-runner:local'),
        'ARTIFACT_STORE_IMAGE': os.environ.get('E2E_ARTIFACT_STORE_IMAGE', 'aven-e2e-artifact-store:local'),
        'OPERATIONS_IMAGE': operations_image
    }
    registry_port, database_port, provisioner_port, control_port = (port() for _ in range(4))
    assert len({registry_port, database_port, provisioner_port, control_port}) == 4
    containers.append(registry)
    run(['docker', 'run', '--detach', '--name', registry, '--publish', f'127.0.0.1:{registry_port}:5000',
         '--mount', f'type=bind,source={scratch},target=/var/lib/registry',
         'registry:3@sha256:1be55279f18a2fe1a74edf2664cac61c1bea305b7b4642dab412e7affdcb3e33'])
    manifest_images = {}
    for key, image in images.items():
        tag = f'127.0.0.1:{registry_port}/fixture/{key.lower()}:test'
        run(['docker', 'tag', image, tag])
        wait(lambda: run(['docker', 'push', tag]))
        digests = json.loads(run(['docker', 'image', 'inspect', '--format', '{{json .RepoDigests}}', tag]))
        manifest_images[key] = next(digest for digest in digests if digest.startswith(tag.rsplit(':', 1)[0] + '@'))
    bundle, values = fixture.fixture(scratch)
    values.update(manifest_images)
    values['BACKUP_RESTIC_REPOSITORY'] = '/var/lib/aven-backups/repository'
    private_key = run(['openssl', 'genpkey', '-algorithm', 'ED25519'])
    public_key = run(['openssl', 'pkey', '-pubout'], private_key.encode())
    values['TENANT_GRANT_PRIVATE_KEY'] = private_key
    values['TENANT_GRANT_PUBLIC_KEY'] = public_key
    (bundle / '.env').write_text('\n'.join(f"{key}='{value}'" for key, value in values.items()))
    revision = run(['git', '-C', str(repository), 'rev-parse', 'HEAD'])
    manifest = {'version': 1, 'sha': revision, 'images': {key: value for key, value in values.items() if key.endswith('_IMAGE')}}
    (bundle / 'release.json').write_text(json.dumps(manifest))
    source = json.loads(run(['docker', 'compose', '--project-directory', str(bundle), 'config', '--format', 'json']))
    run(['docker', 'network', 'create', '--internal', network])
    control = f'{test_id}-database'
    containers.append(control)
    environment = source['services']['database']['environment']
    env_file = scratch / 'control.env'
    env_file.write_text('\n'.join(f'{key}={value}' for key, value in environment.items()))
    env_file.chmod(0o600)
    (bundle / 'db-init.sh').chmod(0o644)
    run(['docker', 'run', '--detach', '--name', control, '--network', network, '--network-alias', 'database',
         '--env-file', str(env_file),
         '--mount', f'type=bind,source={bundle / "db-init.sh"},target=/docker-entrypoint-initdb.d/10-platform.sh,readonly',
         images['DATABASE_IMAGE']])
    wait(lambda: run(['docker', 'exec', control, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'aven_api']))
    access = f'{test_id}-access'
    containers.append(access)
    run(['docker', 'create', '--name', access, '--network', network, '--publish', f'127.0.0.1:{control_port}:5432',
         '--user', '65532:65532', '--entrypoint', 'socat', images['DATABASE_IMAGE'],
         'TCP-LISTEN:5432,reuseaddr,fork', 'TCP:database:5432'])
    run(['docker', 'network', 'connect', 'bridge', access])
    run(['docker', 'start', access])
    wait(lambda: run(['docker', 'run', '--rm', '--network', 'host', images['DATABASE_IMAGE'],
                      'pg_isready', '-h', '127.0.0.1', '-p', str(control_port), '-U', 'postgres']))
    for file in sorted((repository / 'services/aven-api/migrations').iterdir()):
        if '_customer' in file.name or '_runtime' in file.name:
            run(['docker', 'exec', '-i', control, 'psql', '--set=ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'aven_api'], file.read_bytes())
    destination = scratch / generation
    prepare.prepare(bundle, destination, generation, 'next', database_port, provisioner_port,
                    scratch / 'data', network, control_port)
    # Validate the generated operator contract before allocating or starting the runtime.
    run(['bun', '-e', "import { provisionerConfigSchema } from './services/platform-provisioner/src/config.ts'; const value=await Bun.file(process.argv[1]).json(); const result=provisionerConfigSchema.safeParse(value.provisioner); if(!result.success){console.error(result.error.issues.map(i=>i.path.join('.')).join(','));process.exit(1)}", str(destination / 'movement-runtime.json')])
    tool = ['docker', 'run', '--rm', '--network', 'host', '--user', '0',
            '--label', f'aven.lifecycle-fixture={test_id}',
            '--mount', 'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
            '--mount', f'type=bind,source={repository},target={repository},readonly',
            '--mount', f'type=bind,source={scratch},target={scratch}', tools_image]
    start = [*tool, 'python3', str(repository / 'deploy/runtime/start.py'), str(destination), '--target', 'next']
    try:
        run(start)
    except AssertionError:
        observed = json.loads(run(['docker', 'inspect', f'aven-runtime-{generation}-{generation}-database-1',
                                  f'aven-runtime-{generation}-{generation}-database-roles-1',
                                  f'aven-runtime-{generation}-{generation}-artifact-store-provisioner-1']))
        environments = [dict(value.split('=', 1) for value in row['Config']['Env']) for row in observed]
        actual_url = urlsplit(environments[2]['ARTIFACT_STORE_PROVISIONER_DATABASE_URL'])
        print('Fixture credential agreement:', actual_url.password == environments[0]['ARTIFACT_STORE_PROVISIONER_DB_PASSWORD'],
              actual_url.password == environments[1]['ARTIFACT_STORE_PROVISIONER_DB_PASSWORD'], flush=True)
        print(run(['docker', 'logs', '--tail', '45', observed[0]['Id']]), flush=True)
        print(run(['docker', 'logs', '--tail', '30', observed[1]['Id']]), flush=True)
        raise
    first = json.loads(run(['docker', 'compose', '--project-directory', str(destination), 'ps', '--format', 'json']).splitlines()[0])
    run(start)
    assert first['ID'] in run(['docker', 'compose', '--project-directory', str(destination), 'ps', '--format', 'json'])
    names = run(['docker', 'compose', '--project-directory', str(destination), 'ps', '--services']).splitlines()
    assert set(names) == {f'{generation}-{name}' for name in ('database', 'database-access', 'artifact-provisioner-access', 'platform-provisioner', 'artifact-store-provisioner', 'artifact-store', 'actor-runner', 'intent-service', 'backup')}
    inventory = run(['docker', 'compose', '--project-directory', str(destination), 'exec', '-T', f'{generation}-database',
                     'psql', '-U', 'postgres', '-tAc', "SELECT count(*) FROM pg_database WHERE datname IN ('aven_api','aven_checkout','aven_identity')"])
    assert inventory == '0'
    # A target mismatch must produce a failure before altering initialized roles.
    rejected = subprocess.run(['docker', 'compose', '--project-directory', str(destination), 'run', '--rm', '--no-deps',
                               '--env', 'CUSTOMER_PLATFORM_ID=production', f'{generation}-database-roles'],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    assert rejected.returncode != 0
    marker = run(['docker', 'compose', '--project-directory', str(destination), 'exec', '-T', f'{generation}-database',
                  'psql', '-U', 'postgres', '-tAc', "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='postgres'"])
    assert marker == 'aven-platform:next'
    controller = destination / 'controller'
    config = json.loads((destination / 'movement-runtime.json').read_text())
    control_config = {'platformId': 'next', 'controlDatabaseUrl': config['provisioner']['CONTROL_DATABASE_URL'],
                      'archiveDirectory': str(scratch / 'movements'), 'runtimes': [config]}
    movement_file = scratch / 'movement.json'
    movement_file.write_text(json.dumps(control_config)); movement_file.chmod(0o600)
    # Copy as root to preserve the installed controller's private configuration boundary.
    private_movement = destination / 'operator.json'
    run([*tool, 'install', '-m', '0600', str(movement_file), str(private_movement)])
    cli = [*tool, str(controller / 'bun'), str(controller / 'build/move-cli.js'), str(private_movement)]
    run([*cli, 'register'])
    assert json.loads(run([*cli, 'list'])) == []
    run([*cli, 'default', generation])
    selected = run(['docker', 'exec', control, 'psql', '-U', 'postgres', '-d', 'aven_api', '-tAc',
                    'SELECT runtime_id FROM customer_runtime_defaults WHERE singleton'])
    assert selected == generation
    host_spec = importlib.util.spec_from_file_location('host_fixture', Path(__file__).with_name('host-fixture.py'))
    host_fixture = importlib.util.module_from_spec(host_spec)
    host_spec.loader.exec_module(host_fixture)
    host_fixture.exercise(run, tool, scratch, bundle, manifest, port, repository)
    print(f'Runtime installation proof passed in {round(time.monotonic()-started)}s: real images, independent cluster, encrypted backup, installed controller, retry without container replacement, explicit default placement, no cloned control databases.')
finally:
    # A timed-out Docker client can leave its daemon-side controller alive.
    # Stop only this fixture's labeled tools before removing their databases and mounts.
    remaining = subprocess.run(['docker', 'ps', '--all', '--quiet', '--filter', f'label=aven.lifecycle-fixture={test_id}'],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30)
    for container in remaining.stdout.decode().splitlines():
        subprocess.run(['docker', 'rm', '--force', container], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=30)
    destination = scratch / generation
    if (destination / 'docker-compose.yml').exists():
        subprocess.run(['docker', 'compose', '--project-directory', str(destination), '--profile', '*', 'down', '--volumes'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for name in reversed(containers):
        subprocess.run(['docker', 'rm', '--force', '--volumes', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Only this disposable fixture mount is writable in the cleanup container.
    subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--user', '0',
                    '--mount', f'type=bind,source={scratch},target=/fixture', tools_image,
                    'sh', '-c', 'find /fixture -mindepth 1 -delete'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try: scratch.rmdir()
    except OSError: pass
