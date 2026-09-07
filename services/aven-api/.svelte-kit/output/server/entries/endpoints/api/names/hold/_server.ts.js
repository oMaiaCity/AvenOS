import { d as AppError, n as ProofOfWorkError, o as secureNameSchema } from "../../../../../chunks/runtime.js";
import { n as readJson, t as api } from "../../../../../chunks/api.js";
import { t as rateLimit } from "../../../../../chunks/rate-limit.js";
//#region src/routes/api/names/hold/+server.ts
var POST = api(async (event, rt) => {
	if (!rateLimit(`names-hold:${event.getClientAddress()}`, 10, 36e5)) throw new AppError(429, "RATE_LIMITED", "Too many hold attempts. Retry later.");
	try {
		await rt.proofOfWork.verifyAndConsume("secure-name", event.request.headers.get("x-proof-of-work") ?? void 0);
	} catch (error) {
		if (error instanceof ProofOfWorkError) throw new AppError(403, error.code, error.message);
		throw error;
	}
	const input = secureNameSchema.parse(await readJson(event));
	return {
		status: 201,
		body: { hold: await rt.names.secure(input.name, input.email, {
			tier: input.tier,
			salutation: input.salutation,
			idea: input.idea
		}) }
	};
});
//#endregion
export { POST };
