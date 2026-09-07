import { r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/resume/+server.ts
var POST = api(async (event, rt) => {
	const user = await requireUser(event);
	await rt.subscriptions.resume(user.id);
	return { body: { pending: true } };
});
//#endregion
export { POST };
