import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf'

interface WebDriverResponse<T> {
	value: T
}

async function freePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = createServer()
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (!address || typeof address === 'string') {
				server.close()
				reject(new Error('could not allocate a Tauri WebDriver port'))
				return
			}
			server.close((error) => (error ? reject(error) : resolve(address.port)))
		})
	})
}

async function request<T>(
	origin: string,
	path: string,
	init?: RequestInit,
	timeoutMs = 10_000
): Promise<T> {
	const response = await fetch(`${origin}${path}`, {
		...init,
		headers: { 'content-type': 'application/json', ...init?.headers },
		signal: init?.signal ?? AbortSignal.timeout(timeoutMs)
	})
	const text = await response.text()
	const body = text
		? (JSON.parse(text) as WebDriverResponse<T>)
		: ({ value: null } as WebDriverResponse<T>)
	if (!response.ok || (body.value as { error?: string } | null)?.error) {
		throw new Error(
			`WebDriver ${init?.method ?? 'GET'} ${path} failed (${response.status}): ${text}`
		)
	}
	return body.value
}

async function waitUntilReady(origin: string, process: ChildProcess): Promise<void> {
	const deadline = Date.now() + 20_000
	while (Date.now() < deadline) {
		if (process.exitCode !== null) throw new Error(`tauri-driver exited with ${process.exitCode}`)
		try {
			await request(origin, '/status')
			return
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}
	throw new Error('tauri-driver did not become ready')
}

async function terminate(process: ChildProcess): Promise<void> {
	if (process.exitCode !== null || process.signalCode !== null) return

	let resolveExit: (() => void) | undefined
	const exited = new Promise<void>((resolve) => {
		resolveExit = resolve
		process.once('exit', resolve)
	})
	process.kill('SIGTERM')
	await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5_000))])
	if (process.exitCode === null && process.signalCode === null) {
		process.kill('SIGKILL')
		await exited
	}
	if (resolveExit) process.off('exit', resolveExit)
}

async function removeStateDirectory(stateDirectory: string): Promise<void> {
	await rm(stateDirectory, {
		recursive: true,
		force: true,
		maxRetries: 10,
		retryDelay: 100
	})
}

export class TauriSession {
	private constructor(
		private readonly origin: string,
		private readonly sessionId: string,
		private readonly process: ChildProcess,
		private readonly stateDirectory: string,
		private readonly output: () => string
	) {}

	static async launch(application: string, driver: string): Promise<TauriSession> {
		const [port, nativePort] = await Promise.all([freePort(), freePort()])
		const stateDirectory = await mkdtemp(join(tmpdir(), 'aven-e2e-tauri-'))
		const child = spawn(
			driver,
			[
				'--port',
				String(port),
				'--native-port',
				String(nativePort),
				'--native-driver',
				'/usr/bin/WebKitWebDriver'
			],
			{
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...process.env,
					XDG_CONFIG_HOME: join(stateDirectory, 'config'),
					XDG_DATA_HOME: join(stateDirectory, 'data'),
					XDG_CACHE_HOME: join(stateDirectory, 'cache')
				}
			}
		)
		let output = ''
		child.stdout?.on('data', (chunk) => (output += chunk.toString()))
		child.stderr?.on('data', (chunk) => (output += chunk.toString()))
		const origin = `http://127.0.0.1:${port}`
		try {
			await waitUntilReady(origin, child)
			const created = await request<{ sessionId?: string } | null>(origin, '/session', {
				method: 'POST',
				body: JSON.stringify({
					capabilities: {
						alwaysMatch: {
							browserName: 'wry',
							'tauri:options': { application }
						}
					}
				})
			})
			const sessionId = created?.sessionId
			if (!sessionId) {
				throw new Error(
					`tauri-driver returned no session id: ${JSON.stringify(created)}\n${output}`
				)
			}
			return new TauriSession(origin, sessionId, child, stateDirectory, () => output)
		} catch (error) {
			await terminate(child)
			await removeStateDirectory(stateDirectory)
			throw new Error(
				`Tauri session launch failed: ${String(error)}\ntauri-driver output:\n${output}`,
				{
					cause: error
				}
			)
		}
	}

	private path(suffix: string): string {
		return `/session/${this.sessionId}${suffix}`
	}

	async find(selector: string): Promise<string> {
		const element = await request<Record<string, string>>(this.origin, this.path('/element'), {
			method: 'POST',
			body: JSON.stringify({ using: 'css selector', value: selector })
		})
		const id = element[ELEMENT_KEY]
		if (!id) throw new Error(`WebDriver found no element id for ${selector}`)
		return id
	}

	async findEventually(selector: string, timeoutMs = 15_000): Promise<string> {
		const deadline = Date.now() + timeoutMs
		let last: unknown
		while (Date.now() < deadline) {
			try {
				return await this.find(selector)
			} catch (error) {
				last = error
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
		}
		throw new Error(
			`WebDriver did not find ${selector} at ${await this.url()}: ${String(last)}\nbody:\n${await this.bodyText()}`
		)
	}

	async url(): Promise<string> {
		return await request(this.origin, this.path('/url'))
	}

	async navigate(url: string): Promise<void> {
		await request(this.origin, this.path('/url'), {
			method: 'POST',
			body: JSON.stringify({ url })
		})
	}

	async text(element: string): Promise<string> {
		return await request(this.origin, this.path(`/element/${element}/text`))
	}

	async click(element: string): Promise<void> {
		await request(this.origin, this.path(`/element/${element}/click`), {
			method: 'POST',
			body: '{}'
		})
	}

	async type(element: string, value: string): Promise<void> {
		await request(this.origin, this.path(`/element/${element}/value`), {
			method: 'POST',
			body: JSON.stringify({ text: value, value: [...value] })
		})
	}

	async execute<T>(script: string, args: unknown[] = []): Promise<T> {
		return await request(this.origin, this.path('/execute/sync'), {
			method: 'POST',
			body: JSON.stringify({ script, args })
		})
	}

	async bodyText(): Promise<string> {
		return await this.text(await this.find('body'))
	}

	async waitForBodyText(expected: string, timeoutMs = 20_000): Promise<void> {
		const deadline = Date.now() + timeoutMs
		let lastBody = ''
		let lastError: unknown
		while (Date.now() < deadline) {
			try {
				lastBody = await this.bodyText()
				if (lastBody.includes(expected)) return
			} catch (error) {
				// WebKit invalidates the current frame while Tauri changes from the
				// bootstrap document to the application. That navigation state is
				// transient; all other failures still surface at the deadline.
				lastError = error
			}
			await new Promise((resolve) => setTimeout(resolve, 200))
		}
		throw new Error(
			`Tauri UI never displayed ${JSON.stringify(expected)}; body was:\n${lastBody}\nlast error: ${String(lastError)}\ntauri-driver output:\n${this.output()}`
		)
	}

	async close(): Promise<void> {
		try {
			await request(this.origin, this.path(''), { method: 'DELETE' })
		} finally {
			await terminate(this.process)
			await removeStateDirectory(this.stateDirectory)
		}
	}
}
