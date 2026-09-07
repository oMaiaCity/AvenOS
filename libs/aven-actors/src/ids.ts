declare const resourceIdKind: unique symbol

export type ActorResourceKind =
	| 'actor'
	| 'capability'
	| 'factory'
	| 'offer'
	| 'schema'
	| 'skill'
	| 'policy'
	| 'protocol'
	| 'assurance'
	| 'action'
	| 'entitlement'

/** Identity principals, authentication, assurance, and verifiable authorization evidence. */
export const AVEN_ID_AUTHORITY = 'id.aven' as const
/** Product-neutral AvenOS runtime and execution contracts. */
export const AVEN_RUNTIME_AUTHORITY = 'os.aven' as const
/** avenCEO product, domain, artifact, and data-plane contracts. */
export const AVEN_CEO_AUTHORITY = 'ceo.aven' as const
export type AvenAuthority =
	| typeof AVEN_ID_AUTHORITY
	| typeof AVEN_RUNTIME_AUTHORITY
	| typeof AVEN_CEO_AUTHORITY

/** A globally qualified, kind-safe catalog identity. */
export type ResourceId<Kind extends ActorResourceKind> = string & {
	readonly [resourceIdKind]: Kind
}

export interface ResourceName<Kind extends ActorResourceKind> {
	authority: string
	kind: Kind
	namespace: string
	name: string
	version: string
}

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/
const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/

/**
 * Canonical form: `authority:kind:namespace:name@version`.
 *
 * Authorities should be reverse-DNS names (`id.aven`, `os.aven`, `ceo.aven`,
 * `com.example`) so independent catalogs can merge without coordinating local names.
 */
export function resourceId<Kind extends ActorResourceKind>(
	name: ResourceName<Kind>
): ResourceId<Kind> {
	for (const [label, value] of [
		['authority', name.authority],
		['namespace', name.namespace],
		['name', name.name]
	] as const) {
		if (typeof value !== 'string' || !SEGMENT.test(value))
			throw new Error(`invalid resource ${label}: ${value}`)
	}
	if (typeof name.version !== 'string' || !VERSION.test(name.version))
		throw new Error(`invalid resource version: ${name.version}`)
	return `${name.authority}:${name.kind}:${name.namespace}:${name.name}@${name.version}` as ResourceId<Kind>
}

export function parseResourceId<Kind extends ActorResourceKind>(
	id: ResourceId<Kind>
): ResourceName<Kind> {
	const match = /^([^:]+):([^:]+):([^:]+):([^@]+)@(.+)$/.exec(id)
	if (!match) throw new Error(`invalid resource id: ${id}`)
	const [, authority, kind, namespace, name, version] = match
	if (!authority || !kind || !namespace || !name || !version)
		throw new Error(`invalid resource id: ${id}`)
	return { authority, kind: kind as Kind, namespace, name, version }
}

export type ActorDefinitionId = ResourceId<'actor'>
export type CapabilityId = ResourceId<'capability'>
export type ActorFactoryId = ResourceId<'factory'>
export type ActorOfferId = ResourceId<'offer'>
export type SchemaId = ResourceId<'schema'>
export type SkillId = ResourceId<'skill'>
export type PolicyId = ResourceId<'policy'>
export type ProtocolId = ResourceId<'protocol'>
export type AssuranceId = ResourceId<'assurance'>
export type ActionId = ResourceId<'action'>
export type EntitlementId = ResourceId<'entitlement'>
