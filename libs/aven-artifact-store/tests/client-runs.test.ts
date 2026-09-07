import { describe, expect, test } from 'bun:test'
import {
	type ClientArtifactGateway,
	type ClientRunPublication,
	QueuedClientArtifactGateway
} from '../src/client-runs'

function run(publicationId: string): ClientRunPublication {
	return {
		publicationId,
		procedureKey: 'test.procedure',
		procedureVersion: 'client-v1',
		inputs: [],
		parameters: {},
		artifacts: [],
		evidence: []
	}
}

describe('queued client artifact gateway', () => {
	test('admits only one publication at a time', async () => {
		let active = 0
		let maximumActive = 0
		const delegate: ClientArtifactGateway = {
			async publish(publication) {
				active += 1
				maximumActive = Math.max(maximumActive, active)
				await new Promise((resolve) => setTimeout(resolve, 5))
				active -= 1
				return {
					publicationId: publication.publicationId,
					runId: `run-${publication.publicationId}`,
					replayed: false,
					artifacts: []
				}
			}
		}
		const gateway = new QueuedClientArtifactGateway(delegate)

		await Promise.all([gateway.publish(run('one')), gateway.publish(run('two'))])

		expect(maximumActive).toBe(1)
	})

	test('retries configured transient failures without blocking the queue permanently', async () => {
		let attempts = 0
		const delegate: ClientArtifactGateway = {
			async publish(publication) {
				attempts += 1
				if (attempts === 1) throw new Error('transient')
				return {
					publicationId: publication.publicationId,
					runId: 'run-retried',
					replayed: false,
					artifacts: []
				}
			}
		}
		const gateway = new QueuedClientArtifactGateway(delegate, {
			delaysMs: [0],
			shouldRetry: (error) => error instanceof Error && error.message === 'transient'
		})

		const published = await gateway.publish(run('retry-me'))

		expect(attempts).toBe(2)
		expect(published.runId).toBe('run-retried')
	})
})
