//#region src/lib/server/rate-limit.ts
var windows = /* @__PURE__ */ new Map();
function rateLimit(key, limit, windowMs) {
	const now = Date.now();
	const current = windows.get(key);
	if (!current || current.resetAt <= now) {
		if (windows.size > 1e4) {
			for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
		}
		windows.set(key, {
			count: 1,
			resetAt: now + windowMs
		});
		return true;
	}
	current.count += 1;
	return current.count <= limit;
}
//#endregion
export { rateLimit as t };
