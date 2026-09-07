import { n as readJson, r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/subscribe/+server.ts
var POST = api(async (event, rt) => {
	const user = await requireUser(event);
	const body = await readJson(event);
	return { body: await rt.subscriptions.subscribe(user, String(body.tier ?? "")) };
});
//#endregion
export { POST };
