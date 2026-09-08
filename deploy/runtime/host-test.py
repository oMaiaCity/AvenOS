#!/usr/bin/env python3
"""Verify host release selection and retained runtime boundaries without live resources."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
import host
import prepare

spec = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('prepare-test.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

with tempfile.TemporaryDirectory(prefix='aven-host-plan-') as directory:
    root = Path(directory)
    source, _ = fixture.fixture(root)
    original = {file.name: file.read_bytes() for file in source.iterdir()}
    identity, candidate, manifest, current = host.retain_input(source, root / 'releases')
    assert len(identity) <= 24
    assert host.retain_input(source, root / 'releases')[0] == identity
    assert original == {file.name: file.read_bytes() for file in source.iterdir()}
    destination = copy.deepcopy(current)
    for name in host.CONTROL_SERVICES:
        destination['services'][name]['image'] = 'new-control@sha256:' + 'a'*64
    for name in prepare.SERVICES:
        destination['services'][name]['image'] = 'new-runtime@sha256:' + 'b'*64
    routing = root / 'routing/runtimes.json'
    result = host.merge_control(current, destination, routing)
    for name in prepare.SERVICES:
        assert result['services'][name] == current['services'][name], name
    for name in host.CONTROL_SERVICES:
        assert result['services'][name]['image'] == destination['services'][name]['image']
    assert result['services']['api']['environment']['CUSTOMER_RUNTIMES_FILE'] == '/runtime-routing/runtimes.json'
    assert any(mount['source'] == str(routing.parent) for mount in result['services']['api']['volumes'])
    for mutation in ('credentials', 'network', 'services'):
        invalid = copy.deepcopy(destination)
        if mutation == 'credentials': invalid['services']['database']['environment']['POSTGRES_PASSWORD'] = 'changed'
        if mutation == 'network': invalid['networks']['platform-private']['internal'] = False
        if mutation == 'services': invalid['services'].pop('actor-runner')
        try: host.merge_control(current, invalid, routing)
        except ValueError: pass
        else: raise AssertionError(f'unsafe {mutation} change accepted')
    with patch.object(host.archive, 'run', return_value=b'{"Id":"fixture-image","Size":1024}') as external, \
         patch.object(host.shutil, 'disk_usage', return_value=SimpleNamespace(free=0)):
        try: host.check_capacity(root / 'empty-platform', root, root / 'no-registry', ['fixture'])
        except ValueError as error: assert 'Insufficient lifecycle storage' in str(error)
        else: raise AssertionError('insufficient storage accepted')
        assert all(call.args[0][:3] == ['docker', 'image', 'inspect'] for call in external.call_args_list)
    (candidate / 'Caddyfile').write_text('modified')
    try: host.retain_input(source, root / 'releases')
    except ValueError: pass
    else: raise AssertionError('modified immutable deployment input accepted')

print('Host deployment plan passed: stable retained runtimes, independently updated control, exact resumable inputs, credentials and network transitions refused.')
