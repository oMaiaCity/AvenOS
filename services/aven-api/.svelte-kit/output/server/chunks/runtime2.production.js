import { t as building } from "./internal2.js";
import { d as AppError, i as protectedAuthPaths, n as ProofOfWorkError, t as runtime } from "./runtime.js";
import { t as rateLimit } from "./rate-limit.js";
import { error, json, redirect } from "@sveltejs/kit";
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/integrations/svelte-kit.mjs
var svelteKitHandler = async ({ auth, event, resolve, building }) => {
	if (building) return resolve(event);
	const { request, url } = event;
	if (isAuthPath(url.toString(), auth.options)) return auth.handler(request);
	return resolve(event);
};
function isAuthPath(url, options) {
	const _url = new URL(url);
	const baseURLStr = typeof options.baseURL === "string" ? options.baseURL : void 0;
	const baseURL = new URL(`${baseURLStr || _url.origin}${options.basePath || "/api/auth"}`);
	if (_url.origin !== baseURL.origin) return false;
	if (!_url.pathname.startsWith(baseURL.pathname.endsWith("/") ? baseURL.pathname : `${baseURL.pathname}/`)) return false;
	return true;
}
//#endregion
//#region src/lib/server/build-runtime/runtime.production.ts
var serverBuildRuntime = {
	async handle({ event, resolve }) {
		if (building) return resolve(event);
		const { pathname } = event.url;
		if (pathname === "/.well-known/apple-app-site-association") {
			const response = await resolve(event);
			response.headers.set("Cache-Control", "public, max-age=3600");
			response.headers.set("X-Content-Type-Options", "nosniff");
			return response;
		}
		const { auth, proofOfWork, config, names } = await runtime();
		const normalizedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
		const serviceAuthenticated = pathname.startsWith("/api/webhooks/");
		const publicDeviceExchange = normalizedPath === "/api/auth/device/code" || normalizedPath === "/api/auth/device/token";
		if (pathname.startsWith("/api/") && !serviceAuthenticated && !publicDeviceExchange && ![
			"GET",
			"HEAD",
			"OPTIONS"
		].includes(event.request.method)) {
			const origin = event.request.headers.get("origin");
			if (!(origin === config.PUBLIC_BASE_URL || config.NODE_ENV === "development" && origin === event.url.origin)) {
				if (!(event.request.headers.get("authorization")?.startsWith("Bearer ") ? await auth.api.getSession({ headers: event.request.headers }) : null)) return json({
					code: "ORIGIN_NOT_ALLOWED",
					message: "The request origin is not allowed."
				}, { status: 403 });
			}
		}
		const powPurpose = protectedAuthPaths.get(normalizedPath);
		if (powPurpose && event.request.method === "POST") try {
			await proofOfWork.verifyAndConsume(powPurpose, event.request.headers.get("x-proof-of-work") ?? void 0);
		} catch (error) {
			if (error instanceof ProofOfWorkError) return json({
				code: error.code,
				message: error.message
			}, { status: 403 });
			throw error;
		}
		if (normalizedPath === "/api/auth/device/approve" && event.request.method === "POST") {
			const session = await auth.api.getSession({ headers: event.request.headers });
			if (!session || !await names.ownsAny(session.user.id)) return json({
				code: "NAME_REQUIRED",
				message: "Purchase a name first."
			}, { status: 403 });
		}
		if (normalizedPath === "/api/auth/passkey/generate-register-options" || normalizedPath === "/api/auth/passkey/verify-registration") {
			const session = await auth.api.getSession({ headers: event.request.headers });
			if (!session || !await names.ownsAny(session.user.id)) return json({
				code: "NAME_REQUIRED",
				message: "Purchase a name first."
			}, { status: 403 });
		}
		const response = await svelteKitHandler({
			event,
			resolve,
			auth,
			building
		});
		if (pathname.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");
		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("Referrer-Policy", "same-origin");
		response.headers.set("X-Frame-Options", "DENY");
		return response;
	},
	async loadCheckout(event) {
		if (!rateLimit(`names-claim:${event.getClientAddress()}`, 20, 6e4)) redirect(303, "/purchase/expired");
		const { names, payments, config } = await runtime();
		try {
			return {
				...await names.claim(event.url.searchParams.get("token") ?? ""),
				provider: payments.kind,
				priceEur: config.NAME_PRICE_EUR,
				reservationMinutes: config.NAME_RESERVATION_TTL_MINUTES
			};
		} catch (error$1) {
			if (!(error$1 instanceof AppError)) throw error$1;
			if (error$1.status >= 500) error(error$1.status, { message: error$1.message });
			redirect(303, "/purchase/expired");
		}
	}
};
//#endregion
export { serverBuildRuntime as t };
