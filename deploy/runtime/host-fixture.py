"""Host-controller proof with real customer services and inert commerce/edge dependencies.

The separate native journey proves commerce and edge behavior. This fixture isolates
the host lifecycle, actual API admission, credentials, PostgreSQL movement and backups.
"""
import copy
import datetime
import json
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
import uuid
import host


def exercise(run, tool, scratch, source, manifest, port, repository):
    volume = scratch / 'host-volume'
    platform = scratch / 'host-platform'
    bundle = scratch / 'host-input'
    bundle.mkdir(mode=0o700)
    config = host.composition(source)
    project = f'aven-host-fixture-{uuid.uuid4().hex[:10]}'
    config['name'] = project
    for name, network in config['networks'].items(): network['name'] = f'{project}-{name}'
    services = config['services']
    database_port, provisioner_port, api_port = port(), port(), port()
    services['database-access']['ports'][0]['published'] = str(database_port)
    services['artifact-provisioner-access']['ports'][0]['published'] = str(provisioner_port)
    services['api']['ports'] = [{'target': 3000, 'published': str(api_port), 'host_ip': '127.0.0.1', 'protocol': 'tcp'}]
    api = services['api']['environment']
    api.update(LLM_GATEWAY_ENABLED='false', LLM_GATEWAY_MODELS_JSON='[]', LLM_GATEWAY_CREDENTIALS_JSON='{}',
               LLM_GATEWAY_TIMEOUT_SECONDS='180', SITE_HOST_PUBLIC_IPV4='192.0.2.1', SITE_HOST_PUBLIC_IPV6='',
               CORS_ORIGINS='', CUSTOMER_RUNTIMES_FILE='', IDENTITY_JWKS_URL='http://identity-fixture:9000/jwks')
    routes = json.loads(api['CUSTOMER_DOWNSTREAMS_JSON'])
    for route in routes:
        component = 'ceo.aven:component:data:' + route['segment'] + '@1'
        route.update(componentRef=component, readAction=route['segment']+':read', writeAction=route['segment']+':write')
        if route['segment'] == 'intents': route['targetPrefix'] = '/api/intents'
    api['CUSTOMER_DOWNSTREAMS_JSON'] = json.dumps(routes)
    services['api-migrate']['environment'] = copy.deepcopy(api)
    for name in ('intent-service', 'actor-runner'):
        services[name]['environment']['IDENTITY_JWKS_URL'] = api['IDENTITY_JWKS_URL']
    fixture_manifest = copy.deepcopy(manifest)
    for name in host.CONTROL_SERVICES:
        if name in ('api', 'api-migrate'): continue
        one_shot = name in ('checkout-migrate', 'checkout-billing-sync')
        dependencies = copy.deepcopy(services[name].get('depends_on', {}))
        services[name] = {'image': manifest['images']['DATABASE_IMAGE'], 'user': '65532:65532',
                          'entrypoint': ['sh', '-c'], 'command': ['exit 0' if one_shot else 'sleep infinity'],
                          'restart': 'no' if one_shot else 'unless-stopped', 'read_only': True,
                          'cap_drop': ['ALL'], 'networks': ['platform-private'], 'depends_on': dependencies}
        if not one_shot:
            services[name]['healthcheck'] = {'test': ['CMD', 'true'], 'interval': '1s', 'retries': 10}
    for service in services.values():
        for mount in service.get('volumes', []):
            if mount['source'].startswith('/var/lib/aven/'):
                mount['source'] = str(volume / mount['source'][len('/var/lib/aven/'):])
        if service['image'] not in fixture_manifest['images'].values():
            raise AssertionError('fixture image is missing')
    (bundle / 'docker-compose.yml').write_text(json.dumps(config))
    (bundle / 'docker-compose.yml').chmod(0o600)
    (bundle / '.env').write_text(''); (bundle / '.env').chmod(0o600)
    (bundle / 'release.json').write_text(json.dumps(fixture_manifest))
    for name in ('db-init.sh', 'Caddyfile'): (bundle / name).write_bytes((source / name).read_bytes())
    diagnostic_entry = f'''import sys,subprocess
sys.path.insert(0,{str(repository / 'deploy/runtime')!r})
import host
try: host.main()
except subprocess.CalledProcessError as error:
 print(error.stderr.decode()[-6000:],file=sys.stderr)
 raise
'''
    command = [*tool, 'python3', '-c', diagnostic_entry, str(bundle),
               '--target', 'next', '--platform', str(platform), '--volume', str(volume)]
    identity_container = f'{project}-identity'
    try:
        # Identity is an independent, already-running dependency of a platform deployment.
        run(['docker', 'network', 'create', '--internal',
             '--label', 'com.docker.compose.project='+project,
             '--label', 'com.docker.compose.network=platform-private', config['networks']['platform-private']['name']])
        subject = str(uuid.uuid4())
        keys = json.loads(run(['bun', '-e', '''import {generateKeyPair,exportJWK,SignJWT} from 'jose';
            const keys=await generateKeyPair('EdDSA',{extractable:true}); const key=await exportJWK(keys.publicKey);
            key.kid='fixture'; key.alg='EdDSA'; const token=await new SignJWT({sid:'host-fixture',email:'customer@example.test',email_verified:true,role:'user',amr:['passkey'],scope:'services:access'}).setProtectedHeader({alg:'EdDSA',kid:'fixture'})
            .setIssuer('https://aven.id').setAudience('aven-services').setSubject(process.argv[1]).setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
            console.log(JSON.stringify({jwks:{keys:[key]},token}));''', subject]))
        fixture_file = scratch / 'host-identity.ts'
        fixture_file.write_text('Bun.serve({port:9000,fetch:()=>Response.json(' + json.dumps(keys['jwks']) + ')});')
        fixture_file.chmod(0o644)
        run(['docker', 'run', '--detach', '--name', identity_container,
             '--network', config['networks']['platform-private']['name'], '--network-alias', 'identity-fixture',
             '--mount', f'type=bind,source={fixture_file},target=/fixture.ts,readonly',
             '--entrypoint', 'bun', manifest['images']['PLATFORM_PROVISIONER_IMAGE'], '/fixture.ts'])
        # Build an ordinary primary installation, stopping at the boundary before any
        # additional runtime exists. This is a fixture hook, never a deployment option.
        baseline_entry = diagnostic_entry.replace('try: host.main()', """class BaselineReady(Exception): pass
def stop_before_runtime(*args,**kwargs): raise BaselineReady()
host.prepare.prepare=stop_before_runtime
try: host.main()
except BaselineReady: pass""")
        run([*tool, 'python3', '-c', baseline_entry, str(bundle), '--target', 'next',
             '--platform', str(platform), '--volume', str(volume)])
        primary_container = run([*tool, 'docker', 'compose', '--project-directory', str(platform), 'ps', '--quiet', 'database'])
        print('Host fixture: primary installation is backed up; proving authenticated customer access before adoption.', flush=True)
        reachable = run([*tool, 'docker', 'compose', '--project-directory', str(platform),
                         'exec', '-T', 'api', 'bun', '-e',
                         "const r=await fetch(process.env.IDENTITY_JWKS_URL);const j=await r.json();if(!r.ok||j.keys?.length!==1)process.exit(1);console.log(process.env.IDENTITY_ISSUER,process.env.IDENTITY_AUDIENCE)"])
        assert reachable == 'https://aven.id aven-services'
        origin = f'http://127.0.0.1:{api_port}'
        def request(path, token, data=None):
            req = urllib.request.Request(origin+path, data=None if data is None else json.dumps(data).encode(),
                                         headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=15) as response: return json.load(response)
            except urllib.error.HTTPError as error:
                raise AssertionError(f'Fixture HTTP {error.code}: {error.read(8192).decode()}') from error
        customer = request('/internal/v1/customer-entitlement-events', api['CUSTOMER_ENTITLEMENT_TOKEN'],
                           {'eventId': str(uuid.uuid4()), 'eventType': 'purchase_granted', 'subjectId': subject,
                            'purchasedName': 'host-fixture', 'occurredAt': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')})['environmentId']
        run([*tool, 'python3', '-c', f"import sys;sys.path.insert(0,{str(repository / 'deploy/runtime')!r});import host;from pathlib import Path;host.wait_reconciliation(Path({str(platform)!r}))"])
        path = f'/api/environments/{customer}/intents'
        request('/api/environments', keys['token'])
        intent = str(uuid.uuid4())
        request(path, keys['token'], {'id': intent, 'title': 'Retain this customer across host rollout ☃'})
        before = request(path+'/'+intent, keys['token'])
        # Reproduce the pre-movement boundary: an unmarked primary cluster without
        # execution metadata or a local runtime registry. The schema catalog stays exact.
        quiesce = f'''import sys
from pathlib import Path
sys.path.insert(0,{str(repository / 'deploy/runtime')!r})
import host
platform=Path({str(platform)!r}); volume=Path({str(volume)!r})
config=host.composition(platform)
compose=['docker','compose','--project-directory',str(platform)]
services=[name for name,service in config['services'].items() if name!='database' and service.get('restart') not in ('no',None) and not service.get('profiles')]
services.append('backup')
host.archive.run([*compose,'stop','--timeout','30',*services])
for database,sql in [('postgres','COMMENT ON DATABASE postgres IS NULL'),
 ({('cust_'+customer.replace('-', ''))!r},'ALTER TABLE aven_platform.environment_identity DROP COLUMN execution_enabled, DROP COLUMN execution_unsettled')]:
 host.archive.run([*compose,'exec','-T','database','psql','--set=ON_ERROR_STOP=1','-U','postgres','-d',database,'-c',sql])
for name in ('registry.json','baseline.json'):
 (volume/'lifecycle'/name).unlink()
'''
        run([*tool, 'python3', '-c', quiesce])
        run(command)
        adoption = json.loads(run([*tool, 'cat', str(volume / 'lifecycle/pre-movement-transition.json')]))
        assert adoption['phase'] == 'backed-up' and adoption['target'] == 'next'
        assert primary_container == run([*tool, 'docker', 'compose', '--project-directory', str(platform), 'ps', '--quiet', 'database'])
        assert request(path+'/'+intent, keys['token']) == before
        registry = json.loads(run([*tool, 'cat', str(volume / 'lifecycle/registry.json')]))
        first = next(entry for entry in registry['runtimes'] if entry['movement']['id'] != 'primary')
        first_bundle = first['bundle']
        first_database = f'{first["movement"]["id"]}-database'
        first_container = run([*tool, 'docker', 'compose', '--project-directory', first_bundle, 'ps', '--quiet', first_database])
        print('Host fixture: quiesced adoption and first customer move passed.', flush=True)
        # A distinct immutable input revision creates a second runtime, using the same tested image digests.
        print('Host fixture: customer HTTP data written; installing the second runtime.', flush=True)
        (bundle / '.env').write_text('# second installation configuration\n')
        run(command)
        assert request(path+'/'+intent, keys['token']) == before
        final = json.loads(run([*tool, 'cat', str(volume / 'lifecycle/registry.json')]))
        assert len(final['runtimes']) == 3
        assert first_container == run([*tool, 'docker', 'compose', '--project-directory', first_bundle, 'ps', '--quiet', first_database])
        final_bundle = final['runtimes'][-1]['bundle']
        final_database = final['runtimes'][-1]['movement']['id']+'-database'
        current_container = run([*tool, 'docker', 'compose', '--project-directory', final_bundle, 'ps', '--quiet', final_database])
        run(command)
        assert current_container == run([*tool, 'docker', 'compose', '--project-directory', final_bundle, 'ps', '--quiet', final_database])
        assert request(path+'/'+intent, keys['token']) == before
        print('Host fixture: two customer rollouts and retry passed; recovering from encrypted backups after removing databases and configuration.', flush=True)
        for entry in reversed(final['runtimes']):
            run([*tool, 'docker', 'compose', '--project-directory', entry['bundle'], '--profile', '*', 'down', '--volumes'])
        # The identity provider is independent and remains available. Only encrypted repositories
        # survive this simulated platform-host loss; no database directory or release file is copied.
        offhost = scratch / 'offhost-repositories'
        preserve = f'''import os,shutil
from pathlib import Path
volume=Path({str(volume)!r}); platform=Path({str(platform)!r}); offhost=Path({str(offhost)!r})
assert str(volume).startswith('/tmp/aven-runtime-start-') and volume.name=='host-volume'
roots=[volume/'backups',*sorted((volume/'runtimes').glob('*/backups'))]
for root in roots:
 repository=root/'repository'
 if repository.exists(): shutil.copytree(repository,offhost/root.relative_to(volume)/'repository')
shutil.rmtree(volume); shutil.rmtree(platform)
for repository in offhost.glob('**/repository'):
 destination=volume/repository.relative_to(offhost)
 destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 shutil.copytree(repository,destination)
 for parent,directories,files in os.walk(destination.parent):
  for path in [Path(parent),*[Path(parent)/name for name in directories+files]]: os.chown(path,65532,65532)
'''
        run([*tool, 'python3', '-c', preserve])
        recovery_entry = diagnostic_entry.replace('import host', 'import recover').replace('host.main()', 'recover.main()')
        run([*tool, 'python3', '-c', recovery_entry, str(bundle), '--target', 'next',
             '--platform', str(platform), '--volume', str(volume)])
        assert request(path+'/'+intent, keys['token']) == before
        restored_intent = str(uuid.uuid4())
        request(path, keys['token'], {'id': restored_intent, 'title': 'Customer writes after fresh fleet recovery'})
        assert request(path+'/'+restored_intent, keys['token'])['id'] == restored_intent
        evidence = json.loads(run([*tool, 'cat', str(volume / 'recovery/complete.json')]))
        assert evidence['customerCount'] == 1 and evidence['actorExecution'] == 'paused'
        print('Hosted lifecycle proof passed: authenticated customer writes, quiesced pre-movement adoption, two runtime deployments, retained old cluster, idempotent retry, loss of all databases and release configuration, exact encrypted fleet recovery, unchanged customer data and new authenticated writes.', flush=True)
    except Exception as error:
        print(str(error), flush=True)
        for arguments in (['ps', '--all'], ['logs', '--no-color', '--tail', '40', 'database-roles', 'api-migrate', 'api', 'platform-provisioner']):
            try: print(run([*tool, 'docker', 'compose', '--project-directory', str(platform), *arguments]), flush=True)
            except AssertionError as error: print(str(error), flush=True)
        raise
    finally:
        subprocess.run(['docker', 'rm', '--force', identity_container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            prepared = run([*tool, 'find', str(volume / 'lifecycle/releases'), '-path', '*/runtime/docker-compose.yml', '-type', 'f']).splitlines()
        except AssertionError: prepared = []
        for file in prepared:
            subprocess.run([*tool, 'docker', 'compose', '--project-directory', str(Path(file).parent), '--profile', '*', 'down', '--volumes'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try: registry = json.loads(run([*tool, 'cat', str(volume / 'lifecycle/registry.json')]))
        except AssertionError: registry = None
        if registry:
            for runtime in reversed(registry['runtimes']):
                subprocess.run([*tool, 'docker', 'compose', '--project-directory', runtime['bundle'], '--profile', '*', 'down', '--volumes'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run([*tool, 'docker', 'compose', '--project-directory', str(platform), '--profile', '*', 'down', '--volumes'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['docker', 'network', 'rm', config['networks']['platform-private']['name']],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
