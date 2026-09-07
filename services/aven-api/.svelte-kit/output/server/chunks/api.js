import { d as AppError, t as runtime } from "./runtime.js";
import { isRedirect, json } from "@sveltejs/kit";
import { ZodError } from "zod";
//#region src/lib/server/api.ts
function api(handler) {
	return async (event) => {
		const rt = await runtime();
		try {
			const result = await handler(event, rt);
			return json(result.body, { status: result.status ?? 200 });
		} catch (error) {
			if (isRedirect(error)) throw error;
			if (error instanceof AppError) return json({
				code: error.code,
				message: error.message,
				...error.details === void 0 ? {} : { details: error.details }
			}, { status: error.status });
			if (error instanceof ZodError) return json({
				code: "VALIDATION_ERROR",
				message: "The request was invalid.",
				details: error.issues
			}, { status: 400 });
			rt.logger.error({ err: error }, "unhandled api error");
			return json({
				code: "INTERNAL_ERROR",
				message: "The service could not complete the request."
			}, { status: 500 });
		}
	};
}
async function requireUser(event) {
	const session = await (await runtime()).auth.api.getSession({ headers: event.request.headers });
	if (!session) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in is required.");
	if (!session.user.emailVerified) throw new AppError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before continuing.");
	return {
		id: session.user.id,
		name: session.user.name,
		email: session.user.email,
		emailVerified: session.user.emailVerified
	};
}
async function readJson(event) {
	try {
		return await event.request.json();
	} catch {
		throw new AppError(400, "VALIDATION_ERROR", "The request body must be JSON.");
	}
}
//#endregion
export { readJson as n, requireUser as r, api as t };
