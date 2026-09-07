import { createHash } from 'node:crypto'
import { expect, type Locator, type Page, test } from '@playwright/test'
import pg from 'pg'

const checkout = process.env.E2E_POLAR_CHECKOUT_ORIGIN as string
const checkoutBrowser = process.env.E2E_POLAR_CHECKOUT_BROWSER_ORIGIN as string
const identityBrowser = process.env.E2E_POLAR_IDENTITY_BROWSER_ORIGIN as string
const mailpit = process.env.E2E_POLAR_MAILPIT_ORIGIN as string
const databaseUrl = process.env.E2E_POLAR_DATABASE_URL as string
const polarApiKey = process.env.E2E_POLAR_API_KEY as string

function requireEnvironment(): void {
	for (const [name, value] of Object.entries({
		checkout,
		checkoutBrowser,
		identityBrowser,
		mailpit,
		databaseUrl,
		polarApiKey
	})) {
		if (!value) throw new Error(`${name} is required`)
	}
}

async function responseJson(response: Response): Promise<unknown> {
	const text = await response.text()
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`)
	return JSON.parse(text)
}

function leadingZeroBits(digest: Buffer, bits: number): boolean {
	const bytes = Math.floor(bits / 8)
	for (let index = 0; index < bytes; index += 1) if (digest[index] !== 0) return false
	const remaining = bits % 8
	return remaining === 0 || ((digest[bytes] ?? 255) & (0xff << (8 - remaining))) === 0
}

async function proofOfWork(purpose: string): Promise<string> {
	const challenge = (await responseJson(
		await fetch(`${checkout}/api/pow/challenge?purpose=${encodeURIComponent(purpose)}`)
	)) as { id: string; nonce: string; purpose: string; difficultyBits: number }
	for (let counter = 0; counter < 10_000_000; counter += 1) {
		const digest = createHash('sha256')
			.update(`${challenge.id}:${challenge.nonce}:${challenge.purpose}:${counter}`)
			.digest()
		if (leadingZeroBits(digest, challenge.difficultyBits)) return `${challenge.id}.${counter}`
	}
	throw new Error('proof of work search limit exceeded')
}

interface MailSummary {
	ID: string
	Subject: string
}

async function waitForMail(subject: RegExp): Promise<{ text: string; html: string }> {
	const deadline = Date.now() + 90_000
	while (Date.now() < deadline) {
		const list = (await responseJson(await fetch(`${mailpit}/api/v1/messages`))) as {
			messages?: MailSummary[]
		}
		for (const message of list.messages ?? []) {
			if (!subject.test(message.Subject)) continue
			const detail = (await responseJson(
				await fetch(`${mailpit}/api/v1/message/${message.ID}`)
			)) as { Text?: string; HTML?: string }
			return { text: detail.Text ?? '', html: detail.HTML ?? '' }
		}
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
	throw new Error(`mail matching ${subject} did not arrive`)
}

function linkFrom(mail: { text: string; html: string }, host: string): string {
	const decoded = mail.html.replaceAll('&amp;', '&')
	const match = `${mail.text}\n${decoded}`.match(
		new RegExp(`https?://${host.replaceAll('.', '\\.')}[^\\s"<>]+`)
	)
	if (!match) throw new Error(`mail contained no ${host} link`)
	return match[0]
}

