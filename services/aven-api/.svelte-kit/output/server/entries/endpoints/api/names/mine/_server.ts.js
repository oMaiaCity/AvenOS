import { r as requireUser, t as api } from "../../../../../chunks/api.js";
//#region src/routes/api/names/mine/+server.ts
var GET = api(async (event, rt) => {
	const user = await requireUser(event);
	return { body: { names: await rt.names.listForUser(user.id) } };
});
//#endregion
export { GET };
