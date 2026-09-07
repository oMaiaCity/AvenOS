import { r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/checkout/+server.ts
var GET = api(async (event, rt) => {
	const user = await requireUser(event);
	return { body: { checkout: await rt.subscriptions.checkoutStatus(user.id) } };
});
//#endregion
export { GET };
