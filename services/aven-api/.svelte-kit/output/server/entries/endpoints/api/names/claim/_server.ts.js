import { redirect } from "@sveltejs/kit";
//#region src/routes/api/names/claim/+server.ts
var GET = async (event) => {
	const target = new URL("/purchase/checkout", event.url);
	target.searchParams.set("token", event.url.searchParams.get("token") ?? "");
	redirect(303, `${target.pathname}${target.search}`);
};
//#endregion
export { GET };
