import { json } from "@sveltejs/kit";
//#region src/routes/api/health/live/+server.ts
var GET = () => json({ status: "ok" });
//#endregion
export { GET };
