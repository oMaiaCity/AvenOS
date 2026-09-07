import { t as serverBuildRuntime } from "../../../../chunks/runtime2.production.js";
//#region src/routes/purchase/checkout/+page.server.ts
var load = (event) => serverBuildRuntime.loadCheckout(event);
//#endregion
export { load };
