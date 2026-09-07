import { r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/orders/+server.ts
var GET = api(async (event, rt) => {
	const user = await requireUser(event);
	return { body: { orders: await rt.subscriptions.orders(user) } };
});
//#endregion
export { GET };
