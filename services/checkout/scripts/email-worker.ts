import 'dotenv/config'
import pino from 'pino'
import { loadEmailWorkerConfig } from '../src/lib/server/config.js'
import { decodeEncryptionKey } from '../src/lib/server/crypto.js'
import { openDatabase } from '../src/lib/server/db.js'
import { createTransport, EmailWorker } from '../src/lib/server/email/worker.js'

const config = loadEmailWorkerConfig()
const logger = pino({
	level: config.LOG_LEVEL,
	redact: {
		paths: ['password', 'token', 'secret', 'authorization', 'cookie', 'smtpUrl'],
		censor: '[REDACTED]'
	}
}).child({ service: 'email-worker', applicationVersion: config.APPLICATION_VERSION })
const database = openDatabase(config.EMAIL_WORKER_DATABASE_URL ?? config.DATABASE_URL, { max: 2 })
const worker = new EmailWorker(
	database.pool,
	config,
	decodeEncryptionKey(config.EMAIL_QUEUE_ENCRYPTION_KEY),
	createTransport(config),
	logger
)
worker.start()

await new Promise<void>((resolve) => {
	process.once('SIGINT', resolve)
	process.once('SIGTERM', resolve)
})
worker.stop()
await database.pool.end()
