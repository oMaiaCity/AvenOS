import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { type FacadeConfig, runtimeTargets } from '../config.js'
import { AppError } from '../lib/server/errors.js'

/** Operator-owned routes can be published before directory activation without restarting the facade. */
export class RuntimeDirectory {
	private content: string | undefined
	private destinations: FacadeConfig['CUSTOMER_RUNTIMES_JSON']

	constructor(
		private readonly config: Pick<FacadeConfig, 'CUSTOMER_RUNTIMES_FILE' | 'CUSTOMER_RUNTIMES_JSON'>
	) {
		this.destinations = config.CUSTOMER_RUNTIMES_JSON
	}

	async read(): Promise<FacadeConfig['CUSTOMER_RUNTIMES_JSON']> {
		if (!this.config.CUSTOMER_RUNTIMES_FILE) return this.destinations
		try {
			const file = await open(
				this.config.CUSTOMER_RUNTIMES_FILE,
				constants.O_RDONLY | constants.O_NOFOLLOW
			)
			try {
				const info = await file.stat()
				if (!info.isFile() || (info.mode & 0o022) !== 0 || info.size > 262144)
					throw new Error('invalid operator route file')
				const buffer = Buffer.alloc(262145)
				const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
				if (bytesRead > 262144) throw new Error('operator route file is too large')
				const content = buffer.subarray(0, bytesRead).toString('utf8')
				if (content !== this.content) {
					this.destinations = runtimeTargets.parse(JSON.parse(content))
					this.content = content
				}
				return this.destinations
			} finally {
				await file.close()
			}
		} catch {
			// Invalid or missing current configuration must never revive a stale destination.
			throw new AppError(503, 'CUSTOMER_RUNTIME_UNAVAILABLE', 'Customer routing is unavailable.')
		}
	}
}
