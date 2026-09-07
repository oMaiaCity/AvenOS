import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { type MaizzleConfig, render } from '@maizzle/framework'
import { z } from 'zod'
import {
	emailTemplateFields,
	emailTemplateTokens,
	type SystemEmailTemplate,
	systemEmailTemplates
} from '../../src/lib/server/email/template-contract.js'

const templateRoot = fileURLToPath(new URL('../../email-templates', import.meta.url))
const componentRoot = fileURLToPath(new URL('../../email-templates/components', import.meta.url))
export const generatedTemplatePath = fileURLToPath(
	new URL('../../src/lib/server/email/templates.generated.ts', import.meta.url)
)

export interface EmailTemplateMetadata {
	subject: string
	fixture: Record<string, string>
}

export interface EditableEmailTemplate {
	key: SystemEmailTemplate
	label: string
	source: string
	metadata: EmailTemplateMetadata
}

interface CatalogEntry {
	key: SystemEmailTemplate
	label: string
	sourcePath: string
	metadataPath: string
}

interface CompiledVariant {
	html: string
	text: string
}

interface CompiledTemplate {
	subject: string
	variants: Record<string, CompiledVariant>
}

const metadataSchema = z
	.object({
		subject: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.refine((subject) => !/[\r\n]/.test(subject), 'The subject must be a single line.'),
		fixture: z.record(z.string(), z.string())
	})
	.strict()

const templateFiles = {
	'identity.security': 'identity-security-email',
	'name.purchase-link': 'purchase-link-email',
	'name.purchased': 'purchase-completed-email'
} as const satisfies Record<SystemEmailTemplate, string>

export const emailTemplateCatalog: readonly CatalogEntry[] = systemEmailTemplates.map((key) => {
	const filename = templateFiles[key]
	return {
		key,
		label:
			key === 'identity.security'
				? 'Account security'
				: key === 'name.purchase-link'
					? 'Purchase link'
					: 'Purchase completed',
		sourcePath: `${templateRoot}/${filename}.vue`,
		metadataPath: `${templateRoot}/${filename}.json`
	}
})

function catalogEntry(key: string): CatalogEntry {
	const entry = emailTemplateCatalog.find((candidate) => candidate.key === key)
	if (!entry) throw new Error(`Unknown email template: ${key}`)
	return entry
}

