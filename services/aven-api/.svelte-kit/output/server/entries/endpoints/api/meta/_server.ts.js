import { t as runtime } from "../../../../chunks/runtime.js";
import { json } from "@sveltejs/kit";
//#region src/routes/api/meta/+server.ts
var GET = async () => {
	const { config } = await runtime();
	return json({
		priceEur: config.NAME_PRICE_EUR,
		downloadUrl: config.DOWNLOAD_URL,
		requirePasskeyPrf: config.REQUIRE_PASSKEY_PRF
	});
};
//#endregion
export { GET };
