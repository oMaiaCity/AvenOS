#!/usr/bin/env python3
"""Validate runtime preparation against the production Compose source."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlsplit
import prepare


def fixture(root):
    repository = Path(__file__).resolve().parents[2]
    bundle = root / 'source'
    bundle.mkdir(mode=0o700)
    compose = (repository / 'deploy/platform/docker-compose.yml').read_text()
    values = {key: hashlib.sha256(key.encode()).hexdigest()
              for key in re.findall(r'\$\{([A-Z_][A-Z0-9_]+)', compose)}
    for key in values:
        if key.endswith('_IMAGE'):
            values[key] = f'fixture/{key.lower()}@sha256:' + 'a' * 64
    values.update({
        'BACKUP_ENVIRONMENT': 'next', 'API_DOMAIN': 'api.fixture.invalid',
        'API_PUBLIC_BASE_URL': 'https://api.fixture.invalid',
        'BACKUP_RESTIC_REPOSITORY': 's3:https://backup.fixture.invalid/next/platform',
        'BACKUP_INTERVAL_SECONDS': '3600', 'BACKUP_MAX_AGE_SECONDS': '7200',
        'SYSTEM_SITES_JSON': '[]', 'DOWNSTREAMS_JSON': '[]', 'CUSTOMER_RUNTIMES_JSON': '[]',
        'CUSTOMER_RUNTIME_ID': 'primary',
        'CUSTOMER_DOWNSTREAMS_JSON': json.dumps([
            {'segment': 'artifacts', 'baseUrl': 'http://artifact-store:8087',
             'bearerToken': values['ARTIFACT_STORE_SERVICE_TOKEN'], 'targetPrefix': '/v1'},
            {'segment': 'intents', 'baseUrl': 'http://intent-service:3010',
             'bearerToken': values['INTENT_SERVICE_TOKEN'], 'targetPrefix': '/api/intents'}
        ])
    })
    (bundle / '.env').write_text('\n'.join(f"{key}='{value}'" for key, value in values.items()))
    (bundle / '.env').chmod(0o600)
    (bundle / 'docker-compose.yml').write_text(compose)
    for name in ('Caddyfile', 'db-init.sh'):
        (bundle / name).write_bytes((repository / 'deploy/platform' / name).read_bytes())
    (bundle / 'release.json').write_text(json.dumps({
        'version': 1, 'sha': 'b'*40, 'images': {key: value for key, value in values.items() if key.endswith('_IMAGE')}
    }))
    return bundle, values


def main():
    with tempfile.TemporaryDirectory(prefix='aven-runtime-preparation-') as temporary:
        root = Path(temporary)
        bundle, original = fixture(root)
        inputs = {file.name: file.read_bytes() for file in bundle.iterdir()}
        destination = root / 'green'
        arguments = (bundle, destination, 'green', 'next', 15432, 18088, root / 'data', 'fixture-control')
        try: prepare.prepare(*arguments)
        except subprocess.CalledProcessError as error:
            raise AssertionError(error.stderr.decode()) from error
        outputs = {file.name: file.read_bytes() for file in destination.iterdir()}
        prepare.prepare(*arguments)
        assert outputs == {file.name: file.read_bytes() for file in destination.iterdir()}
        assert inputs == {file.name: file.read_bytes() for file in bundle.iterdir()}
        compose = json.loads(outputs['docker-compose.yml'])
        services = compose['services']
        assert set(services) == {f'green-{name}' for name in prepare.SERVICES}
        assert 'aven_api' not in outputs['db-init.sh'].decode()
        assert 'aven_checkout' not in outputs['db-init.sh'].decode()
        assert compose['networks']['platform-private'] == {'external': True, 'name': 'fixture-control'}
        for service in services.values():
            assert service['pull_policy'] == 'never'
            assert service['read_only'] is True
            assert service['cap_drop'] == ['ALL']
            assert set(service.get('depends_on', {})).issubset(services)
            for port in service.get('ports', []): assert port['host_ip'] == '127.0.0.1'
        provisioner = services['green-platform-provisioner']['environment']
        assert '@database/aven_api' in provisioner['CONTROL_DATABASE_URL']
        assert '@green-database/postgres' in provisioner['CLUSTER_DATABASE_URL']
        assert provisioner['INTENTS_API_DB_CREDENTIAL_ROOT'] != original['INTENT_DATABASE_CREDENTIAL_ROOT']
        artifact_url = urlsplit(services['green-artifact-store-provisioner']['environment']['ARTIFACT_STORE_PROVISIONER_DATABASE_URL'])
        assert artifact_url.hostname == 'green-database'
        assert artifact_url.password == services['green-database']['environment']['ARTIFACT_STORE_PROVISIONER_DB_PASSWORD']
        assert services['green-intent-service']['environment']['INTENT_DATABASE_CREDENTIAL_ROOT'] == provisioner['INTENTS_API_DB_CREDENTIAL_ROOT']
        assert services['green-actor-runner']['environment']['ARTIFACT_STORE_BASE_URL'] == 'http://green-artifact-store:8087'
        gateway = urlsplit(services['green-actor-runner']['environment']['LLM_GATEWAY_BASE_URL'])
        assert gateway == ('http', 'api:3000', '/internal/v1/llm', '', '')
        assert services['green-backup']['environment']['RESTIC_REPOSITORY'].endswith('/next/platform/runtimes/green')
        assert services['green-backup']['profiles'] == ['backup']
        assert services['green-restore']['command'] == ['restore']
        assert services['green-restore']['environment']['PGHOST'] == 'green-database'
        assert not services['green-database'].get('ports')
        assert set(services['green-database']['networks']) == {'platform-private'}
        assert not services['green-artifact-store-provisioner'].get('ports')
        for name in ('green-database-access', 'green-artifact-provisioner-access'):
            assert not services[name].get('environment')
            assert services[name]['user'] == '65532:65532'
        assert services['green-backup']['environment']['RESTIC_PASSWORD'] == original['BACKUP_RESTIC_PASSWORD']
        assert len({provisioner[key] for key in ('INTENTS_API_DB_CREDENTIAL_ROOT', 'ACTOR_API_DB_CREDENTIAL_ROOT',
                                                'ACTOR_WORKER_DB_CREDENTIAL_ROOT', 'ARTIFACT_API_DB_CREDENTIAL_ROOT')}) == 4
        assert services['green-database']['volumes'][0]['source'] == str(root / 'data/green/postgres')
        route = json.loads(outputs['route.json'])
        assert route['targets'][1]['baseUrl'] == 'http://green-intent-service:3010'
        assert route['artifactStoreBearerToken'] == services['green-artifact-store']['environment']['ARTIFACT_STORE_BEARER_TOKEN']
        movement = json.loads(outputs['movement-runtime.json'])
        assert '@127.0.0.1:15432/' in movement['recoveryDatabaseUrl']
        assert '@127.0.0.1:5432/aven_api' in movement['provisioner']['CONTROL_DATABASE_URL']
        for file in destination.iterdir():
            if file.name != 'db-init.sh': assert file.stat().st_mode & 0o077 == 0
        for wrong in [
            (bundle, root / 'wrong', 'green', 'production', 15432, 18088, root / 'data', 'fixture-control'),
            (bundle, destination, 'green', 'next', 15433, 18088, root / 'data', 'fixture-control'),
            (bundle, root / 'primary', 'primary', 'next', 15432, 18088, root / 'data', 'fixture-control'),
            (bundle, root / 'ports', 'green', 'next', 15432, 15432, root / 'data', 'fixture-control')
        ]:
            try: prepare.prepare(*wrong)
            except ValueError: pass
            else: raise AssertionError('unsafe runtime preparation accepted')
        (destination / 'route.json').write_text('{}')
        try: prepare.prepare(*arguments)
        except ValueError: pass
        else: raise AssertionError('modified runtime accepted')
    
    print('Runtime preparation passed: separate database, credentials, service routes and backup; stable control authority; immutable resumable output; no customer placement changes.')


if __name__ == "__main__": main()
