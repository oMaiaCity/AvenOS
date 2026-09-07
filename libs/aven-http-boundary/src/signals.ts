import { isIP } from 'node:net'

// Fixed-size summaries, not one log per rejected request. Peer addresses come from
// the server transport/trusted proxy configuration, never caller-supplied identity headers.
export class BoundarySignals {
	private denied = 0
	private limited = 0
	private peers = new Set<string>()
	private timer?: ReturnType<typeof setInterval>
	constructor(
		private boundary: string,
		private emit: (summary: Record<string, unknown>) => void,
		intervalMs = 60_000
	) {
		if (intervalMs > 0) {
			this.timer = setInterval(() => this.flush(), intervalMs)
			this.timer.unref()
		}
	}
	record(status: number, peer?: string) {
		if (status === 401 || status === 403)
			this.denied = Math.min(Number.MAX_SAFE_INTEGER, this.denied + 1)
		else if ([408, 413, 415, 429].includes(status))
			this.limited = Math.min(Number.MAX_SAFE_INTEGER, this.limited + 1)
		else return
		if (peer && isIP(peer) && this.peers.size < 8) this.peers.add(peer)
	}
	flush() {
		if (!this.denied && !this.limited) return
		this.emit({
			event: 'security.boundary_summary',
			boundary: this.boundary,
			authorizationDenied: this.denied,
			inputLimited: this.limited,
			sampledPeers: [...this.peers]
		})
		this.denied = 0
		this.limited = 0
		this.peers.clear()
	}
	stop() {
		clearInterval(this.timer)
		this.flush()
	}
}
