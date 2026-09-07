export type MembershipRole = 'owner' | 'admin' | 'member'

// Adding a component or action requires an explicit customer authorization decision.
const policy: Record<string, Record<MembershipRole, readonly string[]>> = {
	'ceo.aven:component:data:artifacts@1': {
		owner: ['artifacts:read', 'artifacts:write'],
		admin: ['artifacts:read', 'artifacts:write'],
		member: ['artifacts:read', 'artifacts:write']
	},
	'ceo.aven:component:data:intents@1': {
		owner: ['intents:read', 'intents:write', 'intents:delete', 'intents:merge'],
		admin: ['intents:read', 'intents:write', 'intents:delete', 'intents:merge'],
		member: ['intents:read', 'intents:write']
	},
	'os.aven:component:actors:run-repository@1': {
		owner: ['actor-runs:read', 'actor-runs:write'],
		admin: ['actor-runs:read', 'actor-runs:write'],
		member: ['actor-runs:read', 'actor-runs:write']
	}
}

export function membershipAllows(
	role: string,
	component: string,
	actions: readonly string[]
): boolean {
	if (!['owner', 'admin', 'member'].includes(role) || !Object.hasOwn(policy, component))
		return false
	const allowed = policy[component][role as MembershipRole]
	return actions.length > 0 && actions.every((action) => allowed.includes(action))
}
