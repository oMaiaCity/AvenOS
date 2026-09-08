#!/usr/bin/env python3
"""Exercise release recovery without a registry or the original configuration."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

spec=importlib.util.spec_from_file_location('archive',Path(__file__).with_name('archive.py'))
archive=importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)
image='postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73'
subprocess.run(['docker','pull',image],check=True,stdout=subprocess.DEVNULL)
with tempfile.TemporaryDirectory(prefix='aven-release-archive-') as temporary:
 root=Path(temporary);bundle=root/'bundle';bundle.mkdir(mode=0o700)
 manifest={'version':1,'sha':'a'*40,'runId':1,'images':{'DATABASE_IMAGE':image}}
 (bundle/'release.json').write_text(json.dumps(manifest))
 (bundle/'.env').write_text(f"DATABASE_IMAGE={image}\nPRIVATE_TEST_VALUE='retained-$PRIVATE_MISSING_VALUE-fixture'\n");os.chmod(bundle/'.env',0o600)
 (bundle/'docker-compose.yml').write_text('services:\n  database:\n    network_mode: none\n    image: ${DATABASE_IMAGE}\n    environment:\n      RECOVERY_FIXTURE: ${PRIVATE_TEST_VALUE}\n  recovery:\n    profiles: [recovery]\n    network_mode: none\n    image: ${DATABASE_IMAGE}\n')
 (bundle/'route.json').write_text('{"id":"fixture"}')
 fleet={'version':1,'registry':{'target':'next'},'images':[image],'bundles':{},'tools':{}}
 (bundle/'fleet.json').write_text(json.dumps(fleet))
 for name in ('db-init.sh','Caddyfile'): (bundle/name).write_text('fixture')
 saved=root/'retained'
 archive.create(bundle,saved,'next')
 selected=(saved/'current.json').read_bytes()
 archive.create(bundle,saved,'next')
 assert (saved/'current.json').read_bytes()==selected
 shutil.rmtree(bundle)
 restored=root/'fresh'
 archive.restore(saved,restored,'next')
 composition=json.loads((restored/'restored-compose.json').read_text())
 assert composition['services']['database']['image'].startswith('sha256:')
 assert composition['services']['database']['pull_policy']=='never'
 assert composition['services']['recovery']['profiles']==['recovery']
 assert (restored/'route.json').read_text()=='{"id":"fixture"}'
 assert json.loads((restored/'fleet.json').read_text())==fleet
 assert composition['services']['database']['environment']['RECOVERY_FIXTURE']=='retained-$$PRIVATE_MISSING_VALUE-fixture'
 subprocess.run(['docker','compose','--project-directory',str(restored),'--file',str(restored/'restored-compose.json'),
                 'run','--rm','--no-deps','--pull','never','database','sh','-c',
                 'test "$RECOVERY_FIXTURE" = \'retained-$PRIVATE_MISSING_VALUE-fixture\''],check=True)
 # Docker load need not retain registry digest aliases. Fault-inject that absence without
 # deleting an image reference that another concurrent fixture may be using.
 original_run=archive.run
 def without_registry_alias(arguments):
  if arguments==['docker','image','inspect','--format','{{.Id}}',image]:
   raise subprocess.CalledProcessError(1,arguments)
  return original_run(arguments)
 archive.run=without_registry_alias
 try: archive.create(restored,root/'retained-again','next')
 finally: archive.run=original_run
 archive.restore(root/'retained-again',root/'second-recovery','next')
 for target,destination in [('production',root/'wrong-target'),('next',restored)]:
  try: archive.restore(saved,destination,target)
  except ValueError: pass
  else: raise AssertionError('unsafe restoration was accepted')
 pointer=json.loads(selected)
 index=saved/pointer['release']/'index.json'
 original=index.read_bytes()
 modified=json.loads(original);modified['releaseSha']='b'*40;index.write_text(json.dumps(modified))
 try: archive.restore(saved,root/'wrong-release','next')
 except ValueError: pass
 else: raise AssertionError('inconsistent release identity was accepted')
 index.write_bytes(original)
 modified=json.loads(original);modified['images'][image]='sha256:'+'0'*64;index.write_text(json.dumps(modified))
 try: archive.restore(saved,root/'wrong-image-map','next')
 except ValueError: pass
 else: raise AssertionError('changed image mapping was accepted')
 index.write_bytes(original)
 config=saved/pointer['release']/'configurations'/pointer['configuration']/'.env'
 config.write_text('corrupt')
 try: archive.restore(saved,root/'corrupt','next')
 except ValueError: pass
 else: raise AssertionError('corrupt configuration was accepted')
print('Release archive proof passed: exact images and private configuration restored offline; wrong target, existing destination and corrupt configuration refused.')
