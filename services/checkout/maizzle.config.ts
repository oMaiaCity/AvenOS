import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type MaizzleConfig } from '@maizzle/framework'

const templateRoot = fileURLToPath(new URL('./email-templates', import.meta.url))
const componentRoot = fileURLToPath(new URL('./email-templates/components', import.meta.url))

export default defineConfig({
	root: templateRoot,
	content: ['*.vue'],
	components: {
		source: { path: componentRoot, prefix: '', pathPrefix: false }
	},
	output: { path: '.maizzle-dist' },
	plaintext: true,
	server: {
		port: 4175,
		watch: [`${templateRoot}/*.json`]
	},
	async beforeRender({ config, template }) {
		const extended = config as MaizzleConfig & { email?: unknown }
		if (extended.email !== undefined) return
		const metadata = JSON.parse(
			await readFile(`${templateRoot}/${template.path.name}.json`, 'utf8')
		) as { fixture: unknown }
		extended.email = metadata.fixture
	}
})
