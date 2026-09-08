#!/usr/bin/env python3
"""Exercise interrupted cohort rollout against a deterministic movement authority."""
import copy
import json
import uuid
import rollout


class Authority:
    def __init__(self):
        self.customers = [{'id': str(uuid.uuid4()), 'runtime_id': 'primary', 'routing_generation': 1,
                           'movement_id': None} for _ in range(3)]
        self.movements = {}
        self.calls = []
        self.fail_after = None

    def cli(self, action, *args):
        self.calls.append((action, *args))
        if action == 'list': return json.dumps(self.customers)
        if action == 'status': return json.dumps(self.movements[args[0]])
        if action == 'begin':
            environment, source, destination, generation, operation = args
            customer = next(entry for entry in self.customers if entry['id'] == environment)
            assert customer['runtime_id'] == source and str(customer['routing_generation']) == generation
            assert customer['movement_id'] is None
            customer['movement_id'] = operation
            self.movements[operation] = {'id': operation, 'destination_runtime_id': destination,
                                        'mode': 'move', 'phase': 'paused'}
            return ''
        if action == 'resume':
            operation = self.movements[args[0]]
            if self.fail_after == len([m for m in self.movements.values() if m['phase'] == 'completed']):
                raise OSError('injected interrupted controller')
            customer = next(entry for entry in self.customers if entry['movement_id'] == args[0])
            customer.update(runtime_id=operation['destination_runtime_id'],
                            routing_generation=customer['routing_generation']+1, movement_id=None)
            operation['phase'] = 'completed'
            return json.dumps(operation)
        raise AssertionError(action)


authority = Authority()
authority.fail_after = 1
try: rollout.move_customers(authority.cli, 'green')
except OSError: pass
else: raise AssertionError('interruption ignored')
assert [customer['runtime_id'] for customer in authority.customers] == ['green', 'primary', 'primary']
assert authority.customers[1]['movement_id'] is not None
held = authority.customers[1]['movement_id']
authority.fail_after = None
assert rollout.move_customers(authority.cli, 'green') == 2
assert len([call for call in authority.calls if call[0] == 'begin']) == 3
assert ('resume', held) in authority.calls
assert rollout.move_customers(authority.cli, 'green') == 0
assert all(customer['routing_generation'] == 2 for customer in authority.customers)

for mode, destination in [('rollback', 'green'), ('move', 'blue')]:
    authority = Authority()
    customer = authority.customers[0]
    operation = str(uuid.uuid4())
    authority.cli('begin', customer['id'], 'primary', destination, '1', operation)
    authority.movements[operation]['mode'] = mode
    before = copy.deepcopy(authority.customers)
    try: rollout.move_customers(authority.cli, 'green')
    except ValueError: pass
    else: raise AssertionError('conflicting customer operation accepted')
    assert authority.customers == before
    assert not any(call[0] == 'resume' for call in authority.calls)

print('Cohort rollout retries pass: partial activation retained, held operation resumed once, retries idempotent, conflicting operations refused.')
