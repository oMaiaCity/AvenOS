import { r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/pause/+server.ts
var POST = api(async (event, rt) => {
	const user = await requireUser(event);
	await rt.subscriptions.pause(user.id);
	return { body: { pending: true } };
});
//#endregion
export { POST };
