import { describe, expect, test } from 'bun:test'
import { Actor, compositeInterface } from '../src/lib/actors/actor'

const TEST_MANIFEST_IDENTITY = {
	authority: 'ceo.aven',
	namespace: 'tests.composition',
	version: '1'
} as const

/**
 * The merge law (0148): a composite's interface is DERIVED from its members —
 * requires = what members need and nobody inside provides; produces =
 * everything the members offer. Internal functors disappear from the skin,
 * exactly the Prolog rule `skill(X,Z) :- a(X,Y), b(Y,Z)` losing Y.
 */

const leaf = (id: string, requires: string[], produces: string[]) =>
	new Actor({
		id,
		...TEST_MANIFEST_IDENTITY,
		name: id,
		description: '',
		tags: [],
		methods: [],
		requires,
		produces
	})

describe('compositeInterface — derive, never store', () => {
	test('the internal functor is hidden, the boundary exposed', () => {
		// a: X → Y, b: Y → Z. The composite is X → Z; Y is internal.
		const a = leaf('a', ['x(V)'], ['y(V)'])
		const b = leaf('b', ['y(V)'], ['z(V)'])
		const skin = compositeInterface([a, b])
		expect(skin.requires).toEqual(['x(V)'])
		expect(skin.produces.sort()).toEqual(['y(V)', 'z(V)'])
	})

	test('matching is unification, not string equality', () => {
		// b requires y(Q) — a different variable name than a's y(V). Unification
		// still binds them, so y stays internal.
		const a = leaf('a', ['x(V)'], ['y(V)'])
		const b = leaf('b', ['y(Q)'], ['z(Q)'])
		expect(compositeInterface([a, b]).requires).toEqual(['x(V)'])
	})

	test('a composite ACTOR derives its contracts from its members', () => {
		const a = leaf('a', ['intake(I)'], ['item(I)'])
		const b = leaf('b', ['item(I)'], ['filed(I)'])
		const skill = leaf('skill', [], [])
		skill.members = [a, b]
		// The composite's skin IS the merge — nothing was declared on it.
		expect(skill.requires).toEqual(['intake(I)'])
		expect(skill.produces).toContain('filed(I)')
		// One level deeper: a composite of composites, same law (fractal).
		const c = leaf('c', ['filed(I)'], ['archived(I)'])
		const outer = leaf('outer', [], [])
		outer.members = [skill, c]
		expect(outer.requires).toEqual(['intake(I)'])
		expect(outer.produces).toContain('archived(I)')
	})
})
