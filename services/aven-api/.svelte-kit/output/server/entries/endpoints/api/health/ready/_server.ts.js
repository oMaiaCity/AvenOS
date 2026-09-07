import { t as runtime } from "../../../../../chunks/runtime.js";
import { json } from "@sveltejs/kit";
//#region src/routes/api/health/ready/+server.ts
var GET = async () => {
	const checks = {
		database: false,
		migration: false
	};
	try {
		const { database } = await runtime();
		await database.pool.query("SELECT 1");
		checks.database = true;
		await database.pool.query("SELECT 1 FROM customer_environments LIMIT 1");
		checks.migration = true;
	} catch {}
	const ready = Object.values(checks).every(Boolean);
	return json({
		status: ready ? "ready" : "not_ready",
		checks
	}, { status: ready ? 200 : 503 });
};
//#endregion
export { GET };
