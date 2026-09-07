// Minimal in-memory fixed-window rate limiter for the few non-auth endpoints
// that need one (Better Auth rate-limits its own routes). Single-process by
// design, matching the single adapter-node process this app runs as.

interface Window {
	count: number
	resetAt: number
}
const windows = new Map<string, Window>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now()
	const current = windows.get(key)
	if (!current || current.resetAt <= now) {
		if (windows.size > 10_000)
			for (const [k, v] of windows) {
				if (v.resetAt <= now) windows.delete(k)
			}
		windows.set(key, { count: 1, resetAt: now + windowMs })
		return true
	}
	current.count += 1
	return current.count <= limit
}
