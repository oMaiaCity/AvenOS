import { BoundarySignals } from '@avenos/http-boundary'
import { expect, test } from 'vitest'

test('boundary signals have fixed cardinality and never retain arbitrary peer text', () => {
	const summaries: Record<string, unknown>[] = []
	const signals = new BoundarySignals('unit-fixture', (summary) => summaries.push(summary), 0)
	for (let i = 1; i <= 100; i++) signals.record(401, `192.0.2.${i}`)
	signals.record(413, 'private payload must never be retained')
	expect(summaries).toHaveLength(0)
	signals.flush()
	expect(summaries[0]?.authorizationDenied).toBe(100)
	expect(summaries[0]?.inputLimited).toBe(1)
	expect(summaries[0]?.sampledPeers).toHaveLength(8)
	expect(JSON.stringify(summaries)).not.toContain('private payload')
	signals.record(200)
	signals.flush()
	expect(summaries).toHaveLength(1)
})
