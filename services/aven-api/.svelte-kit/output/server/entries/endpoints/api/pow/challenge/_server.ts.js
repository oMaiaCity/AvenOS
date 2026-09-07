import { r as proofOfWorkPurposes, t as runtime } from "../../../../../chunks/runtime.js";
import { t as rateLimit } from "../../../../../chunks/rate-limit.js";
import { json } from "@sveltejs/kit";
//#region src/routes/api/pow/challenge/+server.ts
var GET = async (event) => {
	if (!rateLimit(`pow:${event.getClientAddress()}`, 30, 6e4)) return json({
		code: "RATE_LIMITED",
		message: "Too many challenge requests. Retry shortly."
	}, { status: 429 });
	const purpose = event.url.searchParams.get("purpose") ?? "";
	if (!proofOfWorkPurposes.has(purpose)) return json({
		code: "PROOF_OF_WORK_PURPOSE_INVALID",
		message: "Choose a supported proof-of-work purpose."
	}, { status: 400 });
	const { proofOfWork } = await runtime();
	return json(await proofOfWork.issue(purpose), { headers: { "Cache-Control": "no-store" } });
};
//#endregion
export { GET };
