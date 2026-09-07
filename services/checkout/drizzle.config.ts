import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/schema/index.ts',
	out: './migrations',
	dbCredentials: {
		url:
			process.env.MIGRATOR_DATABASE_URL ??
			process.env.DATABASE_URL ??
			'postgres://postgres:postgres@127.0.0.1:5432/aven'
	}
})
