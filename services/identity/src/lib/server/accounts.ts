import { randomUUID } from 'node:crypto'
import type pg from 'pg'

export interface IdentityAccount {
	id: string
	name: string
	email: string
	role: 'user' | 'admin'
}

export class AccountService {
	constructor(private readonly pool: pg.Pool) {}

	async roles(subjectIds: string[]): Promise<Record<string, 'user' | 'admin'>> {
		if (subjectIds.length === 0) return {}
		const result = await this.pool.query<{ id: string; role: string }>(
			'SELECT id,role FROM "user" WHERE id = ANY($1::text[])',
			[subjectIds]
		)
		return Object.fromEntries(
			result.rows.map((row) => [row.id, row.role === 'admin' ? 'admin' : 'user'])
		)
	}

	async provisionVerified(emailInput: string): Promise<IdentityAccount> {
		const email = emailInput.trim().toLowerCase()
		const existing = (
			await this.pool.query<IdentityAccount>(
				'SELECT id,name,email,role FROM "user" WHERE lower(email)=lower($1)',
				[email]
			)
		).rows[0]
		if (existing) return existing
		const id = randomUUID()
		const name = email.split('@')[0] || email
		await this.pool.query(
			'INSERT INTO "user"(id,name,email,email_verified,role,created_at,updated_at) VALUES($1,$2,$3,true,\'user\',now(),now()) ON CONFLICT(email) DO NOTHING',
			[id, name, email]
		)
		const account = (
			await this.pool.query<IdentityAccount>(
				'SELECT id,name,email,role FROM "user" WHERE lower(email)=lower($1)',
				[email]
			)
		).rows[0]
		if (!account) throw new Error('Account provisioning failed.')
		return account
	}
}
