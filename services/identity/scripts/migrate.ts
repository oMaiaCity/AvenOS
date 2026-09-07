import 'dotenv/config'
import { loadIdentityConfig } from '../src/lib/server/config.js'
import { migrate, openDatabase } from '../src/lib/server/db.js'

const config = loadIdentityConfig()
const database = openDatabase(config.MIGRATOR_DATABASE_URL ?? config.DATABASE_URL, 1)
await migrate(database)
await database.pool.end()
process.stdout.write('Identity database schema is ready.\n')
