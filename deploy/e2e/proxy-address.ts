import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Linux integration proof of the production proxy configuration and one-hop adapter contract.
if (process.platform !== 'linux')
	throw new Error('The proxy address integration test requires Linux Docker host networking.')
const root = resolve(import.meta.dir, '../..')
const directory = await mkdtemp(join(tmpdir(), 'aven-proxy-proof-'))
const container = `aven-proxy-proof-${process.pid}`
const backend = Bun.serve({
	hostname: '127.0.0.1',
	port: 0,
	fetch: (req) => Response.json({ forwarded: req.headers.get('x-forwarded-for') })
})
const reservation = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
const port = reservation.port
reservation.stop(true)
async function docker(args: string[]) {
	const child = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' })
	const [code, output, error] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text()
	])
	if (code) throw new Error(`Proxy fixture failed: ${error.slice(0, 500)}`)
	return args[0] === 'logs' ? output + error : output
}
async function probe(localAddress: string, supplied: string): Promise<string> {
	// Bun's node:http compatibility layer does not implement localAddress binding.
	const child = Bun.spawn(
		[
			'curl',
			'--fail',
			'--silent',
			'--show-error',
			'--max-time',
			'2',
			'--noproxy',
			'*',
			'--interface',
			localAddress,
			'--header',
			`X-Forwarded-For: ${supplied}`,
			`http://127.0.0.1:${port}/`
		],
		{ stdout: 'pipe', stderr: 'pipe' }
	)
	const [code, body] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text()
	])
	if (code) throw new Error('Loopback proxy fixture is not ready')
	return JSON.parse(body).forwarded
}
try {
	const production = await readFile(join(root, 'deploy/platform/Caddyfile'), 'utf8')
	const checkout = production.slice(
		production.indexOf('{$CHECKOUT_DOMAIN:'),
		production.indexOf('\nhttps:// {')
	)
	assert.ok(checkout.startsWith('{$CHECKOUT_DOMAIN:'))
	const config =
		'{\n admin off\n auto_https off\n}\n' +
		checkout
			.replace('{$CHECKOUT_DOMAIN:portal.aven.ceo}', `http://127.0.0.1:${port}`)
			.replace('\n\tencode', '\n\tbind 127.0.0.1\n\tencode')
			.replace('checkout:3000', `127.0.0.1:${backend.port}`)
	await writeFile(join(directory, 'Caddyfile'), config)
	const compose = Bun.YAML.parse(
		await readFile(join(root, 'deploy/platform/docker-compose.yml'), 'utf8')
	) as {
		services: {
			checkout: { environment: Record<string, unknown>; ports?: unknown }
			caddy: { cap_add: string[] }
		}
	}
	assert.equal(compose.services.checkout.environment.ADDRESS_HEADER, 'X-Forwarded-For')
	assert.equal(String(compose.services.checkout.environment.XFF_DEPTH), '1')
	assert.ok(
		!compose.services.checkout.ports,
		'Checkout must not expose an untrusted direct listener'
	)
	await docker([
		'run',
		'--detach',
		'--name',
		container,
		'--network',
		'host',
		'--read-only',
		'--cap-drop',
		'ALL',
		'--security-opt',
		'no-new-privileges:true',
		'--memory',
		'128m',
		'--pids-limit',
		'64',
		...compose.services.caddy.cap_add.flatMap((capability: string) => ['--cap-add', capability]),
		'--tmpfs',
		'/config:size=8m',
		'--tmpfs',
		'/data:size=8m',
		'--volume',
		`${directory}/Caddyfile:/etc/caddy/Caddyfile:ro`,
		(
			await docker(['build', '--quiet', '--file', join(root, 'deploy/proxy/Dockerfile'), root])
		).trim()
	])
	for (let attempt = 0; ; attempt++) {
		try {
			await probe('127.0.0.1', '198.51.100.1')
			break
		} catch (error) {
			if (attempt >= 20) throw error
			await Bun.sleep(100)
		}
	}
	// Arbitrary supplied chains cannot change the forwarded transport identity.
	assert.equal(await probe('127.0.0.2', '198.51.100.1, 203.0.113.8'), '127.0.0.2')
	assert.equal(await probe('127.0.0.2', '203.0.113.9'), '127.0.0.2')
	assert.equal(await probe('127.0.0.3', '198.51.100.1'), '127.0.0.3')
	console.info(
		'Production Caddy preserves distinct transport clients, replaces supplied forwarding chains, and matches the one-hop Svelte adapter contract.'
	)
} catch (error) {
	console.error(
		await docker(['logs', '--tail', '30', container]).catch(() => 'Proxy fixture logs unavailable')
	)
	throw error
} finally {
	await docker(['rm', '--force', container]).catch(() => {})
	backend.stop(true)
	await rm(directory, { recursive: true, force: true })
}
