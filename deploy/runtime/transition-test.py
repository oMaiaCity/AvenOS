#!/usr/bin/env python3
"""Reject unsafe one-time adoption before application or database changes."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import host
import transition

spec = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('prepare-test.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

with tempfile.TemporaryDirectory(prefix='aven-adoption-contract-') as temporary:
    root = Path(temporary)
    source, _ = fixture.fixture(root)
    current = host.composition(source)
    lifecycle = root / 'lifecycle'
    lifecycle.mkdir()
    for fault in ('target', 'release', 'origin', 'catalog'):
        previous = copy.deepcopy(current)
        if fault == 'target': previous['services']['backup']['environment']['BACKUP_ENVIRONMENT'] = 'production'
        if fault == 'release': previous['services']['backup']['environment']['BACKUP_RELEASE_ID'] = 'latest'
        if fault == 'origin': previous['services']['api']['environment']['API_PUBLIC_BASE_URL'] = 'https://wrong.example.test'
        with patch.object(host, 'composition', side_effect=[previous, current]), \
             patch.object(transition, 'catalog', side_effect=[{'schema': 'old'}, {'schema': 'changed'}]), \
             patch.object(transition.archive, 'run') as external:
            try: transition.adopt(source, source, lifecycle, root / 'archive', 'next')
            except ValueError: pass
            else: raise AssertionError('unsafe adoption accepted: '+fault)
            external.assert_not_called()
        assert list(lifecycle.iterdir()) == []
    journal = lifecycle / 'pre-movement-transition.json'
    journal.write_text(json.dumps({'target': 'production', 'destinationSha': 'a'*40, 'phase': 'backed-up'}))
    with patch.object(transition.archive, 'run') as external:
        try: transition.adopt(source, source, lifecycle, root / 'archive', 'next')
        except ValueError: pass
        else: raise AssertionError('cross-target adoption retry accepted')
        external.assert_not_called()

print('Adoption guards passed: wrong target, unpinned predecessor, changed origin/catalog and cross-target retry refused before mutation.')
