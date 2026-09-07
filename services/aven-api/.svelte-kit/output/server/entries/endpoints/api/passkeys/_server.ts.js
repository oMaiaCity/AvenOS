import { d as AppError } from "../../../../chunks/runtime.js";
import { n as readJson, r as requireUser, t as api } from "../../../../chunks/api.js";
import { z } from "zod";
//#region src/routes/api/passkeys/+server.ts
var enrollmentSchema = z.object({
	credentialId: z.string().min(1).optional(),
	prfEnabled: z.boolean()
});
var GET = api(async (event, rt) => {
	const user = await requireUser(event);
	return { body: { passkeys: (await rt.passkeys.status(user.id)).passkeys } };
});
var POST = api(async (event, rt) => {
	const user = await requireUser(event);
	const input = enrollmentSchema.parse(await readJson(event));
	if (rt.config.REQUIRE_PASSKEY_PRF && !input.prfEnabled) throw new AppError(409, "PASSKEY_PRF_REQUIRED", "Passkey PRF support is required.");
	await rt.passkeys.finishEnrollment(user.id, input.prfEnabled, input.credentialId);
	return { body: { enrolled: true } };
});
//#endregion
export { GET, POST };
