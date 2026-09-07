import { expect, test } from 'bun:test'
import { releaseRules } from './release-rules.js'

test('release update authority and mandatory checks are independent', () => {
	const [authority, gate] = releaseRules()
	expect(authority.conditions.ref_name.include).toEqual(['refs/heads/next', 'refs/heads/prod'])
	expect(authority.bypass_actors).toEqual([
		{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }
	])
	expect(gate.bypass_actors).toEqual([])
	expect(gate.rules.map((rule) => rule.type)).toEqual(['pull_request', 'required_status_checks'])
	expect(JSON.stringify(gate)).toContain('Platform release gate')
	expect(JSON.stringify(gate)).toContain('15368')
	expect(JSON.stringify(releaseRules())).not.toContain('DeployKey')
})
