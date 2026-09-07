import { r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/me/+server.ts
var GET = api(async (event, rt) => {
	const user = await requireUser(event);
	return { body: { subscription: await rt.subscriptions.me(user.id) } };
});
//#endregion
export { GET };
