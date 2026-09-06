import pino from 'pino'
import { AccountService } from './accounts.js'
import { createAuth, type IdentityAuth } from './auth.js'
import { IdentityCapabilities } from './capabilities.js'
import { type IdentityConfig, loadIdentityConfig } from './config.js'
import { type DatabaseContext, openDatabase } from './db.js'
import { PasskeyService } from './passkeys.js'
import { ProofOfWorkService } from './proof-of-work.js'
import { IdentitySecurityMailer } from './security-mail.js'

export interface IdentityRuntime {
	config: IdentityConfig
	database: DatabaseContext
	auth: IdentityAuth
	accounts: AccountService
	authorizations: AccountService
	passkeys: PasskeyService
	proofOfWork: ProofOfWorkService
	capabilities: IdentityCapabilities
	logger: pino.Logger
}
const KEY = Symbol.for('aven.identity.runtime')
async function create(): Promise<IdentityRuntime> {
	const config = loadIdentityConfig()
	const database = openDatabase(config.DATABASE_URL)
	const accounts = openDatabase(config.ACCOUNTS_DATABASE_URL ?? config.DATABASE_URL, 2)
	const authorizations = openDatabase(config.AUTHORIZATION_DATABASE_URL ?? config.DATABASE_URL, 2)
	const passkeys = new PasskeyService(database.pool, config.REQUIRE_PASSKEY_PRF)
	const logger = pino({
		level: config.LOG_LEVEL,
		redact: ['req.headers.authorization', 'req.headers.cookie', 'token', 'secret']
	})
	const proofOfWork = new ProofOfWorkService(
		database.pool,
		config.POW_DIFFICULTY_BITS,
		config.POW_CHALLENGE_TTL_SECONDS,
		config.BETTER_AUTH_SECRET
	)
	let cleaning = false
	const cleanup = async () => {
		if (cleaning) return
		cleaning = true
		try {
			// Drain bounded batches with a short event-loop yield; issuance never waits for cleanup.
			let deleted = 0
			const started = Date.now()
			do {
				deleted = await proofOfWork.cleanup()
				if (deleted >= 1000) await new Promise((resolve) => setTimeout(resolve, 10))
			} while (deleted >= 1000 && Date.now() - started < 5000)
			logger.info(
				{
					event: 'identity.proof_summary',
					...proofOfWork.snapshot(),
					cleanupBacklog: deleted >= 1000
				},
				'Proof verification and replay cleanup summary'
			)
		} catch {
			logger.error({ event: 'identity.proof_cleanup_failed' }, 'Proof replay cleanup failed')
		} finally {
			cleaning = false
		}
	}
	setInterval(cleanup, 60_000).unref()
	void cleanup()
	const capabilities = new IdentityCapabilities(database.pool, config.BACKUP_HEALTH_FILE)
	capabilities.start()
	const securityMailer = new IdentitySecurityMailer(database.pool, config)
	securityMailer.start()
	return {
		config,
		database,
		passkeys,
		accounts: new AccountService(accounts.pool),
		authorizations: new AccountService(authorizations.pool),
		auth: createAuth(config, database, (token) => passkeys.verifySetupLink(token)),
		proofOfWork,
		capabilities,
		logger
	}
}
export function runtime(): Promise<IdentityRuntime> {
	const holder = globalThis as Record<symbol, unknown>
	holder[KEY] ??= create()
	return holder[KEY] as Promise<IdentityRuntime>
}
