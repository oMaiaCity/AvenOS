import { r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/billing/invoices/+server.ts
var GET = api(async (event, rt) => {
	const user = await requireUser(event);
	return { body: { invoices: await rt.subscriptions.invoices(user) } };
});
//#endregion
export { GET };
