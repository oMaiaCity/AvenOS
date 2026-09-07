import {
	bigint,
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	role: text('role').notNull().default('user'),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
})

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	setupTokenHash: text('setup_token_hash'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
})

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
})

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true })
})

export const passkey = pgTable(
	'passkey',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull(),
		counter: integer('counter').notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: boolean('backed_up').notNull(),
		transports: text('transports'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		aaguid: text('aaguid'),
		prfEnabled: boolean('prf_enabled').notNull().default(false)
	},
	(table) => [
		uniqueIndex('passkey_credential_id_unique').on(table.credentialID),
		index('passkey_user_id_idx').on(table.userId)
	]
)

export const setupLinks = pgTable('setup_links', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	lastUsedAt: timestamp('last_used_at', { withTimezone: true })
})

export const deviceCode = pgTable(
	'device_code',
	{
		id: text('id').primaryKey(),
		deviceCode: text('device_code').notNull(),
		userCode: text('user_code').notNull(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		status: text('status').notNull(),
		lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
		pollingInterval: integer('polling_interval'),
		clientId: text('client_id'),
		scope: text('scope')
	},
	(table) => [
		uniqueIndex('device_code_device_code_unique').on(table.deviceCode),
		uniqueIndex('device_code_user_code_unique').on(table.userCode)
	]
)

export const proofOfWorkRedemptions = pgTable('proof_of_work_redemptions', {
	id: text('id').primaryKey(),
	expiresAt: bigint('expires_at', { mode: 'number' }).notNull()
})

export const jwks = pgTable('jwks', {
	id: text('id').primaryKey(),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true })
})

export const schema = {
	user,
	session,
	account,
	verification,
	passkey,
	setupLinks,
	deviceCode,
	proofOfWorkRedemptions,
	jwks
}
