import { json } from "@sveltejs/kit";
//#region src/routes/.well-known/apple-app-site-association/+server.ts
var GET = () => json({ webcredentials: { apps: ["2P6VCHVJWB.ceo.aven.os"] } });
//#endregion
export { GET };
