import { fileURLToPath } from 'node:url'
import {
	editableTemplateSummaries,
	loadEditableEmailTemplate,
	previewEmailTemplate,
	saveEditableEmailTemplate
} from './compiler.js'

const studioHtmlPath = fileURLToPath(new URL('./studio.html', import.meta.url))
const staticRoot = fileURLToPath(new URL('../../static/', import.meta.url))
const sessionToken = crypto.randomUUID()
const requestedPort = Number(
	Bun.argv.find((argument) => argument.startsWith('--port='))?.split('=')[1]
)
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 4176
const maximumRequestBytes = 300_000

function json(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: {
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	})
}

function authorized(request: Request): boolean {
	return request.headers.get('x-email-studio-token') === sessionToken
}

async function requestBody(request: Request): Promise<{
	key: string
	source: string
	metadata: unknown
}> {
	const contentLength = Number(request.headers.get('content-length') ?? 0)
	if (contentLength > maximumRequestBytes) throw new Error('The template is too large.')
	const value = (await request.json()) as Record<string, unknown>
	if (typeof value.key !== 'string' || typeof value.source !== 'string') {
		throw new Error('The editor request is invalid.')
	}
	if (value.source.length > maximumRequestBytes) throw new Error('The template is too large.')
	return { key: value.key, source: value.source, metadata: value.metadata }
}

// Previews load brand assets from this studio instead of the deployed origin.
function previewMetadata(metadata: unknown, origin: string): unknown {
	if (!metadata || typeof metadata !== 'object') return metadata
	const record = metadata as { fixture?: Record<string, string> }
	if (!record.fixture || typeof record.fixture.baseUrl !== 'string') return metadata
	return { ...record, fixture: { ...record.fixture, baseUrl: origin } }
}

// The sandboxed preview frame has an opaque origin and cannot fetch images,
// so static brand images are inlined for the preview only.
async function inlineStaticImages(html: string, origin: string): Promise<string> {
	const pattern = new RegExp(`${origin.replaceAll('.', '\\.')}/email/([A-Za-z0-9._-]+)`, 'g')
	const replacements = new Map<string, string>()
	for (const match of html.matchAll(pattern)) {
		const name = match[1] ?? ''
		if (replacements.has(match[0])) continue
		const file = Bun.file(`${staticRoot}email/${name}`)
		if (!(await file.exists())) continue
		const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
		replacements.set(match[0], `data:${file.type};base64,${base64}`)
	}
	let output = html
	for (const [from, to] of replacements) output = output.replaceAll(from, to)
	return output
}

const server = Bun.serve({
	hostname: '127.0.0.1',
	port,
	async fetch(request) {
		const url = new URL(request.url)
		try {
			if (request.method === 'GET' && url.pathname === '/') {
				const html = (await Bun.file(studioHtmlPath).text()).replace(
					'__EMAIL_STUDIO_TOKEN__',
					JSON.stringify(sessionToken)
				)
				return new Response(html, {
					headers: {
						'cache-control': 'no-store',
						'content-type': 'text/html; charset=utf-8',
						'referrer-policy': 'no-referrer',
						'x-content-type-options': 'nosniff',
						'x-frame-options': 'DENY'
					}
				})
			}
			if (request.method === 'GET' && url.pathname.startsWith('/email/')) {
				const file = Bun.file(`${staticRoot}${url.pathname.slice(1).replaceAll('..', '')}`)
				if (!(await file.exists())) return json({ message: 'Not found.' }, 404)
				return new Response(file, { headers: { 'cache-control': 'no-store' } })
			}
			if (request.method === 'GET' && url.pathname === '/api/templates') {
				return json({ templates: editableTemplateSummaries() })
			}
			if (request.method === 'GET' && url.pathname === '/api/template') {
				return json(await loadEditableEmailTemplate(url.searchParams.get('key') ?? ''))
			}
			if (!authorized(request)) return json({ message: 'Editor session expired.' }, 403)
			if (request.method === 'POST' && url.pathname === '/api/preview') {
				const body = await requestBody(request)
				const preview = await previewEmailTemplate(
					body.key,
					body.source,
					previewMetadata(body.metadata, url.origin)
				)
				return json({ ...preview, html: await inlineStaticImages(preview.html, url.origin) })
			}
			if (request.method === 'POST' && url.pathname === '/api/save') {
				const body = await requestBody(request)
				await saveEditableEmailTemplate(body.key, body.source, body.metadata)
				return json({ saved: true })
			}
			return json({ message: 'Not found.' }, 404)
		} catch (error) {
			return json(
				{ message: error instanceof Error ? error.message : 'The email studio request failed.' },
				400
			)
		}
	}
})

console.info(`Aven email studio: http://${server.hostname}:${server.port}`)
console.info('Press Ctrl+C to stop.')
