import { t as runtime } from "../../../../../chunks/runtime.js";
import { json } from "@sveltejs/kit";
//#region src/lib/server/ops.ts
async function workerFreshness(pool) {
	const rows = (await pool.query("SELECT worker_name,last_heartbeat_at FROM worker_heartbeats")).rows;
	return new Map(rows.map((row) => [row.worker_name, row.last_heartbeat_at]));
}
//#endregion
//#region src/routes/api/health/status/+server.ts
var GET = async () => {
	const { database, config } = await runtime();
	const heartbeats = await workerFreshness(database.pool);
	const fresh = (worker, staleSeconds) => {
		const seen = heartbeats.get(worker);
		return Boolean(seen && Date.now() - seen.getTime() <= staleSeconds * 1e3);
	};
	const emailAlive = fresh("email-worker", config.EMAIL_WORKER_STALE_SECONDS);
	const environmentAlive = fresh("environment-worker", config.ENVIRONMENT_WORKER_STALE_SECONDS);
	return json({
		overall: emailAlive && environmentAlive ? "healthy" : "degraded",
		capabilities: {
			authentication: true,
			emailQueueing: true,
			emailDelivery: emailAlive ? "available" : "delayed",
			environmentProvisioning: environmentAlive ? "available" : "delayed"
		}
	});
};
//#endregion
export { GET };
