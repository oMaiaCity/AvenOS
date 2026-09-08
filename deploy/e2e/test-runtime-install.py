#!/usr/bin/env python3
"""Verify the separate CI runner admits only complete image pulls and strips package auth."""
import os
from pathlib import Path
import subprocess
import tempfile

runner = Path(__file__).with_name('runtime-install.sh')
with tempfile.TemporaryDirectory(prefix='aven-runtime-runner-') as temporary:
    root = Path(temporary)
    log = root / 'commands'
    docker = root / 'docker'
    docker.write_text('''#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PROOF_LOG"
if [[ "${FAIL_PULL:-false}" == true ]]; then exit 17; fi
''')
    bun = root / 'bun'
    bun.write_text('''#!/bin/bash
set -eu
test -z "${NODE_AUTH_TOKEN+x}"
printf 'verified\\n' >> "$PROOF_LOG"
''')
    for file in (docker, bun): file.chmod(0o700)
    env = {**os.environ, 'PATH': str(root)+':'+os.environ['PATH'], 'PROOF_LOG': str(log),
           'E2E_SKIP_IMAGE_BUILD': 'true', 'NODE_AUTH_TOKEN': 'synthetic-package-credential'}
    for key in ('DATABASE', 'API', 'PLATFORM_PROVISIONER', 'INTENT_SERVICE', 'ACTOR_RUNNER', 'ARTIFACT_STORE'):
        env[f'E2E_{key}_IMAGE'] = 'fixture/'+key.lower()+'@sha256:'+'a'*64
    def execute(values):
        log.unlink(missing_ok=True)
        result = subprocess.run(['bash', str(runner)], env=values, capture_output=True, timeout=10)
        return result.returncode, log.read_text().splitlines() if log.exists() else []
    code, commands = execute(env)
    assert code == 0 and commands[-1] == 'verified'
    assert len(commands[:-1]) == 6 and all(command.startswith('pull fixture/') for command in commands[:-1])
    code, commands = execute({**env, 'FAIL_PULL': 'true'})
    assert code == 17 and len(commands) == 1 and 'verified' not in commands
    code, commands = execute({**env, 'E2E_SKIP_IMAGE_BUILD': 'unexpected'})
    assert code == 64 and not commands
    missing = {key: value for key, value in env.items() if key != 'E2E_DATABASE_IMAGE'}
    code, commands = execute(missing)
    assert code == 64 and not commands
    no_auth = {key: value for key, value in env.items() if key != 'NODE_AUTH_TOKEN'}
    code, commands = execute(no_auth)
    assert code == 0 and commands[-1] == 'verified'
    code, commands = execute({**no_auth, 'E2E_SKIP_IMAGE_BUILD': 'false'})
    assert code == 64 and not commands
print('Runtime CI runner rejects missing/failed images and removes package credentials before proof.')
