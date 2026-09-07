import { t as runtime } from "../../../../../chunks/runtime.js";
import { t as rateLimit } from "../../../../../chunks/rate-limit.js";
import { json } from "@sveltejs/kit";
//#region src/routes/api/names/check/+server.ts
var GET = async (event) => {
	if (!rateLimit(`names-check:${event.getClientAddress()}`, 30, 6e4)) return json({
		code: "RATE_LIMITED",
		message: "Too many availability checks. Retry shortly."
	}, { status: 429 });
	const { names } = await runtime();
	return json(await names.availability(event.url.searchParams.get("name") ?? ""), { headers: { "Cache-Control": "no-store" } });
};
//#endregion
export { GET };
