import 'dotenv/config'
import { migrate, openDatabase } from '../src/lib/server/db.js'

const url = process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) throw new Error('Set MIGRATOR_DATABASE_URL or DATABASE_URL')
const database = openDatabase(url, { max: 1 })
await migrate(database)
process.stdout.write('Database schema is ready.\n')
await database.pool.end()