function validateMetadata(key: SystemEmailTemplate, input: unknown): EmailTemplateMetadata {
	const metadata = metadataSchema.parse(input)
	const expectedFields = new Set<string>(emailTemplateFields[key])
	const fixtureFields = Object.keys(metadata.fixture)
	const missing = [...expectedFields].filter((field) => !(field in metadata.fixture))
	const unknown = fixtureFields.filter((field) => !expectedFields.has(field))
	if (missing.length || unknown.length) {
		throw new Error(
			`Fixture fields for ${key} do not match its contract. Missing: ${missing.join(', ') || 'none'}. Unknown: ${unknown.join(', ') || 'none'}.`
		)
	}
	const subjectPlaceholderPattern = /{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g
	for (const match of metadata.subject.matchAll(subjectPlaceholderPattern)) {
		const field = match[1]
		if (!field || !expectedFields.has(field)) {
			throw new Error(`Subject for ${key} uses unknown field: ${field ?? '(empty)'}`)
		}
	}
	if (metadata.subject.replace(subjectPlaceholderPattern, '').match(/{{|}}/)) {
		throw new Error(`Subject for ${key} contains an invalid placeholder.`)
	}
	return metadata
}

export async function loadEditableEmailTemplate(key: string): Promise<EditableEmailTemplate> {
	const entry = catalogEntry(key)
	const [source, metadataSource] = await Promise.all([
		readFile(entry.sourcePath, 'utf8'),
		readFile(entry.metadataPath, 'utf8')
	])
	return {
		key: entry.key,
		label: entry.label,
		source,
		metadata: validateMetadata(entry.key, JSON.parse(metadataSource) as unknown)
	}
}

function tokenData(key: SystemEmailTemplate): Record<string, string> {
	return Object.fromEntries(
		emailTemplateFields[key].map((field) => [field, emailTemplateTokens[field]])
	)
}

function variants(key: SystemEmailTemplate): Record<string, Record<string, string>> {
	const data = tokenData(key)
	if (key === 'name.purchased') {
		return {
			withAccess: data,
			withoutAccess: { ...data, accessUrl: '' }
		}
	}
	return { default: data }
}

function maizzleConfig(email: Record<string, string>): Partial<MaizzleConfig> {
	return {
		root: templateRoot,
		// Each render creates and closes its own renderer; no live file watching is needed.
		vite: { server: { watch: null } },
		components: {
			source: { path: componentRoot, prefix: '', pathPrefix: false }
		},
		plaintext: true,
		email
	} as Partial<MaizzleConfig>
}

function compileSubject(
	key: SystemEmailTemplate,
	subject: string,
	data: Record<string, string>
): string {
	const allowedFields = new Set<string>(emailTemplateFields[key])
	return subject.replace(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g, (_placeholder, field: string) => {
		if (!allowedFields.has(field)) {
			throw new Error(`Subject for ${key} uses unknown field: ${field}`)
		}
		return data[field] ?? ''
	})
}

async function renderVariant(
	source: string,
	email: Record<string, string>
): Promise<CompiledVariant> {
	const rendered = await render(source, maizzleConfig(email))
	if (!rendered.plaintext) throw new Error('Maizzle did not generate a plaintext template.')
	if (rendered.html.includes('@maizzle/')) {
		throw new Error('Maizzle left an unresolved stylesheet directive in the generated HTML.')
	}
	return { html: rendered.html.trim(), text: rendered.plaintext.trim() }
}

export async function previewEmailTemplate(
	keyInput: string,
	source: string,
	metadataInput: unknown
): Promise<{ subject: string; html: string; text: string }> {
	const entry = catalogEntry(keyInput)
	const metadata = validateMetadata(entry.key, metadataInput)
	const rendered = await renderVariant(source, metadata.fixture)
	return {
		subject: compileSubject(entry.key, metadata.subject, metadata.fixture),
		...rendered
	}
}

export async function compileEmailTemplates(): Promise<
	Record<SystemEmailTemplate, CompiledTemplate>
> {
	const compiled = {} as Record<SystemEmailTemplate, CompiledTemplate>
	for (const entry of emailTemplateCatalog) {
		const editable = await loadEditableEmailTemplate(entry.key)
		const templateVariants: Record<string, CompiledVariant> = {}
		const templateTokens = tokenData(entry.key)
		for (const [variant, data] of Object.entries(variants(entry.key))) {
			templateVariants[variant] = await renderVariant(editable.source, data)
		}
		compiled[entry.key] = {
			subject: compileSubject(entry.key, editable.metadata.subject, templateTokens),
			variants: templateVariants
		}
	}
	return compiled
}

export async function generatedTemplateSource(): Promise<string> {
	const compiled = await compileEmailTemplates()
	return `// Generated by \`bun run email:compile\`. Edit files in email-templates/ instead.\n// biome-ignore format: Generated output is kept deterministic by the email compiler.\nexport const compiledEmailTemplates = ${JSON.stringify(compiled, null, '\t')} as const\n`
}

async function atomicWrite(path: string, contents: string): Promise<void> {
	const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
	await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' })
	await rename(temporary, path)
}

export async function writeGeneratedEmailTemplates(): Promise<void> {
	await atomicWrite(generatedTemplatePath, await generatedTemplateSource())
}

export async function saveEditableEmailTemplate(
	keyInput: string,
	source: string,
	metadataInput: unknown
): Promise<void> {
	const entry = catalogEntry(keyInput)
	const metadata = validateMetadata(entry.key, metadataInput)
	await previewEmailTemplate(entry.key, source, metadata)
	await Promise.all([
		atomicWrite(entry.sourcePath, source.trimEnd().concat('\n')),
		atomicWrite(entry.metadataPath, `${JSON.stringify(metadata, null, '\t')}\n`)
	])
	await writeGeneratedEmailTemplates()
}

export function editableTemplateSummaries(): Array<{ key: SystemEmailTemplate; label: string }> {
	return emailTemplateCatalog.map(({ key, label }) => ({ key, label }))
}