async function visibleLocator(
	page: Page,
	selectors: string[],
	timeoutMs = 30_000
): Promise<Locator> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		for (const frame of page.frames()) {
			for (const selector of selectors) {
				const locator = frame.locator(selector).first()
				if (await locator.isVisible().catch(() => false)) return locator
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	throw new Error(`no visible checkout field matched ${selectors.join(', ')}`)
}

async function optionalFill(page: Page, selectors: string[], value: string): Promise<void> {
	const locator = await visibleLocator(page, selectors, 2_000).catch(() => null)
	if (locator) await locator.fill(value)
}

async function optionalCountry(page: Page): Promise<void> {
	const country = await visibleLocator(
		page,
		['select[autocomplete="country"]', 'select[name="country"]'],
		2_000
	).catch(() => null)
	if (country) await country.selectOption('DE')
}

async function paymentButton(page: Page): Promise<Locator> {
	const pattern = /pay|purchase|subscribe|bezahlen|kaufen|abonnieren/i
	const deadline = Date.now() + 30_000
	while (Date.now() < deadline) {
		for (const frame of page.frames()) {
			const button = frame.getByRole('button', { name: pattern }).last()
			if (await button.isVisible().catch(() => false)) return button
		}
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	throw new Error('Polar checkout payment button did not become visible')
}

async function completeSandboxCard(page: Page): Promise<void> {
	await optionalCountry(page)
	await optionalFill(page, ['input[autocomplete="cc-name"]', 'input[name="name"]'], 'Aven Sandbox')
	await optionalFill(
		page,
		['input[autocomplete="postal-code"]', 'input[name="postalCode"]'],
		'10115'
	)
	await optionalFill(page, ['input[autocomplete="address-line1"]'], 'Invalidenstrasse 1')
	await (
		await visibleLocator(page, [
			'input[autocomplete="cc-number"]',
			'input[name="cardnumber"]',
			'input[aria-label*="card number" i]',
			'input[aria-label*="kartennummer" i]'
		])
	).fill('4242424242424242')
	await (
		await visibleLocator(page, [
			'input[autocomplete="cc-exp"]',
			'input[name="exp-date"]',
			'input[aria-label*="expiration" i]',
			'input[aria-label*="ablauf" i]'
		])
	).fill('1234')
	await (
		await visibleLocator(page, [
			'input[autocomplete="cc-csc"]',
			'input[name="cvc"]',
			'input[aria-label*="security code" i]',
			'input[aria-label*="sicherheitscode" i]'
		])
	).fill('123')
	await (await paymentButton(page)).click()
}

interface PurchaseProof {
	name: string
	status: string
	checkout_id: string
	owner_user_id: string
	email: string
	payment_events: number
	processed_deliveries: number
	outbox_status: string
}

async function waitForPurchase(name: string): Promise<PurchaseProof> {
	const pool = new pg.Pool({
		connectionString: databaseUrl.replace(/\/postgres$/, '/aven_checkout'),
		max: 1
	})
	try {
		const deadline = Date.now() + 120_000
		while (Date.now() < deadline) {
			const row = (
				await pool.query<PurchaseProof>(
					`SELECT n.name,n.status,n.checkout_id,n.owner_user_id,c.email,
					  (SELECT count(*)::int FROM payment_events p WHERE p.checkout_id=n.checkout_id) AS payment_events,
					  (SELECT count(*)::int FROM polar_webhook_deliveries d
					   WHERE d.event_type='order.paid' AND d.state='processed'
					     AND d.payload->'data'->>'checkout_id'=n.checkout_id) AS processed_deliveries,
					  (SELECT status FROM platform_event_outbox o
					   WHERE o.subject_id::text=n.owner_user_id AND o.purchased_name=n.name
					   ORDER BY created_at DESC LIMIT 1) AS outbox_status
					 FROM names n JOIN checkout_customers c ON c.subject_id=n.owner_user_id
					 WHERE n.name=$1`,
					[name]
				)
			).rows[0]
			if (
				row?.status === 'owned' &&
				row.payment_events === 1 &&
				row.processed_deliveries === 1 &&
				row.outbox_status === 'delivered'
			)
				return row
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
		throw new Error('Polar order.paid did not produce a delivered local purchase')
	} finally {
		await pool.end()
	}
}

async function polarCheckoutStatus(checkoutId: string): Promise<string> {
	const response = await fetch(`https://sandbox-api.polar.sh/v1/checkouts/${checkoutId}`, {
		headers: { authorization: `Bearer ${polarApiKey}`, accept: 'application/json' }
	})
	const body = (await responseJson(response)) as { status?: string }
	return body.status ?? ''
}

test('Polar Sandbox completes the real avenNAME checkout and verified webhook grant', async ({
	page
}) => {
	requireEnvironment()
	const name = `polar-${Date.now().toString(36)}`.slice(0, 28)
	const email = `${name}@example.test`
	const held = await fetch(`${checkout}/api/names/hold`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin: checkoutBrowser,
			'x-proof-of-work': await proofOfWork('secure-name')
		},
		body: JSON.stringify({ name, email, tier: 'aven-name' })
	})
	if (held.status !== 201) throw new Error(`name hold failed: ${held.status} ${await held.text()}`)

	const claimMail = await waitForMail(new RegExp(`Checkout link for ${name}`))
	await page.goto(linkFrom(claimMail, new URL(checkoutBrowser).host))
	await expect(page.getByText(`${name}.aven.ceo`)).toBeVisible()
	await expect(page.locator('iframe[title="Checkout"]')).toBeVisible()
	await completeSandboxCard(page)
	await expect(page).toHaveURL(/\/purchase\/success/, { timeout: 120_000 })

	const purchase = await waitForPurchase(name)
	expect(purchase.email).toBe(email)
	expect(purchase.owner_user_id).toBeTruthy()
	expect(await polarCheckoutStatus(purchase.checkout_id)).toBe('succeeded')

	const setupMail = await waitForMail(new RegExp(`Login for ${name}`))
	await page.goto(linkFrom(setupMail, new URL(identityBrowser).host))
	await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
})
