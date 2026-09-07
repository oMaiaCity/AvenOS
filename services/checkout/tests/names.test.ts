import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FakePaymentProvider } from '../src/lib/server/billing/fake.js'
import { parsePolarEvent } from '../src/lib/server/billing/provider.js'
import { sha256Hex } from '../src/lib/server/crypto.js'
import { NameService } from '../src/lib/server/names/service.js'
import { createTestDatabase, type TestDatabase, testConfig, testNotifier } from './helpers.js'

describe('checkout name grant', () => {
	let database: TestDatabase
	beforeAll(async () => {
		database = await createTestDatabase()
	})
	afterAll(async () => {
		await database.teardown()
	})

	it('projects an aven.id subject, records payment once, and contains no tenant runtime', async () => {
		const config = testConfig()
		const payments = new FakePaymentProvider(config)
		const subjectId = randomUUID()
		const service = new NameService(
			database.pool,
			config,
			testNotifier(config),
			payments,
			async (email) => ({
				account: { id: subjectId, name: email.split('@')[0] ?? email, email, role: 'user' },
				setupUrl: 'https://aven.id/setup/test'
			})
		)
		const name = `n${randomUUID().replaceAll('-', '').slice(0, 12)}`
		const email = `${name}@example.test`
		await service.secure(name, email)
		const hold = (await database.pool.query('SELECT id FROM name_holds WHERE name=$1', [name]))
			.rows[0]
		const token = `claim-${randomUUID().replaceAll('-', '')}`
		await database.pool.query('UPDATE name_holds SET claim_token_hash=$1 WHERE id=$2', [
			sha256Hex(token),
			hold.id
		])
		const checkout = await service.claim(token)
		const checkoutId = new URL(checkout.checkoutUrl).searchParams.get('checkoutId')
		if (!checkoutId) throw new Error('Fake checkout did not provide an id')
		const event = parsePolarEvent(
			payments.buildCompletedWebhookBody({
				checkoutId,
				holdId: hold.id,
				name,
				email,
				amountEur: 25
			})
		)

		expect(await service.grantFromEvent(event)).toEqual({ granted: true })
		expect(await service.grantFromEvent(event)).toEqual({ granted: false })
		expect(await service.listForUser(subjectId)).toMatchObject([{ name, status: 'owned' }])
		expect(
			(
				await database.pool.query('SELECT COUNT(*)::int AS count FROM payment_events WHERE id=$1', [
					event.id
				])
			).rows[0].count
		).toBe(1)
		expect((await database.pool.query('SELECT email FROM checkout_customers')).rows[0].email).toBe(
			email
		)
		expect(
			(
				await database.pool.query(
					"SELECT to_regclass('customer_environments') AS environments, to_regclass('static_site_bindings') AS sites"
				)
			).rows[0]
		).toEqual({ environments: null, sites: null })

		const refund = { ...event, id: `refund-${randomUUID()}`, type: 'refund.created' }
		expect(await service.revokeFromEvent(refund)).toEqual({ revoked: true })
		expect(
			(await database.pool.query('SELECT status FROM names WHERE name=$1', [name])).rows[0]
		).toMatchObject({ status: 'revoked' })
	})

	it('allows only one avenNAME per account at both checkout gates', async () => {
		const config = testConfig()
		const payments = new FakePaymentProvider(config)
		const service = new NameService(
			database.pool,
			config,
			testNotifier(config),
			payments,
			async (email) => ({
				account: { id: randomUUID(), name: email.split('@')[0] ?? email, email, role: 'user' },
				setupUrl: 'https://aven.id/setup/test'
			})
		)
		const first = `n${randomUUID().replaceAll('-', '').slice(0, 12)}`
		const email = `${first}@example.test`
		const staleName = `n${randomUUID().replaceAll('-', '').slice(0, 12)}`
		const staleToken = `claim-${randomUUID().replaceAll('-', '')}`
		await database.pool.query(
			`INSERT INTO name_holds (id,name,email,claim_token_hash,created_at,expires_at)
			 VALUES ($1,$2,$3,$4,now(),now() + interval '24 hours')`,
			[randomUUID(), staleName, email.toUpperCase(), sha256Hex(staleToken)]
		)

		await service.secure(first, email)
		const hold = (await database.pool.query('SELECT id FROM name_holds WHERE name=$1', [first]))
			.rows[0]
		const token = `claim-${randomUUID().replaceAll('-', '')}`
		await database.pool.query('UPDATE name_holds SET claim_token_hash=$1 WHERE id=$2', [
			sha256Hex(token),
			hold.id
		])
		const checkout = await service.claim(token)
		const checkoutId = new URL(checkout.checkoutUrl).searchParams.get('checkoutId')
		if (!checkoutId) throw new Error('Fake checkout did not provide an id')
		const event = parsePolarEvent(
			payments.buildCompletedWebhookBody({
				checkoutId,
				holdId: hold.id,
				name: first,
				email,
				amountEur: 25
			})
		)
		expect(await service.grantFromEvent(event)).toEqual({ granted: true })

		const second = `n${randomUUID().replaceAll('-', '').slice(0, 12)}`
		await expect(service.secure(second, email)).rejects.toMatchObject({
			code: 'NAME_LIMIT_REACHED',
			status: 409
		})
		await expect(service.claim(staleToken)).rejects.toMatchObject({
			code: 'NAME_LIMIT_REACHED',
			status: 410
		})
		await expect(service.secure(second, `${second}@example.test`)).resolves.toMatchObject({
			name: second
		})
	})
})
