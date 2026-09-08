#!/usr/bin/env python3
"""Prove initialization restores current service logins but leaves historical roles disabled."""
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

root = Path(__file__).resolve().parents[2]
image = os.environ['RECOVERY_DATABASE_IMAGE']
roles = {
    'identity': ['aven_identity_auth', 'aven_identity_accounts', 'aven_identity_authorization',
                 'aven_identity_migrator', 'aven_backup'],
    'platform': ['aven_checkout_http', 'aven_checkout_webhooks', 'aven_checkout_migrator', 'aven_checkout_email',
                 'aven_checkout_platform_events', 'aven_api_hosting', 'aven_api_authorization', 'aven_api_entitlements',
                 'aven_api_reconciler', 'aven_api_migrator', 'aven_customer_provisioner',
                 'aven_artifact_store_provisioner', 'aven_backup'],
    'runtime': ['aven_customer_provisioner', 'aven_artifact_store_provisioner', 'aven_backup']
}


def run(args, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    if result.returncode: raise AssertionError(result.stderr.decode())
    return result.stdout.decode().strip()


for kind, expected in roles.items():
    name = 'aven-restored-roles-'+uuid.uuid4().hex[:12]
    try:
        run(['docker', 'run', '--detach', '--name', name, '--network', 'none',
             '--env', 'POSTGRES_PASSWORD=fixture-admin', image])
        for attempt in range(60):
            try:
                run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'])
                break
            except AssertionError:
                if attempt == 59: raise
                time.sleep(1)
        sql = ['docker', 'exec', '-i', name, 'psql', '--set=ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA']
        statements = ';'.join('CREATE ROLE '+role+' NOLOGIN' for role in [*expected, 'retired_fixture_role'])
        statements += ";COMMENT ON DATABASE postgres IS 'aven-platform:next';"
        run(sql, statements.encode())
        script = (root / 'deploy' / kind / 'db-init.sh').read_text()
        variables = set(re.findall(r'\$\{([A-Z_]+)', script)) | set(re.findall(r'\$([A-Z_]+)', script))
        environment = {key: 'fixture-password-which-is-not-a-secret' for key in variables}
        environment.update(POSTGRES_USER='postgres', PGPASSWORD='fixture-admin', CUSTOMER_PLATFORM_ID='next')
        arguments = ['docker', 'exec', '-i']
        for key, value in environment.items(): arguments += ['--env', key+'='+value]
        run([*arguments, name, 'sh'], script.encode())
        for role in expected:
            assert run(sql, f"SELECT rolcanlogin FROM pg_roles WHERE rolname='{role}';".encode()) == 't', role
        assert run(sql, b"SELECT rolcanlogin FROM pg_roles WHERE rolname='retired_fixture_role';") == 'f'
        if kind != 'identity':
            assert run(sql, b"SELECT rolcreatedb AND rolcreaterole AND NOT rolinherit FROM pg_roles WHERE rolname='aven_customer_provisioner';") == 't'
        login, database = {'identity': ('aven_identity_auth', 'aven_identity'),
                           'platform': ('aven_api_authorization', 'aven_api'),
                           'runtime': ('aven_customer_provisioner', 'postgres')}[kind]
        assert run(['docker', 'exec', '--env', 'PGPASSWORD=fixture-password-which-is-not-a-secret', name,
                    'psql', '-h', '127.0.0.1', '-U', login, '-d', database, '-tAc', 'SELECT 1']) == '1'
    finally:
        subprocess.run(['docker', 'rm', '--force', '--volumes', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print('Restored-role proof passed for identity, platform and customer runtime: intended service logins work; historical roles stay disabled.')
