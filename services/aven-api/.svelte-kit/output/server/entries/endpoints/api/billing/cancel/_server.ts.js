import { n as readJson, r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/cancel/+server.ts
var POST = api(async (event, rt) => {
	const user = await requireUser(event);
	const body = await readJson(event);
	await rt.subscriptions.cancel(user.id, body.immediate === true);
	return { body: { pending: true } };
});
//#endregion
export { POST };
