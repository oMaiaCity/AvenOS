import { c as getHost, d as isDynamicBaseURLConfig, f as isRequestLike, i as defu, l as getOrigin, m as wildcardMatch, o as normalizePathname, p as resolveBaseURL, r as createDefu, s as getBaseURL, t as betterFetch, u as getProtocol } from "./dist.js";
import { a as ValidationError, c as env, d as isDevelopment, f as isProduction, i as BetterCallError, l as getBooleanEnvVar, n as BetterAuthError, o as kAPIErrorHeaderSymbol, p as isTest, r as APIError$1, s as ENV, t as APIError, u as getEnvVar } from "./error.js";
import { _ as getAuthTables, a as withSpan, b as logger, c as ATTR_HTTP_ROUTE, d as runWithAdapter, f as runWithTransaction, g as safeJSONParse, h as getBetterAuthVersion, i as generateId$1, l as getCurrentAdapter, m as __getBetterAuthGlobal, n as initGetModelName, o as ATTR_DB_COLLECTION_NAME, p as getAsyncLocalStorage, r as initGetFieldName, s as ATTR_HTTP_RESPONSE_STATUS_CODE, t as createAdapterFactory, u as queueAfterTransactionHook, v as createRandomStringGenerator, x as shouldPublishLog, y as createLogger } from "./factory.js";
import { n as getKyselyDatabaseType, t as createKyselyAdapter } from "./dist2.js";
import { n as sql$1 } from "./compiled-query.js";
import * as z$1 from "zod";
import { ZodObject, ZodOptional, z } from "zod";
import pino from "pino";
import { passkey } from "@better-auth/passkey";
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { bigint, bigserial, boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
//#region src/lib/server/errors.ts
var AppError = class extends Error {
	status;
	code;
	details;
	constructor(status, code, message, details) {
		super(message);
		this.status = status;
		this.code = code;
		this.details = details;
	}
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/utils/error-codes.mjs
function defineErrorCodes(codes) {
	return Object.fromEntries(Object.entries(codes).map(([key, value]) => [key, {
		code: key,
		message: value,
		toString: () => key
	}]));
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/error/codes.mjs
var BASE_ERROR_CODES = defineErrorCodes({
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_USER: "Failed to create user",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	FAILED_TO_UPDATE_USER: "Failed to update user",
	FAILED_TO_GET_SESSION: "Failed to get session",
	INVALID_PASSWORD: "Invalid password",
	INVALID_EMAIL: "Invalid email",
	INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
	INVALID_USER: "Invalid user",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Social account already linked",
	PROVIDER_NOT_FOUND: "Provider not found",
	INVALID_TOKEN: "Invalid token",
	TOKEN_EXPIRED: "Token expired",
	ID_TOKEN_NOT_SUPPORTED: "id_token not supported",
	FAILED_TO_GET_USER_INFO: "Failed to get user info",
	USER_EMAIL_NOT_FOUND: "User email not found",
	EMAIL_NOT_VERIFIED: "Email not verified",
	PASSWORD_TOO_SHORT: "Password too short",
	PASSWORD_TOO_LONG: "Password too long",
	USER_ALREADY_EXISTS: "User already exists.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "User already exists. Use another email.",
	EMAIL_CAN_NOT_BE_UPDATED: "Email can not be updated",
	CHANGE_EMAIL_DISABLED: "Change email is disabled",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Credential account not found",
	SESSION_EXPIRED: "Session expired. Re-authenticate to perform this action.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "You can't unlink your last account",
	ACCOUNT_NOT_FOUND: "Account not found",
	USER_ALREADY_HAS_PASSWORD: "User already has a password. Provide that to delete the account.",
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: "Cross-site navigation login blocked. This request appears to be a CSRF attack.",
	VERIFICATION_EMAIL_NOT_ENABLED: "Verification email isn't enabled",
	EMAIL_ALREADY_VERIFIED: "Email is already verified",
	EMAIL_MISMATCH: "Email mismatch",
	SESSION_NOT_FRESH: "Session is not fresh",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Linked account already exists",
	INVALID_ORIGIN: "Invalid origin",
	INVALID_CALLBACK_URL: "Invalid callbackURL",
	INVALID_REDIRECT_URL: "Invalid redirectURL",
	INVALID_ERROR_CALLBACK_URL: "Invalid errorCallbackURL",
	INVALID_NEW_USER_CALLBACK_URL: "Invalid newUserCallbackURL",
	MISSING_OR_NULL_ORIGIN: "Missing or null Origin",
	CALLBACK_URL_REQUIRED: "callbackURL is required",
	FAILED_TO_CREATE_VERIFICATION: "Unable to create verification",
	FIELD_NOT_ALLOWED: "Field not allowed to be set",
	ASYNC_VALIDATION_NOT_SUPPORTED: "Async validation is not supported",
	VALIDATION_ERROR: "Validation Error",
	MISSING_FIELD: "Field is required",
	METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED: "POST method requires deferSessionRefresh to be enabled in session config",
	BODY_MUST_BE_AN_OBJECT: "Body must be an object",
	PASSWORD_ALREADY_SET: "User already has a password set"
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/crypto/random.mjs
var generateRandomString = createRandomStringGenerator("a-z", "0-9", "A-Z", "-_");
//#endregion
//#region ../../node_modules/.bun/@noble+hashes@2.3.0/node_modules/@noble/hashes/utils.js
/**
* Checks if something is Uint8Array. Be careful: nodejs Buffer will return true.
* @param a - value to test
* @returns `true` when the value is a Uint8Array-compatible view.
* @example
* Check whether a value is a Uint8Array-compatible view.
* ```ts
* isBytes(new Uint8Array([1, 2, 3]));
* ```
*/
function isBytes$1(a) {
	return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle$1 = (title) => title ? `"${title}" ` : "";
/**
* Asserts something is a non-negative integer.
* @param n - number to validate
* @param title - label included in thrown errors
* @returns The validated number.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate a non-negative integer option.
* ```ts
* anumber(32, 'length');
* ```
*/
function anumber$1(n, title = "") {
	if (typeof n !== "number") throw new TypeError(atitle$1(title) + "expected number, got " + typeof n);
	if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(atitle$1(title) + "expected integer >= 0, got " + n);
	return n;
}
/**
* Asserts something is Uint8Array.
* @param value - value to validate
* @param length - optional exact length constraint
* @param title - label included in thrown errors
* @returns The validated byte array.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate that a value is a byte array.
* ```ts
* abytes(new Uint8Array([1, 2, 3]));
* ```
*/
function abytes$1(value, length, title = "") {
	if (isBytes$1(value) && (length === void 0 || value.length === length)) return value;
	if (length !== void 0) anumber$1(length, "length");
	const bytes = isBytes$1(value);
	const ofLen = length !== void 0 ? ` of length ${length}` : "";
	const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
	const message = atitle$1(title) + "expected Uint8Array" + ofLen + ", got " + got;
	if (!bytes) throw new TypeError(message);
	throw new RangeError(message);
}
/**
* Asserts something is a wrapped hash constructor.
* @param h - hash constructor to validate
* @throws On wrong argument types or invalid hash wrapper shape. {@link TypeError}
* @throws On invalid hash metadata ranges or values. {@link RangeError}
* @throws If the hash metadata allows empty outputs or block sizes. {@link Error}
* @example
* Validate a callable hash wrapper.
* ```ts
* import { ahash } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* ahash(sha256);
* ```
*/
function ahash(h) {
	if (typeof h !== "function" || typeof h.create !== "function") throw new TypeError("expected hash wrapped by utils.createHasher");
	anumber$1(h.outputLen);
	anumber$1(h.blockLen);
	if (h.outputLen < 1 || h.blockLen < 1) throw new Error("hash blockLen / outputLen must be >= 1");
}
var aobject$1 = (value, label) => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
/**
* Asserts a hash instance has not been destroyed or finished.
* @param instance - hash instance to validate
* @param checkFinished - whether to reject finalized instances
* @throws If the hash instance has already been destroyed or finalized. {@link Error}
* @example
* Validate that a hash instance is still usable.
* ```ts
* import { aexists } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const hash = sha256.create();
* aexists(hash);
* ```
*/
function aexists$1(instance, checkFinished = true) {
	if (instance.destroyed) throw new Error("hash was destroyed");
	if (checkFinished && instance.finished) throw new Error("digest() was already called");
}
/**
* Asserts output is a sufficiently-sized byte array.
* @param out - destination buffer
* @param instance - hash instance providing output length
* Oversized buffers are allowed; downstream code only promises to fill the first `outputLen` bytes.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate a caller-provided digest buffer.
* ```ts
* import { aoutput } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const hash = sha256.create();
* aoutput(new Uint8Array(hash.outputLen), hash);
* ```
*/
function aoutput$1(out, instance) {
	abytes$1(out, void 0, "output");
	const min = instance.outputLen;
	if (!(out.length >= min)) throw new RangeError("\"output\" expected length >= " + min);
}
/**
* Zeroizes typed arrays in place. Warning: JS provides no guarantees.
* @param arrays - arrays to overwrite with zeros
* @example
* Zeroize sensitive buffers in place.
* ```ts
* clean(new Uint8Array([1, 2, 3]));
* ```
*/
function clean$1(...arrays) {
	for (let i = 0; i < arrays.length; i++) arrays[i].fill(0);
}
/**
* Creates a DataView for byte-level manipulation.
* @param arr - source typed array
* @returns DataView over the same buffer region.
* @example
* Create a DataView over an existing buffer.
* ```ts
* createView(new Uint8Array(4));
* ```
*/
function createView$1(arr) {
	return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/**
* Rotate-right operation for uint32 values.
* @param word - source word
* @param shift - shift amount in bits
* @returns Rotated word.
* @example
* Rotate a 32-bit word to the right.
* ```ts
* rotr(0x12345678, 8);
* ```
*/
function rotr(word, shift) {
	return word << 32 - shift | word >>> shift;
}
/**
* Merges default options and passed options.
* @param defaults - base option object
* @param opts - user overrides
* @param title - label included in thrown override errors
* @returns Merged option object. The merge mutates `defaults` in place.
* @throws On wrong argument types. {@link TypeError}
* @example
* Merge user overrides onto default options.
* ```ts
* checkOpts({ dkLen: 32 }, { asyncTick: 10 });
* ```
*/
function checkOpts$1(defaults, opts, title = "opts") {
	aobject$1(defaults, "defaults");
	if (opts !== void 0) aobject$1(opts, title);
	return Object.assign(defaults, opts);
}
/**
* Creates a callable hash function from a stateful class constructor.
* @param hashCons - hash constructor or factory
* @param info - optional metadata such as DER OID
* @returns Frozen callable hash wrapper with `.create()`.
*   Wrapper construction eagerly calls `hashCons(undefined)` once to read
*   `outputLen` / `blockLen`, so constructor side effects happen at module
*   init time.
* @throws On wrong argument types. {@link TypeError}
* @example
* Wrap a stateful hash constructor into a callable helper.
* ```ts
* import { createHasher } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const wrapped = createHasher(sha256.create, { oid: sha256.oid });
* wrapped(new Uint8Array([1]));
* ```
*/
function createHasher(hashCons, info = {}) {
	if (typeof hashCons !== "function") throw new TypeError("\"hashCons\" expected function, got type=" + typeof hashCons);
	info = checkOpts$1({}, info, "info");
	const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
	const tmp = hashCons(void 0);
	hashC.outputLen = tmp.outputLen;
	hashC.blockLen = tmp.blockLen;
	hashC.canXOF = tmp.canXOF;
	hashC.create = (opts) => hashCons(opts);
	Object.assign(hashC, info);
	return Object.freeze(hashC);
}
/**
* Creates OID metadata for NIST hashes with prefix `06 09 60 86 48 01 65 03 04 02`.
* @param suffix - final OID byte for the selected hash.
*   The helper accepts any byte even though only the documented NIST hash
*   suffixes are meaningful downstream.
* @returns Object containing the DER-encoded OID.
* @example
* Build OID metadata for a NIST hash.
* ```ts
* oidNist(0x01);
* ```
*/
var oidNist = (suffix) => ({ oid: Uint8Array.from([
	6,
	9,
	96,
	134,
	72,
	1,
	101,
	3,
	4,
	2,
	suffix
]) });
//#endregion
//#region ../../node_modules/.bun/@noble+hashes@2.3.0/node_modules/@noble/hashes/hmac.js
/**
* HMAC: RFC2104 message authentication code.
* @module
*/
/**
* Internal class for HMAC.
* Accepts any byte key, although RFC 2104 §3 recommends keys at least
* `HashLen` bytes long.
*/
var _HMAC = class {
	oHash;
	iHash;
	blockLen;
	outputLen;
	canXOF = false;
	finished = false;
	destroyed = false;
	constructor(hash, key) {
		ahash(hash);
		abytes$1(key, void 0, "key");
		this.iHash = hash.create();
		if (typeof this.iHash.update !== "function") throw new Error("expected Hash instance");
		this.blockLen = this.iHash.blockLen;
		this.outputLen = this.iHash.outputLen;
		const blockLen = this.blockLen;
		const pad = new Uint8Array(blockLen);
		pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
		for (let i = 0; i < pad.length; i++) pad[i] ^= 54;
		this.iHash.update(pad);
		this.oHash = hash.create();
		for (let i = 0; i < pad.length; i++) pad[i] ^= 106;
		this.oHash.update(pad);
		clean$1(pad);
	}
	update(buf) {
		aexists$1(this);
		this.iHash.update(buf);
		return this;
	}
	digestInto(out) {
		aexists$1(this);
		aoutput$1(out, this);
		this.finished = true;
		const buf = out.subarray(0, this.outputLen);
		this.iHash.digestInto(buf);
		this.oHash.update(buf);
		this.oHash.digestInto(buf);
		this.destroy();
	}
	digest() {
		const out = new Uint8Array(this.oHash.outputLen);
		this.digestInto(out);
		return out;
	}
	_cloneInto(to) {
		to ||= Object.create(Object.getPrototypeOf(this), {});
		const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
		to = to;
		to.finished = finished;
		to.destroyed = destroyed;
		to.blockLen = blockLen;
		to.outputLen = outputLen;
		to.canXOF = canXOF;
		to.oHash = oHash._cloneInto(to.oHash);
		to.iHash = iHash._cloneInto(to.iHash);
		return to;
	}
	clone() {
		return this._cloneInto();
	}
	destroy() {
		this.destroyed = true;
		this.oHash.destroy();
		this.iHash.destroy();
	}
};
var hmac$1 = /* @__PURE__ */ (() => {
	const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
	hmac_.create = (hash, key) => new _HMAC(hash, key);
	return hmac_;
})();
//#endregion
//#region ../../node_modules/.bun/@noble+hashes@2.3.0/node_modules/@noble/hashes/hkdf.js
/**
* HKDF (RFC 5869): extract + expand in one step.
* See {@link https://soatok.blog/2021/11/17/understanding-hkdf/}.
* @module
*/
var HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
var EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
/**
* HKDF-expand from the spec. The most important part. `HKDF-Expand(PRK, info, L) -> OKM`
* @param hash - hash function that would be used (e.g. sha256)
* @param prk - a pseudorandom key of at least HashLen octets
*   (usually, the output from the extract step)
* @param info - optional context and application specific information (can be a zero-length string)
* @param length - length of output keying material in bytes.
*   RFC 5869 §2.3 allows `0..255*HashLen`, so `0` returns an empty OKM.
* @param _recycled - Internal destroyed extract hashes owned by the combined `hkdf()` call.
* @returns Output keying material with the requested length.
* @throws If the requested output length exceeds the HKDF limit
*   for the selected hash. {@link Error}
* @example
* Run the HKDF expand step.
* ```ts
* import { expand } from '@noble/hashes/hkdf.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* expand(sha256, new Uint8Array(32), new Uint8Array([1, 2, 3]), 16);
* ```
*/
function expand(hash, prk, info, length = 32, _recycled) {
	ahash(hash);
	anumber$1(length, "length");
	abytes$1(prk, void 0, "prk");
	const olen = hash.outputLen;
	if (prk.length < olen) throw new Error("\"prk\" must be at least HashLen octets");
	if (length > 255 * olen) throw new Error("Length must be <= 255*HashLen");
	const blocks = Math.ceil(length / olen);
	if (info === void 0) info = EMPTY_BUFFER;
	else abytes$1(info, void 0, "info");
	if (!blocks) {
		if (_recycled) clean$1(prk);
		return /* @__PURE__ */ new Uint8Array();
	}
	const okm = _recycled && blocks === 1 ? prk : new Uint8Array(blocks * olen);
	const { iHash, oHash } = hmac$1.create(hash, prk);
	const T = _recycled ? prk : new Uint8Array(olen);
	const worker = blocks > 1 ? _recycled?.iHash || hash.create() : void 0;
	for (let counter = 0; counter < blocks - 1; counter++) {
		HKDF_COUNTER[0] = counter + 1;
		const iWork = iHash._cloneInto(worker);
		if (counter) iWork.update(T);
		iWork.update(info).update(HKDF_COUNTER).digestInto(T);
		oHash._cloneInto(worker).update(T).digestInto(T);
		okm.set(T, olen * counter);
	}
	HKDF_COUNTER[0] = blocks;
	if (blocks > 1) iHash.update(T);
	iHash.update(info).update(HKDF_COUNTER).digestInto(T);
	oHash.update(T).digestInto(T);
	okm.set(T, olen * (blocks - 1));
	iHash.destroy();
	oHash.destroy();
	worker?.destroy();
	if (T !== okm) clean$1(T);
	clean$1(HKDF_COUNTER);
	if (length === okm.length) return okm;
	const res = okm.slice(0, length);
	clean$1(okm);
	return res;
}
/**
* HKDF (RFC 5869): derive keys from an initial input.
* Combines hkdf_extract + hkdf_expand in one step
* @param hash - hash function that would be used (e.g. sha256)
* @param ikm - input keying material, the initial key
* @param salt - optional salt value (a non-secret random value)
* @param info - optional context and application specific information bytes
* @param length - length of output keying material in bytes.
*   RFC 5869 §2.3 allows `0..255*HashLen`, so `0` returns an empty OKM.
* @returns Output keying material derived from the input key.
* @throws If the requested output length exceeds the HKDF limit
*   for the selected hash. {@link Error}
* @example
* HKDF (RFC 5869): derive keys from an initial input.
* ```ts
* import { hkdf } from '@noble/hashes/hkdf.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
* const inputKey = randomBytes(32);
* const salt = randomBytes(32);
* const info = utf8ToBytes('application-key');
* const okm = hkdf(sha256, inputKey, salt, info, 32);
* ```
*/
var hkdf = (hash, ikm, salt, info, length) => {
	ahash(hash);
	if (salt === void 0) salt = new Uint8Array(hash.outputLen);
	const HMAC = hmac$1.create(hash, salt).update(ikm);
	return expand(hash, HMAC.digest(), info, length, HMAC);
};
//#endregion
//#region ../../node_modules/.bun/@noble+hashes@2.3.0/node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
	const h = fromNumH(n);
	const l = fromNumL(n);
	view.setUint32(byteOffset, isLE ? l : h, isLE);
	view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
//#endregion
//#region ../../node_modules/.bun/@noble+hashes@2.3.0/node_modules/@noble/hashes/_md.js
/**
* Internal Merkle-Damgard hash utils.
* @module
*/
/**
* Shared 32-bit conditional boolean primitive reused by SHA-256, SHA-1, and MD5 `F`.
* Returns bits from `b` when `a` is set, otherwise from `c`.
* The XOR form is equivalent to MD5's `F(X,Y,Z) = XY v not(X)Z` because the masked terms never
* set the same bit.
* @param a - selector word
* @param b - word chosen when selector bit is set
* @param c - word chosen when selector bit is clear
* @returns Mixed 32-bit word.
* @example
* Combine three words with the shared 32-bit choice primitive.
* ```ts
* Chi(0xffffffff, 0x12345678, 0x87654321);
* ```
*/
function Chi(a, b, c) {
	return a & b ^ ~a & c;
}
/**
* Shared 32-bit majority primitive reused by SHA-256 and SHA-1.
* Returns bits shared by at least two inputs.
* @param a - first input word
* @param b - second input word
* @param c - third input word
* @returns Mixed 32-bit word.
* @example
* Combine three words with the shared 32-bit majority primitive.
* ```ts
* Maj(0xffffffff, 0x12345678, 0x87654321);
* ```
*/
function Maj(a, b, c) {
	return a & b ^ a & c ^ b & c;
}
/**
* Merkle-Damgard hash construction base class.
* Could be used to create MD5, RIPEMD, SHA1, SHA2.
* Accepts only byte-aligned `Uint8Array` input, even when the underlying spec describes bit
* strings with partial-byte tails.
* @param blockLen - internal block size in bytes
* @param outputLen - digest size in bytes
* @param padOffset - trailing length field size in bytes
* @param isLE - whether length and state words are encoded in little-endian
* @example
* Use a concrete subclass to get the shared Merkle-Damgard update/digest flow.
* ```ts
* import { _SHA1 } from '@noble/hashes/legacy.js';
* const hash = new _SHA1();
* hash.update(new Uint8Array([97, 98, 99]));
* hash.digest();
* ```
*/
var HashMD = class {
	blockLen;
	outputLen;
	canXOF = false;
	padOffset;
	isLE;
	buffer;
	view;
	finished = false;
	length = 0;
	pos = 0;
	destroyed = false;
	constructor(blockLen, outputLen, padOffset, isLE) {
		this.blockLen = blockLen;
		this.outputLen = outputLen;
		this.padOffset = padOffset;
		this.isLE = isLE;
		this.buffer = new Uint8Array(blockLen);
		this.view = createView$1(this.buffer);
	}
	update(data) {
		aexists$1(this);
		abytes$1(data);
		const { view, buffer, blockLen } = this;
		const len = data.length;
		let processed = false;
		for (let pos = 0; pos < len;) {
			const take = Math.min(blockLen - this.pos, len - pos);
			if (take === blockLen) {
				const dataView = createView$1(data);
				for (; blockLen <= len - pos; pos += blockLen) this.process(dataView, pos);
				processed = true;
				continue;
			}
			buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
			this.pos += take;
			pos += take;
			if (this.pos === blockLen) {
				this.process(view, 0);
				this.pos = 0;
				processed = true;
			}
		}
		this.length += data.length;
		if (processed) this.roundClean();
		return this;
	}
	digestInto(out) {
		aexists$1(this);
		aoutput$1(out, this);
		this.finished = true;
		const { buffer, view, blockLen, isLE } = this;
		let { pos } = this;
		buffer[pos++] = 128;
		buffer.fill(0, pos);
		if (this.padOffset > blockLen - pos) {
			this.process(view, 0);
			buffer.fill(0);
		}
		setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
		this.process(view, 0);
		this.roundClean();
		const oview = out === buffer ? view : createView$1(out);
		const len = this.outputLen;
		const outLen = len / 4;
		const state = this.get();
		if (len % 4 || outLen > state.length) throw new Error("invalid outputLen");
		for (let i = 0; i < outLen; i++) oview.setUint32(4 * i, state[i], isLE);
	}
	digest() {
		const { buffer, outputLen } = this;
		this.digestInto(buffer);
		const res = buffer.slice(0, outputLen);
		this.destroy();
		return res;
	}
	_cloneIntoMeta(to) {
		const { buffer, length, finished, destroyed, pos } = this;
		to.destroyed = destroyed;
		to.finished = finished;
		to.length = length;
		to.pos = pos;
		if (pos) to.buffer.set(buffer);
		return to;
	}
	clone() {
		return this._cloneInto();
	}
};
/**
* Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
* Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
*/
/** Initial SHA256 state from RFC 6234 §6.1: the first 32 bits of the fractional parts of the
* square roots of the first eight prime numbers. Exported as a shared table; callers must treat
* it as read-only because constructors copy words from it by index. */
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
	1779033703,
	3144134277,
	1013904242,
	2773480762,
	1359893119,
	2600822924,
	528734635,
	1541459225
]);
//#endregion
//#region ../../node_modules/.bun/@noble+hashes@2.3.0/node_modules/@noble/hashes/sha2.js
/**
* SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
* SHA256 is the fastest hash implementable in JS, even faster than Blake3.
* Check out {@link https://www.rfc-editor.org/rfc/rfc4634 | RFC 4634} and
* {@link https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf | FIPS 180-4}.
* @module
*/
/**
* SHA-224 / SHA-256 round constants from RFC 6234 §5.1: the first 32 bits
* of the cube roots of the first 64 primes (2..311).
*/
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
]);
/** Reusable SHA-224 / SHA-256 message schedule buffer `W_t` from RFC 6234 §6.2 step 1. */
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
/** Internal SHA-224 / SHA-256 compression engine from RFC 6234 §6.2. */
var SHA2_32B = class extends HashMD {
	A = 0;
	B = 0;
	C = 0;
	D = 0;
	E = 0;
	F = 0;
	G = 0;
	H = 0;
	constructor(outputLen, IV) {
		super(64, outputLen, 8, false);
		this.A = IV[0] | 0;
		this.B = IV[1] | 0;
		this.C = IV[2] | 0;
		this.D = IV[3] | 0;
		this.E = IV[4] | 0;
		this.F = IV[5] | 0;
		this.G = IV[6] | 0;
		this.H = IV[7] | 0;
	}
	get() {
		const { A, B, C, D, E, F, G, H } = this;
		return [
			A,
			B,
			C,
			D,
			E,
			F,
			G,
			H
		];
	}
	set(A, B, C, D, E, F, G, H) {
		this.A = A | 0;
		this.B = B | 0;
		this.C = C | 0;
		this.D = D | 0;
		this.E = E | 0;
		this.F = F | 0;
		this.G = G | 0;
		this.H = H | 0;
	}
	_cloneInto(to) {
		(to ||= new this.constructor()).set(...this.get());
		return this._cloneIntoMeta(to);
	}
	process(view, offset) {
		for (let i = 0; i < 16; i++, offset += 4) SHA256_W[i] = view.getUint32(offset, false);
		for (let i = 16; i < 64; i++) {
			const W15 = SHA256_W[i - 15];
			const W2 = SHA256_W[i - 2];
			const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
			SHA256_W[i] = (rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10) + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
		}
		let { A, B, C, D, E, F, G, H } = this;
		for (let i = 0; i < 64; i++) {
			const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
			const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
			const T2 = (rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22)) + Maj(A, B, C) | 0;
			H = G;
			G = F;
			F = E;
			E = D + T1 | 0;
			D = C;
			C = B;
			B = A;
			A = T1 + T2 | 0;
		}
		A = A + this.A | 0;
		B = B + this.B | 0;
		C = C + this.C | 0;
		D = D + this.D | 0;
		E = E + this.E | 0;
		F = F + this.F | 0;
		G = G + this.G | 0;
		H = H + this.H | 0;
		this.set(A, B, C, D, E, F, G, H);
	}
	roundClean() {
		clean$1(SHA256_W);
	}
	destroy() {
		this.destroyed = true;
		this.set(0, 0, 0, 0, 0, 0, 0, 0);
		clean$1(this.buffer);
	}
};
/** Internal SHA-256 hash class grounded in RFC 6234 §6.2. */
var _SHA256 = class extends SHA2_32B {
	constructor() {
		super(32, SHA256_IV);
	}
};
/**
* SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
*
* - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
* - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
* - Each sha256 hash is executing 2^18 bit operations.
* - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
* @param msg - message bytes to hash
* @param opts - Reserved hash options.
* @returns Digest bytes.
* @example
* Hash a message with SHA2-256.
* ```ts
* sha256(new Uint8Array([97, 98, 99]));
* ```
*/
var sha256 = /* @__PURE__ */ createHasher(() => new _SHA256(), /* @__PURE__ */ oidNist(1));
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: true });
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
	const size = buffers.reduce((acc, { length }) => acc + length, 0);
	const buf = new Uint8Array(size);
	let i = 0;
	for (const buffer of buffers) {
		buf.set(buffer, i);
		i += buffer.length;
	}
	return buf;
}
function writeUInt32BE(buf, value, offset) {
	if (value < 0 || value >= MAX_INT32) throw new RangeError(`value must be >= 0 and <= ${MAX_INT32 - 1}. Received ${value}`);
	buf.set([
		value >>> 24,
		value >>> 16,
		value >>> 8,
		value & 255
	], offset);
}
function uint64be(value) {
	const high = Math.floor(value / MAX_INT32);
	const low = value % MAX_INT32;
	const buf = /* @__PURE__ */ new Uint8Array(8);
	writeUInt32BE(buf, high, 0);
	writeUInt32BE(buf, low, 4);
	return buf;
}
function uint32be(value) {
	const buf = /* @__PURE__ */ new Uint8Array(4);
	writeUInt32BE(buf, value);
	return buf;
}
function encode$1(string) {
	const bytes = new Uint8Array(string.length);
	for (let i = 0; i < string.length; i++) {
		const code = string.charCodeAt(i);
		if (code > 127) throw new TypeError("non-ASCII string encountered in encode()");
		bytes[i] = code;
	}
	return bytes;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/crypto_key.js
var unusable = (name, prop = "algorithm.name") => /* @__PURE__ */ new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
function checkUsage(key, usage) {
	if (usage && !key.usages.includes(usage)) throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
function checkModulusLength(alg, key) {
	const { modulusLength } = key.algorithm;
	if (typeof modulusLength !== "number" || modulusLength < 2048) throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
function checkCryptoKey(key, expected, usage) {
	const algorithm = key.algorithm;
	if (algorithm.name !== expected.name) throw unusable(expected.name);
	if (expected.hash && algorithm.hash?.name !== expected.hash) throw unusable(expected.hash, "algorithm.hash");
	if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve) throw unusable(expected.namedCurve, "algorithm.namedCurve");
	if (expected.length !== void 0 && algorithm.length !== expected.length) throw unusable(expected.length, "algorithm.length");
	checkUsage(key, usage);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/invalid_key_input.js
function message(msg, actual, ...types) {
	if (types.length > 2) {
		const last = types.pop();
		msg += `one of type ${types.join(", ")}, or ${last}.`;
	} else if (types.length === 2) msg += `one of type ${types[0]} or ${types[1]}.`;
	else msg += `of type ${types[0]}.`;
	if (actual == null) msg += ` Received ${actual}`;
	else if (typeof actual === "function" && actual.name) msg += ` Received function ${actual.name}`;
	else if (typeof actual === "object" && actual != null) {
		if (actual.constructor?.name) msg += ` Received an instance of ${actual.constructor.name}`;
	}
	return msg;
}
var invalidKeyInput = (actual, ...types) => message("Key must be ", actual, ...types);
var withAlg = (alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types);
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
	static code = "ERR_JOSE_GENERIC";
	code = "ERR_JOSE_GENERIC";
	constructor(message, options) {
		super(message, options);
		this.name = this.constructor.name;
		Error.captureStackTrace?.(this, this.constructor);
	}
};
var JWTClaimValidationFailed = class extends JOSEError {
	static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} });
		this.claim = claim;
		this.reason = reason;
		this.payload = payload;
	}
};
var JWTExpired = class extends JOSEError {
	static code = "ERR_JWT_EXPIRED";
	code = "ERR_JWT_EXPIRED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} });
		this.claim = claim;
		this.reason = reason;
		this.payload = payload;
	}
};
var JOSEAlgNotAllowed = class extends JOSEError {
	static code = "ERR_JOSE_ALG_NOT_ALLOWED";
	code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
	static code = "ERR_JOSE_NOT_SUPPORTED";
	code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWEDecryptionFailed = class extends JOSEError {
	static code = "ERR_JWE_DECRYPTION_FAILED";
	code = "ERR_JWE_DECRYPTION_FAILED";
	constructor(message = "decryption operation failed", options) {
		super(message, options);
	}
};
var JWEInvalid = class extends JOSEError {
	static code = "ERR_JWE_INVALID";
	code = "ERR_JWE_INVALID";
};
var JWSInvalid = class extends JOSEError {
	static code = "ERR_JWS_INVALID";
	code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
	static code = "ERR_JWT_INVALID";
	code = "ERR_JWT_INVALID";
};
var JWKInvalid = class extends JOSEError {
	static code = "ERR_JWK_INVALID";
	code = "ERR_JWK_INVALID";
};
var JWKSInvalid = class extends JOSEError {
	static code = "ERR_JWKS_INVALID";
	code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
	static code = "ERR_JWKS_NO_MATCHING_KEY";
	code = "ERR_JWKS_NO_MATCHING_KEY";
	constructor(message = "no applicable key found in the JSON Web Key Set", options) {
		super(message, options);
	}
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
	[Symbol.asyncIterator] = async function* () {};
	static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
	code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
	constructor(message = "multiple matching keys found in the JSON Web Key Set", options) {
		super(message, options);
	}
};
var JWKSTimeout = class extends JOSEError {
	static code = "ERR_JWKS_TIMEOUT";
	code = "ERR_JWKS_TIMEOUT";
	constructor(message = "request timed out", options) {
		super(message, options);
	}
};
var JWSSignatureVerificationFailed = class extends JOSEError {
	static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	constructor(message = "signature verification failed", options) {
		super(message, options);
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/is_key_like.js
function assertCryptoKey(key) {
	if (!isCryptoKey(key)) throw new Error("CryptoKey instance expected");
}
var isCryptoKey = (key) => {
	if (key?.[Symbol.toStringTag] === "CryptoKey") return true;
	try {
		return key instanceof CryptoKey;
	} catch {
		return false;
	}
};
var isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
var isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/content_encryption.js
var generateCek = (enc) => crypto.getRandomValues(new Uint8Array(enc.cekBits >> 3));
function checkCekLength(cek, expected) {
	const actual = cek.byteLength << 3;
	if (actual !== expected) throw new JWEInvalid(`Invalid Content Encryption Key length. Expected ${expected} bits, got ${actual} bits`);
}
var generateIv = (enc) => crypto.getRandomValues(new Uint8Array(enc.ivBits >> 3));
function checkIvLength(enc, iv) {
	if (iv.length << 3 !== enc.ivBits) throw new JWEInvalid("Invalid Initialization Vector length");
}
async function cbcKeySetup(enc, cek, usage) {
	if (!(cek instanceof Uint8Array)) throw new TypeError(invalidKeyInput(cek, "Uint8Array"));
	const keySize = enc.cekBits >> 1;
	return [
		await crypto.subtle.importKey("raw", cek.subarray(keySize >> 3), "AES-CBC", false, [usage]),
		await crypto.subtle.importKey("raw", cek.subarray(0, keySize >> 3), {
			hash: `SHA-${keySize << 1}`,
			name: "HMAC"
		}, false, ["sign"]),
		keySize
	];
}
async function cbcHmacTag(macKey, macData, keySize) {
	return new Uint8Array((await crypto.subtle.sign("HMAC", macKey, macData)).slice(0, keySize >> 3));
}
async function cbcEncrypt(enc, plaintext, cek, iv, aad) {
	const [encKey, macKey, keySize] = await cbcKeySetup(enc, cek, "encrypt");
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
		iv,
		name: "AES-CBC"
	}, encKey, plaintext));
	return {
		ciphertext,
		tag: await cbcHmacTag(macKey, concat(aad, iv, ciphertext, uint64be(aad.length * 8)), keySize),
		iv
	};
}
async function timingSafeEqual$1(a, b) {
	const algorithm = {
		name: "HMAC",
		hash: "SHA-256"
	};
	const key = await crypto.subtle.generateKey(algorithm, false, ["sign", "verify"]);
	const aHmac = await crypto.subtle.sign(algorithm, key, a);
	return crypto.subtle.verify(algorithm, key, aHmac, b);
}
async function cbcDecrypt(enc, cek, ciphertext, iv, tag, aad) {
	const [encKey, macKey, keySize] = await cbcKeySetup(enc, cek, "decrypt");
	const expectedTag = await cbcHmacTag(macKey, concat(aad, iv, ciphertext, uint64be(aad.length * 8)), keySize);
	let macCheckPassed;
	try {
		macCheckPassed = await timingSafeEqual$1(tag, expectedTag);
	} catch {}
	if (!macCheckPassed) throw new JWEDecryptionFailed();
	let plaintext;
	try {
		plaintext = new Uint8Array(await crypto.subtle.decrypt({
			iv,
			name: "AES-CBC"
		}, encKey, ciphertext));
	} catch {}
	if (!plaintext) throw new JWEDecryptionFailed();
	return plaintext;
}
async function gcmEncrypt(enc, plaintext, cek, iv, aad) {
	const encKey = cek instanceof Uint8Array ? await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]) : (checkCryptoKey(cek, enc.subtle, "encrypt"), cek);
	const encrypted = new Uint8Array(await crypto.subtle.encrypt({
		additionalData: aad,
		iv,
		name: "AES-GCM",
		tagLength: 128
	}, encKey, plaintext));
	const tag = encrypted.slice(-16);
	return {
		ciphertext: encrypted.slice(0, -16),
		tag,
		iv
	};
}
async function gcmDecrypt(enc, cek, ciphertext, iv, tag, aad) {
	const encKey = cek instanceof Uint8Array ? await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]) : (checkCryptoKey(cek, enc.subtle, "decrypt"), cek);
	try {
		return new Uint8Array(await crypto.subtle.decrypt({
			additionalData: aad,
			iv,
			name: "AES-GCM",
			tagLength: 128
		}, encKey, concat(ciphertext, tag)));
	} catch {
		throw new JWEDecryptionFailed();
	}
}
async function encrypt(enc, plaintext, cek, iv, aad) {
	if (!isCryptoKey(cek) && !(cek instanceof Uint8Array)) throw new TypeError(invalidKeyInput(cek, "CryptoKey", "KeyObject", "Uint8Array", "JSON Web Key"));
	if (iv) checkIvLength(enc, iv);
	else iv = generateIv(enc);
	if (cek instanceof Uint8Array) checkCekLength(cek, enc.cekBits);
	return enc.cbc ? cbcEncrypt(enc, plaintext, cek, iv, aad) : gcmEncrypt(enc, plaintext, cek, iv, aad);
}
async function decrypt(enc, cek, ciphertext, iv, tag, aad) {
	if (!isCryptoKey(cek) && !(cek instanceof Uint8Array)) throw new TypeError(invalidKeyInput(cek, "CryptoKey", "KeyObject", "Uint8Array", "JSON Web Key"));
	if (!iv) throw new JWEInvalid("JWE Initialization Vector missing");
	if (!tag) throw new JWEInvalid("JWE Authentication Tag missing");
	checkIvLength(enc, iv);
	if (cek instanceof Uint8Array) checkCekLength(cek, enc.cekBits);
	return enc.cbc ? cbcDecrypt(enc, cek, ciphertext, iv, tag, aad) : gcmDecrypt(enc, cek, ciphertext, iv, tag, aad);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/base64.js
function encodeBase64(input) {
	if (Uint8Array.prototype.toBase64) return input.toBase64();
	const CHUNK_SIZE = 32768;
	const arr = [];
	for (let i = 0; i < input.length; i += CHUNK_SIZE) arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
	return btoa(arr.join(""));
}
function decodeBase64(encoded) {
	if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded);
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/util/base64url.js
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
	if (Uint8Array.fromBase64) try {
		return Uint8Array.fromBase64(typeof input === "string" ? input : decoder.decode(input), { alphabet: "base64url" });
	} catch (cause) {
		throw new TypeError(invalid, { cause });
	}
	let encoded = input;
	if (encoded instanceof Uint8Array) encoded = decoder.decode(encoded);
	if (encoded.includes("+") || encoded.includes("/")) throw new TypeError(invalid);
	encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
	try {
		return decodeBase64(encoded);
	} catch {
		throw new TypeError(invalid);
	}
}
function encode(input) {
	let unencoded = input;
	if (typeof unencoded === "string") unencoded = encoder.encode(unencoded);
	if (Uint8Array.prototype.toBase64) return unencoded.toBase64({
		alphabet: "base64url",
		omitPadding: true
	});
	return encodeBase64(unencoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/type_checks.js
function isObject(input) {
	if (typeof input !== "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]") return false;
	const prototype = Object.getPrototypeOf(input);
	if (prototype === null) return true;
	let proto = prototype;
	while (Object.getPrototypeOf(proto) !== null) proto = Object.getPrototypeOf(proto);
	return prototype === proto;
}
function isDisjoint(...headers) {
	const parameters = /* @__PURE__ */ new Set();
	for (const header of headers) {
		if (!header) continue;
		for (const parameter of Object.keys(header)) {
			if (parameters.has(parameter)) return false;
			parameters.add(parameter);
		}
	}
	return true;
}
var isJWK = (key) => isObject(key) && typeof key.kty === "string";
var isPrivateJWK = (key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string");
var isPublicJWK = (key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0;
var isSecretJWK = (key) => key.kty === "oct" && typeof key.k === "string";
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/helpers.js
var unprotected = Symbol();
function assertNotSet(value, name) {
	if (value) throw new TypeError(`${name} can only be called once`);
}
function decodeBase64url(value, label, ErrorClass) {
	try {
		return decode(value);
	} catch {
		throw new ErrorClass(`Failed to base64url decode the ${label}`);
	}
}
function encodeBase64url(value, label, ErrorClass) {
	try {
		return encode$1(value);
	} catch {
		throw new ErrorClass(`The ${label} is not a valid base64url string`);
	}
}
async function digest(algorithm, data) {
	const subtleDigest = `SHA-${algorithm.slice(-3)}`;
	return new Uint8Array(await crypto.subtle.digest(subtleDigest, data));
}
function parseJoseHeader(b64, ErrorClass, message) {
	let parsed;
	try {
		parsed = JSON.parse(strictDecoder.decode(decode(b64)));
	} catch {
		throw new ErrorClass(message);
	}
	if (!isObject(parsed)) throw new ErrorClass(message);
	return parsed;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jwk_to_key.js
async function jwkToKey(entry, jwk) {
	if (jwk.kty === "RSA" && "oth" in jwk && jwk.oth !== void 0) throw new JOSENotSupported("RSA JWK \"oth\" (Other Primes Info) Parameter value is not supported");
	if (!entry.kty.includes(jwk.kty)) throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
	const algorithm = entry.resolve?.({
		kty: jwk.kty,
		crv: jwk.crv
	}) ?? entry.subtle;
	const isPrivate = !!(jwk.d || jwk.priv);
	const keyData = { ...jwk };
	if (keyData.kty !== "AKP") delete keyData.alg;
	delete keyData.use;
	return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/key.js
var tag = (key) => key[Symbol.toStringTag];
var jwkMatchesOp = (entry, key, usage) => {
	const { alg } = entry;
	if (key.use !== void 0) {
		const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
		if (key.use !== expected) throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
	}
	if (key.alg !== void 0 && key.alg !== alg) throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
	if (Array.isArray(key.key_ops)) {
		const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
		if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp)) throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
	}
};
function checkKeyType(entry, key, usage) {
	const { alg, secret } = entry;
	const privateKey = usage === "decrypt" || usage === "sign";
	if (secret && key instanceof Uint8Array) return [BYTES, key];
	if (isJWK(key)) {
		if (secret ? !isSecretJWK(key) : !(privateKey ? isPrivateJWK(key) : isPublicJWK(key))) throw new TypeError(secret ? `JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present` : `JSON Web Key for this operation must be a ${privateKey ? "private" : "public"} JWK`);
		jwkMatchesOp(entry, key, usage);
		return [JWK, key];
	}
	if (!isKeyLike(key)) throw new TypeError(secret ? withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array") : withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
	if (secret) {
		if (key.type !== "secret") throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
	} else {
		if (key.type === "secret") throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
		const expectedType = privateKey ? "private" : "public";
		if ((key.type === "public" || key.type === "private") && key.type !== expectedType) {
			const operation = usage === "sign" ? "signing" : usage === "verify" ? "verifying" : `${usage.slice(0, -1)}tion`;
			throw new TypeError(`${tag(key)} instances for asymmetric algorithm ${operation} must be of type "${expectedType}"`);
		}
	}
	return isCryptoKey(key) ? [CRYPTO, key] : [KEYOBJECT, key];
}
var BYTES = 0;
var CRYPTO = 1;
var KEYOBJECT = 2;
var JWK = 3;
var cache$1;
var nist = {
	__proto__: null,
	prime256v1: "P-256",
	secp384r1: "P-384",
	secp521r1: "P-521"
};
function cached(key, alg, value) {
	cache$1 ||= /* @__PURE__ */ new WeakMap();
	const entry = cache$1.get(key);
	if (value) if (entry) entry[alg] = value;
	else cache$1.set(key, {
		__proto__: null,
		[alg]: value
	});
	return value ?? entry?.[alg];
}
var handleJWK = async (key, jwk, entry) => cached(key, entry.alg) ?? cached(key, entry.alg, await jwkToKey(entry, {
	...jwk,
	alg: entry.alg
}));
var handleKeyObject = (keyObject, entry) => {
	const hit = cached(keyObject, entry.alg);
	if (hit) return hit;
	const isPublic = keyObject.type === "public";
	const usages = entry.usages[isPublic ? 0 : 1];
	const { asymmetricKeyType } = keyObject;
	const crv = nist[keyObject.asymmetricKeyDetails?.namedCurve];
	const params = entry.resolve?.({
		crv,
		asymmetricKeyType
	}) ?? entry.subtle;
	return cached(keyObject, entry.alg, keyObject.toCryptoKey(params, isPublic, usages));
};
async function prepareKey(entry, key, usage) {
	const tagged = checkKeyType(entry, key, usage);
	switch (tagged[0]) {
		case BYTES:
		case CRYPTO: return tagged[1];
		case JWK: {
			const key = tagged[1];
			if (key.k) return decode(key.k);
			if (!Object.isFrozen(key)) {
				const { key_ops } = key;
				if (Array.isArray(key_ops)) Object.freeze(key_ops);
				Object.freeze(key);
			}
			return handleJWK(key, key, entry);
		}
		case KEYOBJECT: {
			const keyObject = tagged[1];
			if (keyObject.type === "secret") return keyObject.export();
			if ("toCryptoKey" in keyObject && typeof keyObject.toCryptoKey === "function") return handleKeyObject(keyObject, entry);
			return handleJWK(keyObject, keyObject.export({ format: "jwk" }), entry);
		}
	}
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
	const out = { __proto__: null };
	for (const alg in entries) out[alg] = {
		...entries[alg],
		alg
	};
	return out;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jwe_algorithms.js
var wrap = [["encrypt", "wrapKey"], ["decrypt", "unwrapKey"]];
var derive = [[], ["deriveBits"]];
var none = [[], []];
function rsaes(bits) {
	return {
		kty: ["RSA"],
		subtle: {
			name: "RSA-OAEP",
			hash: `SHA-${bits}`
		},
		usages: wrap,
		ops: ["wrapKey", "unwrapKey"]
	};
}
function ecdh() {
	return {
		kty: ["EC", "OKP"],
		subtle: { name: "ECDH" },
		resolve: ({ kty, crv, asymmetricKeyType }) => {
			if (crv === "X25519" || asymmetricKeyType === "x25519") return { name: "X25519" };
			if (kty === "OKP") throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
			return {
				name: "ECDH",
				namedCurve: crv
			};
		},
		usages: derive,
		ops: [void 0, "deriveBits"]
	};
}
function aeskw(bits, gcm = false) {
	return {
		kty: ["oct"],
		secret: true,
		subtle: {
			name: gcm ? "AES-GCM" : "AES-KW",
			length: bits
		},
		usages: none,
		ops: gcm ? ["encrypt", "decrypt"] : ["wrapKey", "unwrapKey"]
	};
}
function pbes2() {
	return {
		kty: ["oct"],
		secret: true,
		subtle: { name: "PBKDF2" },
		usages: none,
		ops: ["deriveBits", "deriveBits"]
	};
}
var JWE = table({
	dir: {
		kty: ["oct"],
		secret: true,
		subtle: { name: "AES-GCM" },
		usages: none,
		ops: ["encrypt", "decrypt"]
	},
	"RSA-OAEP": rsaes(1),
	"RSA-OAEP-256": rsaes(256),
	"RSA-OAEP-384": rsaes(384),
	"RSA-OAEP-512": rsaes(512),
	"ECDH-ES": ecdh(),
	"ECDH-ES+A128KW": ecdh(),
	"ECDH-ES+A192KW": ecdh(),
	"ECDH-ES+A256KW": ecdh(),
	A128KW: aeskw(128),
	A192KW: aeskw(192),
	A256KW: aeskw(256),
	A128GCMKW: aeskw(128, true),
	A192GCMKW: aeskw(192, true),
	A256GCMKW: aeskw(256, true),
	"PBES2-HS256+A128KW": pbes2(),
	"PBES2-HS384+A192KW": pbes2(),
	"PBES2-HS512+A256KW": pbes2()
});
var contentOps = ["encrypt", "decrypt"];
function contentEncryption(bits, cbc = false) {
	return {
		kty: ["oct"],
		secret: true,
		subtle: {
			name: cbc ? "AES-CBC" : "AES-GCM",
			length: bits
		},
		usages: none,
		ops: contentOps,
		cekBits: bits,
		ivBits: cbc ? 128 : 96,
		cbc
	};
}
var ENC = table({
	A128GCM: contentEncryption(128),
	A192GCM: contentEncryption(192),
	A256GCM: contentEncryption(256),
	"A128CBC-HS256": contentEncryption(256, true),
	"A192CBC-HS384": contentEncryption(384, true),
	"A256CBC-HS512": contentEncryption(512, true)
});
function unsupported(parameter, name) {
	throw new JOSENotSupported(`Invalid or unsupported "${parameter}" (JWE ${name}) header value`);
}
function jweAlgorithm(alg) {
	return (typeof alg === "string" ? JWE[alg] : void 0) ?? unsupported("alg", "Algorithm");
}
function jweEncryption(enc) {
	return (typeof enc === "string" ? ENC[enc] : void 0) ?? unsupported("enc", "Encryption Algorithm");
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/key_management.js
function checkEcdhCryptoKey(key, usage) {
	if (key.algorithm.name !== "ECDH" && key.algorithm.name !== "X25519") throw new TypeError("CryptoKey does not support this operation, its algorithm.name must be ECDH or X25519");
	checkUsage(key, usage);
}
async function aeskwCryptoKey(key, alg, usage) {
	const expected = jweAlgorithm(alg).subtle;
	const cryptoKey = key instanceof Uint8Array ? await crypto.subtle.importKey("raw", key, "AES-KW", true, [usage]) : key;
	checkCryptoKey(cryptoKey, expected, usage);
	return cryptoKey;
}
async function aeskwWrap(alg, key, cek) {
	const cryptoKey = await aeskwCryptoKey(key, alg, "wrapKey");
	const cryptoKeyCek = await crypto.subtle.importKey("raw", cek, {
		hash: "SHA-256",
		name: "HMAC"
	}, true, ["sign"]);
	return new Uint8Array(await crypto.subtle.wrapKey("raw", cryptoKeyCek, cryptoKey, "AES-KW"));
}
async function aeskwUnwrap(alg, key, encryptedKey) {
	const cryptoKey = await aeskwCryptoKey(key, alg, "unwrapKey");
	const cryptoKeyCek = await crypto.subtle.unwrapKey("raw", encryptedKey, cryptoKey, "AES-KW", {
		hash: "SHA-256",
		name: "HMAC"
	}, true, ["sign"]);
	return new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKeyCek));
}
function checkRsaKey(alg, key, usage) {
	checkCryptoKey(key, jweAlgorithm(alg).subtle, usage);
	checkModulusLength(alg, key);
}
function pbes2CryptoKey(key, alg) {
	if (key instanceof Uint8Array) return crypto.subtle.importKey("raw", key, "PBKDF2", false, ["deriveBits"]);
	checkCryptoKey(key, jweAlgorithm(alg).subtle, "deriveBits");
	return key;
}
async function deriveKey(p2s, alg, p2c, key) {
	if (!(p2s instanceof Uint8Array) || p2s.length < 8) throw new JWEInvalid("PBES2 Salt Input must be 8 or more octets");
	if (!Number.isSafeInteger(p2c) || Math.sign(p2c) !== 1) throw new JWEInvalid("PBES2 Count Input must be a positive integer");
	const salt = concat(encode$1(alg), Uint8Array.of(0), p2s);
	const keylen = parseInt(alg.slice(13, 16), 10);
	const subtleAlg = {
		hash: `SHA-${alg.slice(8, 11)}`,
		iterations: p2c,
		name: "PBKDF2",
		salt
	};
	const cryptoKey = await pbes2CryptoKey(key, alg);
	return new Uint8Array(await crypto.subtle.deriveBits(subtleAlg, cryptoKey, keylen));
}
function lengthAndInput(input) {
	return concat(uint32be(input.length), input);
}
async function concatKdf(Z, L, OtherInfo) {
	const dkLen = L >> 3;
	const hashLen = 32;
	const reps = Math.ceil(dkLen / hashLen);
	const dk = new Uint8Array(reps * hashLen);
	for (let i = 1; i <= reps; i++) {
		const hashResult = await digest("sha256", concat(uint32be(i), Z, OtherInfo));
		dk.set(hashResult, (i - 1) * hashLen);
	}
	return dk.slice(0, dkLen);
}
async function ecdhesDeriveKey(publicKey, privateKey, algorithm, keyLength, apu = /* @__PURE__ */ new Uint8Array(), apv = /* @__PURE__ */ new Uint8Array()) {
	checkEcdhCryptoKey(publicKey);
	checkEcdhCryptoKey(privateKey, "deriveBits");
	const otherInfo = concat(lengthAndInput(encode$1(algorithm)), lengthAndInput(apu), lengthAndInput(apv), uint32be(keyLength));
	return concatKdf(new Uint8Array(await crypto.subtle.deriveBits({
		name: publicKey.algorithm.name,
		public: publicKey
	}, privateKey, publicKey.algorithm.name === "X25519" ? 256 : Math.ceil(parseInt(publicKey.algorithm.namedCurve.slice(-3), 10) / 8) << 3)), keyLength, otherInfo);
}
function assertEcdhKey(key) {
	assertCryptoKey(key);
	const curve = key.algorithm.namedCurve;
	if (curve !== "P-256" && curve !== "P-384" && curve !== "P-521" && key.algorithm.name !== "X25519") throw new JOSENotSupported("ECDH with the provided key is not allowed or not supported by your javascript runtime");
}
function assertEncryptedKey(encryptedKey) {
	if (encryptedKey === void 0) throw new JWEInvalid("JWE Encrypted Key missing");
}
function assertNoEncryptedKey(encryptedKey) {
	if (encryptedKey !== void 0) throw new JWEInvalid("Encountered unexpected JWE Encrypted Key");
}
async function decryptKeyManagement(alg, enc, key, encryptedKey, joseHeader, options) {
	const entry = jweAlgorithm(alg);
	if (alg === "dir") {
		assertNoEncryptedKey(encryptedKey);
		return key;
	}
	switch (entry.subtle.name) {
		case "ECDH": {
			if (alg === "ECDH-ES") assertNoEncryptedKey(encryptedKey);
			if (!isObject(joseHeader.epk)) throw new JWEInvalid(`JOSE Header "epk" (Ephemeral Public Key) missing or invalid`);
			assertEcdhKey(key);
			const epk = await jwkToKey(entry, joseHeader.epk);
			let partyUInfo;
			let partyVInfo;
			if (joseHeader.apu !== void 0) {
				if (typeof joseHeader.apu !== "string") throw new JWEInvalid(`JOSE Header "apu" (Agreement PartyUInfo) invalid`);
				partyUInfo = decodeBase64url(joseHeader.apu, "apu", JWEInvalid);
			}
			if (joseHeader.apv !== void 0) {
				if (typeof joseHeader.apv !== "string") throw new JWEInvalid(`JOSE Header "apv" (Agreement PartyVInfo) invalid`);
				partyVInfo = decodeBase64url(joseHeader.apv, "apv", JWEInvalid);
			}
			const sharedSecret = await ecdhesDeriveKey(epk, key, alg === "ECDH-ES" ? enc.alg : alg, alg === "ECDH-ES" ? enc.cekBits : parseInt(alg.slice(-5, -2), 10), partyUInfo, partyVInfo);
			if (alg === "ECDH-ES") return sharedSecret;
			assertEncryptedKey(encryptedKey);
			return aeskwUnwrap(alg.slice(-6), sharedSecret, encryptedKey);
		}
		case "RSA-OAEP":
			assertEncryptedKey(encryptedKey);
			assertCryptoKey(key);
			checkRsaKey(alg, key, "decrypt");
			return new Uint8Array(await crypto.subtle.decrypt("RSA-OAEP", key, encryptedKey));
		case "PBKDF2": {
			assertEncryptedKey(encryptedKey);
			if (typeof joseHeader.p2c !== "number") throw new JWEInvalid(`JOSE Header "p2c" (PBES2 Count) missing or invalid`);
			const p2cLimit = options?.maxPBES2Count || 1e4;
			if (joseHeader.p2c > p2cLimit) throw new JWEInvalid(`JOSE Header "p2c" (PBES2 Count) out is of acceptable bounds`);
			if (typeof joseHeader.p2s !== "string") throw new JWEInvalid(`JOSE Header "p2s" (PBES2 Salt) missing or invalid`);
			const derived = await deriveKey(decodeBase64url(joseHeader.p2s, "p2s", JWEInvalid), alg, joseHeader.p2c, key);
			return aeskwUnwrap(alg.slice(-6), derived, encryptedKey);
		}
		case "AES-KW":
			assertEncryptedKey(encryptedKey);
			return aeskwUnwrap(alg, key, encryptedKey);
		case "AES-GCM": {
			assertEncryptedKey(encryptedKey);
			if (typeof joseHeader.iv !== "string") throw new JWEInvalid(`JOSE Header "iv" (Initialization Vector) missing or invalid`);
			if (typeof joseHeader.tag !== "string") throw new JWEInvalid(`JOSE Header "tag" (Authentication Tag) missing or invalid`);
			let iv;
			iv = decodeBase64url(joseHeader.iv, "iv", JWEInvalid);
			let tag;
			tag = decodeBase64url(joseHeader.tag, "tag", JWEInvalid);
			return decrypt(jweEncryption(alg.slice(0, -2)), key, encryptedKey, iv, tag, /* @__PURE__ */ new Uint8Array());
		}
	}
}
async function encryptKeyManagement(alg, enc, key, providedCek, providedParameters = {}) {
	let encryptedKey;
	let parameters;
	let cek;
	const entry = jweAlgorithm(alg);
	if (alg === "dir") return [
		key,
		void 0,
		void 0
	];
	switch (entry.subtle.name) {
		case "ECDH": {
			assertEcdhKey(key);
			const { apu, apv } = providedParameters;
			let ephemeralKey;
			if (providedParameters.epk) ephemeralKey = await prepareKey(entry, providedParameters.epk, "decrypt");
			else ephemeralKey = (await crypto.subtle.generateKey(key.algorithm, true, ["deriveBits"])).privateKey;
			const subtle = crypto.subtle;
			let exportableEpk = ephemeralKey;
			if (!exportableEpk.extractable) {
				if (typeof subtle.getPublicKey !== "function") throw new TypeError("CryptoKey for \"epk\" must be extractable");
				exportableEpk = await subtle.getPublicKey(ephemeralKey, []);
			}
			const { x, y, crv, kty } = await subtle.exportKey("jwk", exportableEpk);
			const sharedSecret = await ecdhesDeriveKey(key, ephemeralKey, alg === "ECDH-ES" ? enc.alg : alg, alg === "ECDH-ES" ? enc.cekBits : parseInt(alg.slice(-5, -2), 10), apu, apv);
			parameters = { epk: {
				x,
				crv,
				kty
			} };
			if (kty === "EC") parameters.epk.y = y;
			if (apu) parameters.apu = encode(apu);
			if (apv) parameters.apv = encode(apv);
			if (alg === "ECDH-ES") {
				cek = sharedSecret;
				break;
			}
			cek = providedCek || generateCek(enc);
			encryptedKey = await aeskwWrap(alg.slice(-6), sharedSecret, cek);
			break;
		}
		case "RSA-OAEP":
			cek = providedCek || generateCek(enc);
			assertCryptoKey(key);
			checkRsaKey(alg, key, "encrypt");
			encryptedKey = new Uint8Array(await crypto.subtle.encrypt("RSA-OAEP", key, cek));
			break;
		case "PBKDF2": {
			cek = providedCek || generateCek(enc);
			const { p2c = 2048, p2s = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16)) } = providedParameters;
			const derived = await deriveKey(p2s, alg, p2c, key);
			encryptedKey = await aeskwWrap(alg.slice(-6), derived, cek);
			parameters = {
				p2c,
				p2s: encode(p2s)
			};
			break;
		}
		case "AES-KW":
			cek = providedCek || generateCek(enc);
			encryptedKey = await aeskwWrap(alg, key, cek);
			break;
		case "AES-GCM": {
			cek = providedCek || generateCek(enc);
			const { iv } = providedParameters;
			const wrapped = await encrypt(jweEncryption(alg.slice(0, -2)), cek, key, iv, /* @__PURE__ */ new Uint8Array());
			encryptedKey = wrapped.ciphertext;
			parameters = {
				iv: encode(wrapped.iv),
				tag: encode(wrapped.tag)
			};
			break;
		}
	}
	return [
		cek,
		encryptedKey,
		parameters
	];
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/options.js
var JWS_RECOGNIZED = {
	__proto__: null,
	b64: true
};
var JWE_RECOGNIZED = { __proto__: null };
function validateAlgorithms(option, algorithms) {
	if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) throw new TypeError(`"${option}" option must be an array of strings`);
	if (!algorithms) return;
	return new Set(algorithms);
}
function validateCritDuplicates(Err, protectedHeader) {
	const { crit } = protectedHeader ?? {};
	if (Array.isArray(crit) && new Set(crit).size !== crit.length) throw new Err("\"crit\" (Critical) Header Parameter MUST NOT contain duplicate values");
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
	if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) throw new Err("\"crit\" (Critical) Header Parameter MUST be integrity protected");
	if (!protectedHeader || protectedHeader.crit === void 0) return [];
	if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) throw new Err("\"crit\" (Critical) Header Parameter MUST be an array of non-empty strings when present");
	const recognized = recognizedOption === void 0 ? recognizedDefault : {
		__proto__: null,
		...recognizedOption,
		...recognizedDefault
	};
	for (const parameter of protectedHeader.crit) {
		if (!(parameter in recognized)) throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
		if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0) throw new Err(`Extension Header Parameter "${parameter}" is missing`);
		if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0)) throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
	}
	return protectedHeader.crit;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/deflate.js
function supported(name) {
	if (typeof globalThis[name] === "undefined") throw new JOSENotSupported(`JWE "zip" (Compression Algorithm) Header Parameter requires the ${name} API.`);
}
async function compress(input) {
	supported("CompressionStream");
	const cs = new CompressionStream("deflate-raw");
	const writer = cs.writable.getWriter();
	writer.write(input).catch(() => {});
	writer.close().catch(() => {});
	const chunks = [];
	const reader = cs.readable.getReader();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	return concat(...chunks);
}
async function decompress(input, maxLength) {
	supported("DecompressionStream");
	const ds = new DecompressionStream("deflate-raw");
	const writer = ds.writable.getWriter();
	writer.write(input).catch(() => {});
	writer.close().catch(() => {});
	const chunks = [];
	let length = 0;
	const reader = ds.readable.getReader();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		chunks.push(value);
		length += value.byteLength;
		if (maxLength !== Infinity && length > maxLength) throw new JWEInvalid("Decompressed plaintext exceeded the configured limit");
	}
	return concat(...chunks);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jwe_decrypt.js
function shareJWE(jwe) {
	const { protected: encodedProtected, ciphertext, iv, tag, aad } = jwe;
	let parsedProt;
	if (encodedProtected) parsedProt = parseJoseHeader(encodedProtected, JWEInvalid, "JWE Protected Header is invalid");
	const protectedHeader = encodedProtected !== void 0 ? encode$1(encodedProtected) : /* @__PURE__ */ new Uint8Array();
	return [
		parsedProt,
		decodeBase64url(ciphertext, "ciphertext", JWEInvalid),
		iv !== void 0 ? decodeBase64url(iv, "iv", JWEInvalid) : void 0,
		tag !== void 0 ? decodeBase64url(tag, "tag", JWEInvalid) : void 0,
		aad !== void 0 ? concat(protectedHeader, encode$1("."), encodeBase64url(aad, "aad", JWEInvalid)) : protectedHeader
	];
}
function prepareDecrypt(options) {
	return [
		options && validateAlgorithms("keyManagementAlgorithms", options.keyManagementAlgorithms),
		options && validateAlgorithms("contentEncryptionAlgorithms", options.contentEncryptionAlgorithms),
		options
	];
}
async function decryptRecipient(jwe, token, shared, key) {
	const [keyManagementAlgorithms, contentEncryptionAlgorithms, options] = shared;
	const [parsedProt, ciphertext, iv, tag, additionalData] = token;
	const { encrypted_key: encodedKey, header, unprotected } = jwe;
	let joseHeader;
	if (header !== void 0 || unprotected !== void 0) {
		if (!isDisjoint(parsedProt, header, unprotected)) throw new JWEInvalid("JWE Protected, JWE Unprotected Header, and JWE Per-Recipient Unprotected Header Parameter names must be disjoint");
		joseHeader = {
			...parsedProt,
			...header,
			...unprotected
		};
	} else joseHeader = parsedProt ?? {};
	validateCrit(JWEInvalid, JWE_RECOGNIZED, options?.crit, parsedProt, joseHeader);
	if (joseHeader.zip !== void 0 && joseHeader.zip !== "DEF") throw new JOSENotSupported("Unsupported JWE \"zip\" (Compression Algorithm) Header Parameter value.");
	if (joseHeader.zip !== void 0 && !parsedProt?.zip) throw new JWEInvalid("JWE \"zip\" (Compression Algorithm) Header Parameter MUST be in a protected header.");
	const { alg, enc } = joseHeader;
	if (typeof alg !== "string" || !alg) throw new JWEInvalid("missing JWE Algorithm (alg) in JWE Header");
	if (typeof enc !== "string" || !enc) throw new JWEInvalid("missing JWE Encryption Algorithm (enc) in JWE Header");
	if (keyManagementAlgorithms && !keyManagementAlgorithms.has(alg) || !keyManagementAlgorithms && alg.startsWith("PBES2")) throw new JOSEAlgNotAllowed("\"alg\" (Algorithm) Header Parameter value not allowed");
	if (contentEncryptionAlgorithms && !contentEncryptionAlgorithms.has(enc)) throw new JOSEAlgNotAllowed("\"enc\" (Encryption Algorithm) Header Parameter value not allowed");
	const encEntry = jweEncryption(enc);
	let encryptedKey;
	if (encodedKey !== void 0) encryptedKey = decodeBase64url(encodedKey, "encrypted_key", JWEInvalid);
	let resolvedKey = false;
	if (typeof key === "function") {
		key = await key(parsedProt, jwe);
		resolvedKey = true;
	}
	const algEntry = jweAlgorithm(alg);
	const k = await prepareKey(alg === "dir" ? encEntry : algEntry, key, "decrypt");
	let cek;
	try {
		cek = await decryptKeyManagement(alg, encEntry, k, encryptedKey, joseHeader, options);
	} catch (err) {
		if (err instanceof TypeError || err instanceof JWEInvalid || err instanceof JOSENotSupported) throw err;
		cek = generateCek(encEntry);
	}
	let plaintext = await decrypt(encEntry, cek, ciphertext, iv, tag, additionalData);
	if (joseHeader.zip === "DEF") {
		const maxDecompressedLength = options?.maxDecompressedLength ?? 25e4;
		if (maxDecompressedLength === 0) throw new JOSENotSupported("JWE \"zip\" (Compression Algorithm) Header Parameter is not supported.");
		if (maxDecompressedLength !== Infinity && (!Number.isSafeInteger(maxDecompressedLength) || maxDecompressedLength < 1)) throw new TypeError("maxDecompressedLength must be 0, a positive safe integer, or Infinity");
		plaintext = await decompress(plaintext, maxDecompressedLength).catch((cause) => {
			if (cause instanceof JWEInvalid) throw cause;
			throw new JWEInvalid("Failed to decompress plaintext", { cause });
		});
	}
	return [
		plaintext,
		parsedProt,
		k,
		resolvedKey
	];
}
async function decryptJWE(jwe, shared, key) {
	return decryptRecipient(jwe, shareJWE(jwe), shared, key);
}
async function decryptCompact(jwe, shared, key) {
	if (jwe instanceof Uint8Array) jwe = decoder.decode(jwe);
	if (typeof jwe !== "string") throw new JWEInvalid("Compact JWE must be a string or Uint8Array");
	const { 0: protectedHeader, 1: encryptedKey, 2: iv, 3: ciphertext, 4: tag, length } = jwe.split(".");
	if (length !== 5) throw new JWEInvalid("Invalid Compact JWE");
	return decryptJWE({
		ciphertext,
		iv: iv || void 0,
		protected: protectedHeader,
		tag: tag || void 0,
		encrypted_key: encryptedKey || void 0
	}, shared, key);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jwe_encrypt.js
function checkDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader) {
	if (!isDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader)) throw new JWEInvalid("JWE Protected, JWE Shared Unprotected and JWE Per-Recipient Header Parameter names must be disjoint");
}
function checkEncryptHeaders(input) {
	const [, protectedHeader, unprotectedHeader, sharedUnprotectedHeader, , , , , crit] = input;
	checkDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader);
	const joseHeader = {
		...protectedHeader,
		...unprotectedHeader,
		...sharedUnprotectedHeader
	};
	validateCrit(JWEInvalid, JWE_RECOGNIZED, crit, protectedHeader, joseHeader);
	if (joseHeader.zip !== void 0 && joseHeader.zip !== "DEF") throw new JOSENotSupported("Unsupported JWE \"zip\" (Compression Algorithm) Header Parameter value.");
	if (joseHeader.zip !== void 0 && !protectedHeader?.zip) throw new JWEInvalid("JWE \"zip\" (Compression Algorithm) Header Parameter MUST be in a protected header.");
	const { alg, enc } = joseHeader;
	if (typeof alg !== "string" || !alg) throw new JWEInvalid("JWE \"alg\" (Algorithm) Header Parameter missing or invalid");
	if (typeof enc !== "string" || !enc) throw new JWEInvalid("JWE \"enc\" (Encryption Algorithm) Header Parameter missing or invalid");
	return [
		joseHeader,
		alg,
		enc,
		jweEncryption(enc)
	];
}
async function encryptJWE(input, checked, key) {
	const [joseHeader, alg, , encEntry] = checked;
	const [inputPlaintext, inputProtectedHeader, inputUnprotectedHeader, sharedUnprotectedHeader, aad, providedCek, inputIv, keyManagementParameters, , unprotectedParameters] = input;
	let protectedHeader = inputProtectedHeader;
	let unprotectedHeader = inputUnprotectedHeader;
	if (providedCek && (alg === "dir" || alg === "ECDH-ES")) throw new TypeError(`setContentEncryptionKey cannot be called with JWE "alg" (Algorithm) Header ${alg}`);
	const algEntry = jweAlgorithm(alg);
	const [cek, encryptedKey, parameters] = await encryptKeyManagement(alg, encEntry, await prepareKey(alg === "dir" ? encEntry : algEntry, key, "encrypt"), providedCek, keyManagementParameters);
	if (parameters) {
		if (unprotectedParameters) unprotectedHeader = unprotectedHeader ? {
			...unprotectedHeader,
			...parameters
		} : parameters;
		else protectedHeader = protectedHeader ? {
			...protectedHeader,
			...parameters
		} : parameters;
		checkDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader);
	}
	let protectedHeaderS;
	let protectedHeaderB;
	if (protectedHeader) {
		protectedHeaderS = encode(JSON.stringify(protectedHeader));
		protectedHeaderB = encode$1(protectedHeaderS);
	} else {
		protectedHeaderS = "";
		protectedHeaderB = /* @__PURE__ */ new Uint8Array();
	}
	let additionalData;
	let aadMember;
	if (aad?.byteLength) {
		aadMember = encode(aad);
		additionalData = concat(protectedHeaderB, encode$1("."), encode$1(aadMember));
	} else additionalData = protectedHeaderB;
	let plaintext = inputPlaintext;
	if (joseHeader.zip === "DEF") plaintext = await compress(plaintext).catch((cause) => {
		throw new JWEInvalid("Failed to compress plaintext", { cause });
	});
	const { ciphertext, tag, iv } = await encrypt(encEntry, plaintext, cek, inputIv, additionalData);
	const jwe = { ciphertext: encode(ciphertext) };
	if (iv) jwe.iv = encode(iv);
	if (tag) jwe.tag = encode(tag);
	if (encryptedKey) jwe.encrypted_key = encode(encryptedKey);
	if (aadMember) jwe.aad = aadMember;
	if (protectedHeader) jwe.protected = protectedHeaderS;
	if (sharedUnprotectedHeader) jwe.unprotected = sharedUnprotectedHeader;
	if (unprotectedHeader) jwe.header = unprotectedHeader;
	return jwe;
}
async function createJWE(input, key) {
	return encryptJWE(input, checkEncryptHeaders(input), key);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwe/flattened/encrypt.js
var FlattenedEncrypt = class {
	#plaintext;
	#protectedHeader;
	#sharedUnprotectedHeader;
	#unprotectedHeader;
	#aad;
	#cek;
	#iv;
	#keyManagementParameters;
	constructor(plaintext) {
		if (!(plaintext instanceof Uint8Array)) throw new TypeError("plaintext must be an instance of Uint8Array");
		this.#plaintext = plaintext;
	}
	setKeyManagementParameters(parameters) {
		assertNotSet(this.#keyManagementParameters, "setKeyManagementParameters");
		this.#keyManagementParameters = parameters;
		return this;
	}
	setProtectedHeader(protectedHeader) {
		assertNotSet(this.#protectedHeader, "setProtectedHeader");
		this.#protectedHeader = protectedHeader;
		return this;
	}
	setSharedUnprotectedHeader(sharedUnprotectedHeader) {
		assertNotSet(this.#sharedUnprotectedHeader, "setSharedUnprotectedHeader");
		this.#sharedUnprotectedHeader = sharedUnprotectedHeader;
		return this;
	}
	setUnprotectedHeader(unprotectedHeader) {
		assertNotSet(this.#unprotectedHeader, "setUnprotectedHeader");
		this.#unprotectedHeader = unprotectedHeader;
		return this;
	}
	setAdditionalAuthenticatedData(aad) {
		this.#aad = aad;
		return this;
	}
	setContentEncryptionKey(cek) {
		assertNotSet(this.#cek, "setContentEncryptionKey");
		this.#cek = cek;
		return this;
	}
	setInitializationVector(iv) {
		assertNotSet(this.#iv, "setInitializationVector");
		this.#iv = iv;
		return this;
	}
	async encrypt(key, options) {
		if (!this.#protectedHeader && !this.#unprotectedHeader && !this.#sharedUnprotectedHeader) throw new JWEInvalid("either setProtectedHeader, setUnprotectedHeader, or sharedUnprotectedHeader must be called before #encrypt()");
		validateCritDuplicates(JWEInvalid, this.#protectedHeader);
		return createJWE([
			this.#plaintext,
			this.#protectedHeader,
			this.#unprotectedHeader,
			this.#sharedUnprotectedHeader,
			this.#aad,
			this.#cek,
			this.#iv,
			this.#keyManagementParameters,
			options?.crit,
			options ? unprotected in options : false
		], key);
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/signing.js
async function getSigKey(entry, key, usage) {
	if (key instanceof Uint8Array) return crypto.subtle.importKey("raw", key, entry.subtle, false, [usage]);
	checkCryptoKey(key, entry.subtle, usage);
	if (entry.minRsaBits) checkModulusLength(entry.alg, key);
	return key;
}
async function sign(entry, key, data) {
	const cryptoKey = await getSigKey(entry, key, "sign");
	const signature = await crypto.subtle.sign(entry.signing, cryptoKey, data);
	return new Uint8Array(signature);
}
async function verify(entry, key, signature, data) {
	const cryptoKey = await getSigKey(entry, key, "verify");
	try {
		return await crypto.subtle.verify(entry.signing, cryptoKey, signature, data);
	} catch {
		return false;
	}
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
	const subtle = {
		name: "HMAC",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["oct"],
		secret: true,
		subtle,
		signing: subtle,
		usages: sig
	};
}
function rsa(bits, saltLength) {
	const subtle = {
		name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["RSA"],
		subtle,
		signing: saltLength ? {
			...subtle,
			saltLength
		} : subtle,
		usages: sig,
		minRsaBits: 2048
	};
}
function ecdsa(crv, bits) {
	return {
		kty: ["EC"],
		crv,
		subtle: {
			name: "ECDSA",
			namedCurve: crv
		},
		signing: {
			name: "ECDSA",
			hash: `SHA-${bits}`
		},
		usages: sig
	};
}
function eddsa() {
	const subtle = { name: "Ed25519" };
	return {
		kty: ["OKP"],
		crv: "Ed25519",
		subtle,
		signing: subtle,
		usages: sig
	};
}
function mldsa(bits) {
	const subtle = { name: `ML-DSA-${bits}` };
	return {
		kty: ["AKP"],
		subtle,
		signing: subtle,
		usages: sig
	};
}
var JWS = table({
	HS256: hmac(256),
	HS384: hmac(384),
	HS512: hmac(512),
	RS256: rsa(256),
	RS384: rsa(384),
	RS512: rsa(512),
	PS256: rsa(256, 32),
	PS384: rsa(384, 48),
	PS512: rsa(512, 64),
	ES256: ecdsa("P-256", 256),
	ES384: ecdsa("P-384", 384),
	ES512: ecdsa("P-521", 512),
	EdDSA: eddsa(),
	Ed25519: eddsa(),
	"ML-DSA-44": mldsa(44),
	"ML-DSA-65": mldsa(65),
	"ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
	const entry = typeof alg === "string" ? JWS[alg] : void 0;
	if (!entry) throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
	return entry;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
	return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
async function verifySignature$1(jws, shared, key) {
	const { protected: encodedProtected, header, payload: inputPayload } = jws;
	let parsedProt = {};
	if (encodedProtected) parsedProt = parseJoseHeader(encodedProtected, JWSInvalid, "JWS Protected Header is invalid");
	let joseHeader;
	if (header !== void 0) {
		if (!isDisjoint(parsedProt, header)) throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
		joseHeader = {
			...parsedProt,
			...header
		};
	} else joseHeader = parsedProt;
	const extensions = validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], parsedProt, joseHeader);
	let b64 = true;
	if (extensions.includes("b64")) {
		b64 = parsedProt.b64;
		if (typeof b64 !== "boolean") throw new JWSInvalid("The \"b64\" (base64url-encode payload) Header Parameter must be a boolean");
	}
	const { alg } = joseHeader;
	if (typeof alg !== "string" || !alg) throw new JWSInvalid("JWS \"alg\" (Algorithm) Header Parameter missing or invalid");
	if (shared[0] && !shared[0].has(alg)) throw new JOSEAlgNotAllowed("\"alg\" (Algorithm) Header Parameter value not allowed");
	if (b64) {
		if (typeof inputPayload !== "string") throw new JWSInvalid("JWS Payload must be a string");
	} else if (typeof inputPayload !== "string" && !(inputPayload instanceof Uint8Array)) throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
	let resolvedKey = false;
	if (typeof key === "function") {
		key = await key(parsedProt, jws);
		resolvedKey = true;
	}
	const entry = jwsAlgorithm(alg);
	const data = concat(encodedProtected !== void 0 ? encode$1(encodedProtected) : /* @__PURE__ */ new Uint8Array(), encode$1("."), typeof inputPayload === "string" ? b64 ? shared[2] ??= encodeBase64url(inputPayload, "payload", JWSInvalid) : encoder.encode(inputPayload) : inputPayload);
	const signature = decodeBase64url(jws.signature, "signature", JWSInvalid);
	const k = await prepareKey(entry, key, "verify");
	if (!await verify(entry, k, signature, data)) throw new JWSSignatureVerificationFailed();
	let payload;
	if (b64) payload = decodeBase64url(inputPayload, "payload", JWSInvalid);
	else if (typeof inputPayload === "string") payload = encoder.encode(inputPayload);
	else payload = inputPayload;
	return [
		payload,
		parsedProt,
		b64,
		k,
		resolvedKey
	];
}
async function verifyCompact(jws, shared, key) {
	if (jws instanceof Uint8Array) jws = decoder.decode(jws);
	if (typeof jws !== "string") throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
	const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
	if (length !== 3) throw new JWSInvalid("Invalid Compact JWS");
	return verifySignature$1({
		payload,
		protected: protectedHeader,
		signature
	}, shared, key);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = (date) => Math.floor(date.getTime() / 1e3);
var multipliers = {
	s: 1,
	m: 60,
	h: 3600,
	d: 86400,
	w: 604800,
	y: 31557600
};
var REGEX$1 = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function secs(str) {
	const matched = REGEX$1.exec(str);
	if (!matched || matched[4] && matched[1]) throw new TypeError("Invalid time period format");
	const value = parseFloat(matched[2]);
	const numericDate = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
	if (matched[1] === "-" || matched[4] === "ago") return -numericDate;
	return numericDate;
}
function validateInput(label, input) {
	if (!Number.isFinite(input)) throw new TypeError(`Invalid ${label} input`);
	return input;
}
function numericDate(value, label) {
	if (typeof value === "number") return validateInput(label, value);
	if (value instanceof Date) return validateInput(label, epoch(value));
	return epoch(/* @__PURE__ */ new Date()) + secs(value);
}
var normalizeTyp = (value) => {
	if (value.includes("/")) return value.toLowerCase();
	return `application/${value.toLowerCase()}`;
};
var checkAudiencePresence = (audPayload, audOption) => {
	if (typeof audPayload === "string") return audOption.includes(audPayload);
	if (Array.isArray(audPayload)) return audOption.some((aud) => audPayload.includes(aud));
	return false;
};
function validateNumericDate(payload, claim, required = false) {
	const value = payload[claim];
	if (value === void 0 && !required) return void 0;
	if (typeof value !== "number") throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, payload, claim, "invalid");
	return value;
}
function unexpectedClaim(payload, claim) {
	throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, payload, claim, checkFailed);
}
function validateClaimsSet(protectedHeader, encodedPayload, options = {}) {
	let payload;
	try {
		payload = JSON.parse(strictDecoder.decode(encodedPayload));
	} catch {}
	if (!isObject(payload)) throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
	const { typ } = options;
	if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) throw new JWTClaimValidationFailed("unexpected \"typ\" JWT header value", payload, "typ", checkFailed);
	const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
	const presenceCheck = [...requiredClaims];
	if (maxTokenAge !== void 0) presenceCheck.push("iat");
	if (audience !== void 0) presenceCheck.push("aud");
	if (subject !== void 0) presenceCheck.push("sub");
	if (issuer !== void 0) presenceCheck.push("iss");
	for (const claim of new Set(presenceCheck.reverse())) if (!Object.hasOwn(payload, claim)) throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
	if (issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) unexpectedClaim(payload, "iss");
	if (subject !== void 0 && payload.sub !== subject) unexpectedClaim(payload, "sub");
	if (audience !== void 0 && !checkAudiencePresence(payload.aud, typeof audience === "string" ? [audience] : audience)) unexpectedClaim(payload, "aud");
	const { clockTolerance } = options;
	let tolerance = 0;
	if (typeof clockTolerance === "string") tolerance = secs(clockTolerance);
	else if (clockTolerance !== void 0) {
		if (typeof clockTolerance !== "number") throw new TypeError("Invalid clockTolerance option type");
		tolerance = clockTolerance;
	}
	validateInput("clockTolerance option", tolerance);
	const { currentDate } = options;
	const now = validateInput("currentDate option", epoch(currentDate || /* @__PURE__ */ new Date()));
	const iat = validateNumericDate(payload, "iat", maxTokenAge !== void 0);
	const nbf = validateNumericDate(payload, "nbf");
	if (nbf !== void 0) {
		if (nbf > now + tolerance) throw new JWTClaimValidationFailed("\"nbf\" claim timestamp check failed", payload, "nbf", checkFailed);
	}
	const exp = validateNumericDate(payload, "exp");
	if (exp !== void 0) {
		if (exp <= now - tolerance) throw new JWTExpired("\"exp\" claim timestamp check failed", payload, "exp", checkFailed);
	}
	if (maxTokenAge !== void 0) {
		const age = now - iat;
		const max = typeof maxTokenAge === "number" ? maxTokenAge : secs(maxTokenAge);
		if (age - tolerance > max) throw new JWTExpired("\"iat\" claim timestamp check failed (too far in the past)", payload, "iat", checkFailed);
		if (age < 0 - tolerance) throw new JWTClaimValidationFailed("\"iat\" claim timestamp check failed (it should be in the past)", payload, "iat", checkFailed);
	}
	return payload;
}
var JWTClaimsBuilder = class {
	#payload;
	constructor(payload) {
		if (!isObject(payload)) throw new TypeError("JWT Claims Set MUST be an object");
		this.#payload = structuredClone(payload);
	}
	data() {
		return encoder.encode(JSON.stringify(this.#payload));
	}
	get iss() {
		return this.#payload.iss;
	}
	set iss(value) {
		this.#payload.iss = value;
	}
	get sub() {
		return this.#payload.sub;
	}
	set sub(value) {
		this.#payload.sub = value;
	}
	get aud() {
		return this.#payload.aud;
	}
	set aud(value) {
		this.#payload.aud = value;
	}
	set jti(value) {
		this.#payload.jti = value;
	}
	set nbf(value) {
		this.#payload.nbf = numericDate(value, "setNotBefore");
	}
	set exp(value) {
		this.#payload.exp = numericDate(value, "setExpirationTime");
	}
	set iat(value) {
		if (value === void 0) this.#payload.iat = epoch(/* @__PURE__ */ new Date());
		else if (typeof value === "string") this.#payload.iat = validateInput("setIssuedAt", epoch(/* @__PURE__ */ new Date()) + secs(value));
		else this.#payload.iat = numericDate(value, "setIssuedAt");
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
	const verified = await verifyCompact(jwt, prepareVerify(options), key);
	if (!verified[2]) throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
	const result = {
		payload: validateClaimsSet(verified[1], verified[0], options),
		protectedHeader: verified[1]
	};
	if (typeof key === "function") return {
		...result,
		key: verified[3]
	};
	return result;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwt/decrypt.js
async function jwtDecrypt(jwt, key, options) {
	const decrypted = await decryptCompact(jwt, prepareDecrypt(options), key);
	const protectedHeader = decrypted[1];
	const payload = validateClaimsSet(protectedHeader, decrypted[0], options);
	if (protectedHeader.iss !== void 0 && protectedHeader.iss !== payload.iss) throw new JWTClaimValidationFailed("replicated \"iss\" claim header parameter mismatch", payload, "iss", "mismatch");
	if (protectedHeader.sub !== void 0 && protectedHeader.sub !== payload.sub) throw new JWTClaimValidationFailed("replicated \"sub\" claim header parameter mismatch", payload, "sub", "mismatch");
	if (protectedHeader.aud !== void 0 && JSON.stringify(protectedHeader.aud) !== JSON.stringify(payload.aud)) throw new JWTClaimValidationFailed("replicated \"aud\" claim header parameter mismatch", payload, "aud", "mismatch");
	const result = {
		payload,
		protectedHeader
	};
	if (typeof key === "function") return {
		...result,
		key: decrypted[2]
	};
	return result;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwe/compact/encrypt.js
var CompactEncrypt = class {
	#flattened;
	constructor(plaintext) {
		this.#flattened = new FlattenedEncrypt(plaintext);
	}
	setContentEncryptionKey(cek) {
		this.#flattened.setContentEncryptionKey(cek);
		return this;
	}
	setInitializationVector(iv) {
		this.#flattened.setInitializationVector(iv);
		return this;
	}
	setProtectedHeader(protectedHeader) {
		this.#flattened.setProtectedHeader(protectedHeader);
		return this;
	}
	setKeyManagementParameters(parameters) {
		this.#flattened.setKeyManagementParameters(parameters);
		return this;
	}
	async encrypt(key, options) {
		const jwe = await this.#flattened.encrypt(key, options);
		return [
			jwe.protected,
			jwe.encrypted_key,
			jwe.iv,
			jwe.ciphertext,
			jwe.tag
		].join(".");
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/jws_sign.js
function unencodedPayload(protectedHeader) {
	return protectedHeader?.b64 === false && Array.isArray(protectedHeader.crit) && protectedHeader.crit.includes("b64");
}
async function createSignature(input, key) {
	const { protectedHeader, unprotectedHeader } = input;
	if (!protectedHeader && !unprotectedHeader) throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
	if (!isDisjoint(protectedHeader, unprotectedHeader)) throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
	const joseHeader = {
		...protectedHeader,
		...unprotectedHeader
	};
	validateCritDuplicates(JWSInvalid, protectedHeader);
	const extensions = validateCrit(JWSInvalid, JWS_RECOGNIZED, input.crit, protectedHeader, joseHeader);
	let b64 = true;
	if (extensions.includes("b64")) {
		b64 = protectedHeader.b64;
		if (typeof b64 !== "boolean") throw new JWSInvalid("The \"b64\" (base64url-encode payload) Header Parameter must be a boolean");
	}
	const { alg } = joseHeader;
	if (typeof alg !== "string" || !alg) throw new JWSInvalid("JWS \"alg\" (Algorithm) Header Parameter missing or invalid");
	const entry = jwsAlgorithm(alg);
	let payloadS;
	let payloadB;
	if (b64) {
		const encoded = input.encoded ??= [];
		encoded[0] ??= encode(input.payload);
		encoded[1] ??= encode$1(encoded[0]);
		payloadS = encoded[0];
		payloadB = encoded[1];
	} else {
		payloadB = input.payload;
		payloadS = "";
	}
	let protectedHeaderString;
	let protectedHeaderBytes;
	if (protectedHeader) {
		protectedHeaderString = encode(JSON.stringify(protectedHeader));
		protectedHeaderBytes = encode$1(protectedHeaderString);
	} else {
		protectedHeaderString = "";
		protectedHeaderBytes = /* @__PURE__ */ new Uint8Array();
	}
	const data = concat(protectedHeaderBytes, encode$1("."), payloadB);
	const jws = {
		signature: encode(await sign(entry, await prepareKey(entry, key, "sign"), data)),
		payload: payloadS
	};
	if (protectedHeader) jws.protected = protectedHeaderString;
	if (unprotectedHeader) jws.header = unprotectedHeader;
	return jws;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jws/flattened/sign.js
var FlattenedSign = class {
	#payload;
	#protectedHeader;
	#unprotectedHeader;
	constructor(payload) {
		if (!(payload instanceof Uint8Array)) throw new TypeError("payload must be an instance of Uint8Array");
		this.#payload = payload;
	}
	setProtectedHeader(protectedHeader) {
		assertNotSet(this.#protectedHeader, "setProtectedHeader");
		this.#protectedHeader = protectedHeader;
		return this;
	}
	setUnprotectedHeader(unprotectedHeader) {
		assertNotSet(this.#unprotectedHeader, "setUnprotectedHeader");
		this.#unprotectedHeader = unprotectedHeader;
		return this;
	}
	async sign(key, options) {
		return createSignature({
			payload: this.#payload,
			protectedHeader: this.#protectedHeader,
			unprotectedHeader: this.#unprotectedHeader,
			crit: options?.crit
		}, key);
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jws/compact/sign.js
var CompactSign = class {
	#flattened;
	#protectedHeader;
	constructor(payload) {
		this.#flattened = new FlattenedSign(payload);
	}
	setProtectedHeader(protectedHeader) {
		this.#flattened.setProtectedHeader(protectedHeader);
		this.#protectedHeader = protectedHeader;
		return this;
	}
	async sign(key, options) {
		if (unencodedPayload(this.#protectedHeader)) throw new TypeError("use the flattened module for creating JWS with b64: false");
		const jws = await this.#flattened.sign(key, options);
		return `${jws.protected}.${jws.payload}.${jws.signature}`;
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwt/sign.js
var SignJWT = class {
	#protectedHeader;
	#jwt;
	constructor(payload = {}) {
		this.#jwt = new JWTClaimsBuilder(payload);
	}
	setIssuer(issuer) {
		this.#jwt.iss = issuer;
		return this;
	}
	setSubject(subject) {
		this.#jwt.sub = subject;
		return this;
	}
	setAudience(audience) {
		this.#jwt.aud = audience;
		return this;
	}
	setJti(jwtId) {
		this.#jwt.jti = jwtId;
		return this;
	}
	setNotBefore(input) {
		this.#jwt.nbf = input;
		return this;
	}
	setExpirationTime(input) {
		this.#jwt.exp = input;
		return this;
	}
	setIssuedAt(input) {
		this.#jwt.iat = input;
		return this;
	}
	setProtectedHeader(protectedHeader) {
		this.#protectedHeader = protectedHeader;
		return this;
	}
	async sign(key, options) {
		const sig = new CompactSign(this.#jwt.data());
		sig.setProtectedHeader(this.#protectedHeader);
		if (unencodedPayload(this.#protectedHeader)) throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
		return sig.sign(key, options);
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwt/encrypt.js
var EncryptJWT = class {
	#cek;
	#iv;
	#keyManagementParameters;
	#protectedHeader;
	#replicateIssuerAsHeader;
	#replicateSubjectAsHeader;
	#replicateAudienceAsHeader;
	#jwt;
	constructor(payload = {}) {
		this.#jwt = new JWTClaimsBuilder(payload);
	}
	setIssuer(issuer) {
		this.#jwt.iss = issuer;
		return this;
	}
	setSubject(subject) {
		this.#jwt.sub = subject;
		return this;
	}
	setAudience(audience) {
		this.#jwt.aud = audience;
		return this;
	}
	setJti(jwtId) {
		this.#jwt.jti = jwtId;
		return this;
	}
	setNotBefore(input) {
		this.#jwt.nbf = input;
		return this;
	}
	setExpirationTime(input) {
		this.#jwt.exp = input;
		return this;
	}
	setIssuedAt(input) {
		this.#jwt.iat = input;
		return this;
	}
	setProtectedHeader(protectedHeader) {
		assertNotSet(this.#protectedHeader, "setProtectedHeader");
		this.#protectedHeader = protectedHeader;
		return this;
	}
	setKeyManagementParameters(parameters) {
		assertNotSet(this.#keyManagementParameters, "setKeyManagementParameters");
		this.#keyManagementParameters = parameters;
		return this;
	}
	setContentEncryptionKey(cek) {
		assertNotSet(this.#cek, "setContentEncryptionKey");
		this.#cek = cek;
		return this;
	}
	setInitializationVector(iv) {
		assertNotSet(this.#iv, "setInitializationVector");
		this.#iv = iv;
		return this;
	}
	replicateIssuerAsHeader() {
		this.#replicateIssuerAsHeader = true;
		return this;
	}
	replicateSubjectAsHeader() {
		this.#replicateSubjectAsHeader = true;
		return this;
	}
	replicateAudienceAsHeader() {
		this.#replicateAudienceAsHeader = true;
		return this;
	}
	async encrypt(key, options) {
		const enc = new CompactEncrypt(this.#jwt.data());
		if (this.#protectedHeader && (this.#replicateIssuerAsHeader || this.#replicateSubjectAsHeader || this.#replicateAudienceAsHeader)) this.#protectedHeader = {
			...this.#protectedHeader,
			iss: this.#replicateIssuerAsHeader ? this.#jwt.iss : void 0,
			sub: this.#replicateSubjectAsHeader ? this.#jwt.sub : void 0,
			aud: this.#replicateAudienceAsHeader ? this.#jwt.aud : void 0
		};
		enc.setProtectedHeader(this.#protectedHeader);
		if (this.#iv) enc.setInitializationVector(this.#iv);
		if (this.#cek) enc.setContentEncryptionKey(this.#cek);
		if (this.#keyManagementParameters) enc.setKeyManagementParameters(this.#keyManagementParameters);
		return enc.encrypt(key, options);
	}
};
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/lib/key_algorithm.js
function unsupportedAlg(source = "JWK \"alg\" (Algorithm) Parameter") {
	throw new JOSENotSupported(`Invalid or unsupported ${source} value`);
}
function keyAlgorithm(alg, source) {
	return (typeof alg === "string" ? JWS[alg] ?? JWE[alg] : void 0) ?? unsupportedAlg(source);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/key/export.js
function omitUndefinedProperties(jwk) {
	return Object.fromEntries(Object.entries(jwk).filter(([, value]) => value !== void 0));
}
async function keyToJWK(key) {
	if (isKeyObject(key)) if (key.type === "secret") key = key.export();
	else return key.export({ format: "jwk" });
	if (key instanceof Uint8Array) return {
		kty: "oct",
		k: encode(key)
	};
	if (!isCryptoKey(key)) throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "Uint8Array"));
	if (!key.extractable) throw new TypeError("non-extractable CryptoKey cannot be exported as a JWK");
	const { ext, key_ops, alg, use, ...jwk } = omitUndefinedProperties(await crypto.subtle.exportKey("jwk", key));
	if (jwk.kty === "AKP") jwk.alg = alg;
	return jwk;
}
function exportJWK(key) {
	return keyToJWK(key);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwk/thumbprint.js
var check = (value, description) => {
	if (typeof value !== "string" || !value) throw new JWKInvalid(`${description} missing or invalid`);
};
async function calculateJwkThumbprint(key, digestAlgorithm) {
	let jwk;
	if (isJWK(key)) jwk = key;
	else if (isKeyLike(key)) jwk = await exportJWK(key);
	else throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
	digestAlgorithm ??= "sha256";
	if (digestAlgorithm !== "sha256" && digestAlgorithm !== "sha384" && digestAlgorithm !== "sha512") throw new TypeError("digestAlgorithm must one of \"sha256\", \"sha384\", or \"sha512\"");
	let components;
	switch (jwk.kty) {
		case "AKP":
			check(jwk.alg, "\"alg\" (Algorithm) Parameter");
			check(jwk.pub, "\"pub\" (Public key) Parameter");
			components = {
				alg: jwk.alg,
				kty: jwk.kty,
				pub: jwk.pub
			};
			break;
		case "EC":
			check(jwk.crv, "\"crv\" (Curve) Parameter");
			check(jwk.x, "\"x\" (X Coordinate) Parameter");
			check(jwk.y, "\"y\" (Y Coordinate) Parameter");
			components = {
				crv: jwk.crv,
				kty: jwk.kty,
				x: jwk.x,
				y: jwk.y
			};
			break;
		case "OKP":
			check(jwk.crv, "\"crv\" (Subtype of Key Pair) Parameter");
			check(jwk.x, "\"x\" (Public Key) Parameter");
			components = {
				crv: jwk.crv,
				kty: jwk.kty,
				x: jwk.x
			};
			break;
		case "RSA":
			check(jwk.e, "\"e\" (Exponent) Parameter");
			check(jwk.n, "\"n\" (Modulus) Parameter");
			components = {
				e: jwk.e,
				kty: jwk.kty,
				n: jwk.n
			};
			break;
		case "oct":
			check(jwk.k, "\"k\" (Key Value) Parameter");
			components = {
				k: jwk.k,
				kty: jwk.kty
			};
			break;
		default: throw new JOSENotSupported("\"kty\" (Key Type) Parameter missing or unsupported");
	}
	const data = encode$1(JSON.stringify(components));
	return encode(await digest(digestAlgorithm, data));
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwks/local.js
function signatureAlgorithm(alg) {
	const entry = typeof alg === "string" ? JWS[alg] : void 0;
	if (!entry || entry.secret) throw new JOSENotSupported("Unsupported \"alg\" value for a JSON Web Key Set");
	return entry;
}
function isJWKSLike(jwks) {
	if (!jwks || typeof jwks !== "object") return false;
	const { keys } = jwks;
	return Array.isArray(keys) && keys.every(isObject);
}
var LocalJWKSetImpl = class {
	#jwks;
	#cached = /* @__PURE__ */ new WeakMap();
	constructor(jwks) {
		if (!isJWKSLike(jwks)) throw new JWKSInvalid("JSON Web Key Set malformed");
		this.#jwks = structuredClone(jwks);
	}
	jwks() {
		return this.#jwks;
	}
	async getKey(protectedHeader, token) {
		const { alg, kid } = {
			...protectedHeader,
			...token?.header
		};
		const entry = signatureAlgorithm(alg);
		const candidates = this.#jwks.keys.filter((jwk) => entry.kty.includes(jwk.kty) && (typeof kid !== "string" || kid === jwk.kid) && (!(typeof jwk.alg === "string" || jwk.kty === "AKP") || alg === jwk.alg) && (typeof jwk.use !== "string" || jwk.use === "sig") && (!Array.isArray(jwk.key_ops) || jwk.key_ops.includes("verify")) && (!entry.crv || jwk.crv === entry.crv));
		const { 0: jwk, length } = candidates;
		if (length === 0) throw new JWKSNoMatchingKey();
		if (length !== 1) {
			const error = new JWKSMultipleMatchingKeys();
			const _cached = this.#cached;
			error[Symbol.asyncIterator] = async function* () {
				for (const jwk of candidates) try {
					yield await importWithAlgCache(_cached, jwk, entry);
				} catch {}
			};
			throw error;
		}
		return importWithAlgCache(this.#cached, jwk, entry);
	}
};
async function importWithAlgCache(cache, jwk, entry) {
	const cached = cache.get(jwk) || cache.set(jwk, { __proto__: null }).get(jwk);
	if (cached[entry.alg] === void 0) {
		const key = await jwkToKey(entry, {
			...jwk,
			alg: entry.alg,
			ext: true
		});
		if (key.type !== "public") throw new JWKSInvalid("JSON Web Key Set members must be public keys");
		cached[entry.alg] = key;
	}
	return cached[entry.alg];
}
function createLocalJWKSet(jwks) {
	const set = new LocalJWKSetImpl(jwks);
	const localJWKSet = async (protectedHeader, token) => set.getKey(protectedHeader, token);
	Object.defineProperty(localJWKSet, "jwks", { value: () => structuredClone(set.jwks()) });
	return localJWKSet;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
	return typeof WebSocketPair !== "undefined" || typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers" || typeof EdgeRuntime !== "undefined" && EdgeRuntime === "vercel";
}
var USER_AGENT;
if (typeof navigator === "undefined" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) USER_AGENT = `jose/v6.2.9`;
var customFetch = Symbol();
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
	const response = await fetchImpl(url, {
		method: "GET",
		signal,
		redirect: "manual",
		headers
	}).catch((err) => {
		if (err.name === "TimeoutError") throw new JWKSTimeout();
		throw err;
	});
	if (response.status !== 200) throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
	try {
		return await response.json();
	} catch {
		throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON");
	}
}
var jwksCache = Symbol();
function isFreshJwksCache(input, cacheMaxAge) {
	if (typeof input !== "object" || input === null) return false;
	if (!("uat" in input) || typeof input.uat !== "number" || Date.now() - input.uat >= cacheMaxAge) return false;
	if (!("jwks" in input) || !isObject(input.jwks) || !Array.isArray(input.jwks.keys) || !Array.prototype.every.call(input.jwks.keys, isObject)) return false;
	return true;
}
var RemoteJWKSetImpl = class {
	#url;
	#timeoutDuration;
	#cooldownDuration;
	#cacheMaxAge;
	#jwksTimestamp;
	#pendingFetch;
	#headers;
	#customFetch;
	#local;
	#cache;
	constructor(url, options) {
		if (!(url instanceof URL)) throw new TypeError("url must be an instance of URL");
		this.#url = new URL(url.href);
		const opts = options ?? {};
		this.#timeoutDuration = typeof opts.timeoutDuration === "number" ? opts.timeoutDuration : 5e3;
		this.#cooldownDuration = typeof opts.cooldownDuration === "number" ? opts.cooldownDuration : 3e4;
		this.#cacheMaxAge = typeof opts.cacheMaxAge === "number" ? opts.cacheMaxAge : 6e5;
		this.#headers = new Headers(opts.headers);
		if (USER_AGENT && !this.#headers.has("User-Agent")) this.#headers.set("User-Agent", USER_AGENT);
		if (!this.#headers.has("accept")) {
			this.#headers.set("accept", "application/json");
			this.#headers.append("accept", "application/jwk-set+json");
		}
		this.#customFetch = opts[customFetch];
		const cache = opts[jwksCache];
		if (cache !== void 0) {
			this.#cache = cache;
			if (isFreshJwksCache(cache, this.#cacheMaxAge)) {
				this.#jwksTimestamp = this.#cache.uat;
				this.#local = createLocalJWKSet(this.#cache.jwks);
			}
		}
	}
	pendingFetch() {
		return !!this.#pendingFetch;
	}
	#validFor(duration) {
		return typeof this.#jwksTimestamp === "number" && Date.now() < this.#jwksTimestamp + duration;
	}
	coolingDown() {
		return this.#validFor(this.#cooldownDuration);
	}
	fresh() {
		return this.#validFor(this.#cacheMaxAge);
	}
	jwks() {
		return this.#local?.jwks();
	}
	async getKey(protectedHeader, token) {
		if (!this.#local || !this.fresh()) await this.reload();
		try {
			return await this.#local(protectedHeader, token);
		} catch (err) {
			if (err instanceof JWKSNoMatchingKey) {
				if (this.coolingDown() === false) {
					await this.reload();
					return this.#local(protectedHeader, token);
				}
			}
			throw err;
		}
	}
	async reload() {
		if (this.#pendingFetch && isCloudflareWorkers()) this.#pendingFetch = void 0;
		this.#pendingFetch ||= fetchJwks(this.#url.href, this.#headers, AbortSignal.timeout(this.#timeoutDuration), this.#customFetch).then((json) => {
			this.#local = createLocalJWKSet(json);
			if (this.#cache) {
				this.#cache.uat = Date.now();
				this.#cache.jwks = json;
			}
			this.#jwksTimestamp = Date.now();
		}).finally(() => {
			this.#pendingFetch = void 0;
		});
		await this.#pendingFetch;
	}
};
function createRemoteJWKSet(url, options) {
	const set = new RemoteJWKSetImpl(url, options);
	const remoteJWKSet = async (protectedHeader, token) => set.getKey(protectedHeader, token);
	Object.defineProperties(remoteJWKSet, {
		coolingDown: {
			get: () => set.coolingDown(),
			enumerable: true
		},
		fresh: {
			get: () => set.fresh(),
			enumerable: true
		},
		reload: {
			value: () => set.reload(),
			enumerable: true
		},
		reloading: {
			get: () => set.pendingFetch(),
			enumerable: true
		},
		jwks: {
			value: () => set.jwks(),
			enumerable: true
		}
	});
	return remoteJWKSet;
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/key/import.js
async function importJWK(jwk, alg, options) {
	if (!isObject(jwk)) throw new TypeError("JWK must be an object");
	alg ??= jwk.alg;
	const ext = options?.extractable ?? jwk.ext;
	if (jwk.kty !== "oct" && !alg) throw new TypeError("\"alg\" argument is required when \"jwk.alg\" is not present");
	switch (jwk.kty) {
		case "oct":
			if (typeof jwk.k !== "string" || !jwk.k) throw new TypeError("missing \"k\" (Key Value) Parameter value");
			return decode(jwk.k);
		case "RSA": return jwkToKey(keyAlgorithm(alg), {
			...jwk,
			alg,
			ext
		});
		case "AKP":
			if (typeof jwk.alg !== "string" || !jwk.alg) throw new TypeError("missing \"alg\" (Algorithm) Parameter value");
			if (alg !== void 0 && alg !== jwk.alg) throw new TypeError("JWK alg and alg option value mismatch");
			return jwkToKey(keyAlgorithm(jwk.alg), {
				...jwk,
				ext
			});
		case "EC":
		case "OKP": return jwkToKey(keyAlgorithm(alg), {
			...jwk,
			alg,
			ext
		});
		default: throw new JOSENotSupported("Unsupported \"kty\" (Key Type) Parameter value");
	}
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/util/decode_protected_header.js
function decodeProtectedHeader(token) {
	let protectedB64u;
	if (typeof token === "string") {
		const parts = token.split(".");
		if (parts.length === 3 || parts.length === 5) [protectedB64u] = parts;
	} else if (typeof token === "object" && token) if ("protected" in token) protectedB64u = token.protected;
	else throw new TypeError("Token does not contain a Protected Header");
	const invalid = "Invalid Token or Protected Header formatting";
	if (typeof protectedB64u !== "string" || !protectedB64u) throw new TypeError(invalid);
	return parseJoseHeader(protectedB64u, TypeError, invalid);
}
//#endregion
//#region ../../node_modules/.bun/jose@6.2.9/node_modules/jose/dist/webapi/util/decode_jwt.js
function decodeJwt(jwt) {
	if (typeof jwt !== "string") throw new JWTInvalid("JWTs must use Compact JWS serialization, JWT must be a string");
	const { 1: payload, length } = jwt.split(".");
	if (length === 5) throw new JWTInvalid("Only JWTs using Compact JWS serialization can be decoded");
	if (length !== 3) throw new JWTInvalid("Invalid JWT");
	if (!payload) throw new JWTInvalid("JWTs must contain a payload");
	let decoded;
	try {
		decoded = decode(payload);
	} catch {
		throw new JWTInvalid("Failed to base64url decode the payload");
	}
	let result;
	try {
		result = JSON.parse(strictDecoder.decode(decoded));
	} catch {
		throw new JWTInvalid("Failed to parse the decoded payload as JSON");
	}
	if (!isObject(result)) throw new JWTInvalid("Invalid JWT Claims Set");
	return result;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/crypto/jwt.mjs
async function signJWT(payload, secret, expiresIn = 3600) {
	return await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1e3) + expiresIn).sign(new TextEncoder().encode(secret));
}
async function verifyJWT(token, secret) {
	try {
		return (await jwtVerify(token, new TextEncoder().encode(secret))).payload;
	} catch {
		return null;
	}
}
var info = new Uint8Array([
	66,
	101,
	116,
	116,
	101,
	114,
	65,
	117,
	116,
	104,
	46,
	106,
	115,
	32,
	71,
	101,
	110,
	101,
	114,
	97,
	116,
	101,
	100,
	32,
	69,
	110,
	99,
	114,
	121,
	112,
	116,
	105,
	111,
	110,
	32,
	75,
	101,
	121
]);
var now = () => Date.now() / 1e3 | 0;
var alg = "dir";
var enc = "A256CBC-HS512";
function deriveEncryptionSecret(secret, salt) {
	return hkdf(sha256, new TextEncoder().encode(secret), new TextEncoder().encode(salt), info, 64);
}
function getCurrentSecret(secret) {
	if (typeof secret === "string") return secret;
	const value = secret.keys.get(secret.currentVersion);
	if (!value) throw new Error(`Secret version ${secret.currentVersion} not found in keys`);
	return value;
}
function getAllSecrets(secret) {
	if (typeof secret === "string") return [{
		version: 0,
		value: secret
	}];
	const result = [];
	for (const [version, value] of secret.keys) result.push({
		version,
		value
	});
	if (secret.legacySecret && !result.some((s) => s.value === secret.legacySecret)) result.push({
		version: -1,
		value: secret.legacySecret
	});
	return result;
}
async function symmetricEncodeJWT(payload, secret, salt, expiresIn = 3600) {
	const encryptionSecret = deriveEncryptionSecret(getCurrentSecret(secret), salt);
	const thumbprint = await calculateJwkThumbprint({
		kty: "oct",
		k: encode(encryptionSecret)
	}, "sha256");
	return await new EncryptJWT(payload).setProtectedHeader({
		alg,
		enc,
		kid: thumbprint
	}).setIssuedAt().setExpirationTime(now() + expiresIn).setJti(crypto.randomUUID()).encrypt(encryptionSecret);
}
var jwtDecryptOpts = {
	clockTolerance: 15,
	keyManagementAlgorithms: [alg],
	contentEncryptionAlgorithms: [enc, "A256GCM"]
};
async function symmetricDecodeJWT(token, secret, salt) {
	if (!token) return null;
	let hasKid = false;
	try {
		hasKid = decodeProtectedHeader(token).kid !== void 0;
	} catch {
		return null;
	}
	try {
		const secrets = getAllSecrets(secret);
		const { payload } = await jwtDecrypt(token, async (protectedHeader) => {
			const kid = protectedHeader.kid;
			if (kid !== void 0) {
				for (const s of secrets) {
					const encryptionSecret = deriveEncryptionSecret(s.value, salt);
					if (kid === await calculateJwkThumbprint({
						kty: "oct",
						k: encode(encryptionSecret)
					}, "sha256")) return encryptionSecret;
				}
				throw new Error("no matching decryption secret");
			}
			if (secrets.length === 1) return deriveEncryptionSecret(secrets[0].value, salt);
			return deriveEncryptionSecret(secrets[0].value, salt);
		}, jwtDecryptOpts);
		return payload;
	} catch {
		if (hasKid) return null;
		const secrets = getAllSecrets(secret);
		if (secrets.length <= 1) return null;
		for (let i = 1; i < secrets.length; i++) try {
			const s = secrets[i];
			const { payload } = await jwtDecrypt(token, deriveEncryptionSecret(s.value, salt), jwtDecryptOpts);
			return payload;
		} catch {
			continue;
		}
		return null;
	}
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/password.node.mjs
var config = {
	N: 16384,
	r: 16,
	p: 1,
	dkLen: 64
};
function generateKey(password, salt) {
	return new Promise((resolve, reject) => {
		scrypt(password.normalize("NFKC"), salt, config.dkLen, {
			N: config.N,
			r: config.r,
			p: config.p,
			maxmem: 128 * config.N * config.r * 2
		}, (err, key) => {
			if (err) reject(err);
			else resolve(key);
		});
	});
}
async function hashPassword(password) {
	const salt = randomBytes(16).toString("hex");
	return `${salt}:${(await generateKey(password, salt)).toString("hex")}`;
}
async function verifyPassword$2(hash, password) {
	const [salt, key] = hash.split(":");
	if (!salt || !key) throw new Error("Invalid password hash");
	return (await generateKey(password, salt)).toString("hex") === key;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/crypto/password.mjs
/**
* `@better-auth/utils/password` uses the "node" export condition in package.json
* to automatically pick the right implementation:
*   - Node.js / Bun / Deno → `node:crypto scrypt` (libuv thread pool, non-blocking)
*   - Unsupported runtimes → `@noble/hashes scrypt` (pure JS fallback)
*/
var hashPassword$1 = hashPassword;
var verifyPassword$1 = async ({ hash, password }) => {
	return verifyPassword$2(hash, password);
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/index.mjs
function getWebcryptoSubtle() {
	const cr = typeof globalThis !== "undefined" && globalThis.crypto;
	if (cr && typeof cr.subtle === "object" && cr.subtle != null) return cr.subtle;
	throw new Error("crypto.subtle must be defined");
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/base64.mjs
function getAlphabet(urlSafe) {
	return urlSafe ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
}
function base64Encode(data, alphabet, padding) {
	let result = "";
	let buffer = 0;
	let shift = 0;
	for (const byte of data) {
		buffer = buffer << 8 | byte;
		shift += 8;
		while (shift >= 6) {
			shift -= 6;
			result += alphabet[buffer >> shift & 63];
		}
	}
	if (shift > 0) result += alphabet[buffer << 6 - shift & 63];
	if (padding) {
		const padCount = (4 - result.length % 4) % 4;
		result += "=".repeat(padCount);
	}
	return result;
}
function base64Decode(data, alphabet) {
	const decodeMap = /* @__PURE__ */ new Map();
	for (let i = 0; i < alphabet.length; i++) decodeMap.set(alphabet[i], i);
	const result = [];
	let buffer = 0;
	let bitsCollected = 0;
	for (const char of data) {
		if (char === "=") break;
		const value = decodeMap.get(char);
		if (value === void 0) throw new Error(`Invalid Base64 character: ${char}`);
		buffer = buffer << 6 | value;
		bitsCollected += 6;
		if (bitsCollected >= 8) {
			bitsCollected -= 8;
			result.push(buffer >> bitsCollected & 255);
		}
	}
	return Uint8Array.from(result);
}
var base64 = {
	encode(data, options = {}) {
		const alphabet = getAlphabet(false);
		return base64Encode(typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data), alphabet, options.padding ?? true);
	},
	decode(data) {
		if (typeof data !== "string") data = new TextDecoder().decode(data);
		const alphabet = getAlphabet(data.includes("-") || data.includes("_"));
		return base64Decode(data, alphabet);
	}
};
var base64Url = {
	encode(data, options = {}) {
		const alphabet = getAlphabet(true);
		return base64Encode(typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data), alphabet, options.padding ?? true);
	},
	decode(data) {
		return base64Decode(data, getAlphabet(data.includes("-") || data.includes("_")));
	}
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/hash.mjs
function createHash$1(algorithm, encoding) {
	return { digest: async (input) => {
		const encoder = new TextEncoder();
		const data = typeof input === "string" ? encoder.encode(input) : input;
		const hashBuffer = await getWebcryptoSubtle().digest(algorithm, data);
		if (encoding === "hex") return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
		if (encoding === "base64" || encoding === "base64url" || encoding === "base64urlnopad") {
			if (encoding.includes("url")) return base64Url.encode(hashBuffer, { padding: encoding !== "base64urlnopad" });
			return base64.encode(hashBuffer);
		}
		return hashBuffer;
	} };
}
//#endregion
//#region ../../node_modules/.bun/@noble+ciphers@2.3.0/node_modules/@noble/ciphers/utils.js
/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
/**
* Checks if something is Uint8Array. Be careful: nodejs Buffer will return true.
* @param a - Value to inspect.
* @returns `true` when the value is a Uint8Array view, including Node's `Buffer`.
* @example
* Guards a value before treating it as raw key material.
*
* ```ts
* isBytes(new Uint8Array());
* ```
*/
function isBytes(a) {
	return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
/**
* Asserts something is boolean.
* @param value - Value to validate.
* @returns The validated boolean.
* @throws On wrong argument types. {@link TypeError}
* @example
* Validates a boolean option before branching on it.
*
* ```ts
* abool(true);
* ```
*/
function abool(value, title = "") {
	if (typeof value !== "boolean") throw new TypeError(atitle(title) + "expected boolean, got type=" + typeof value);
	return value;
}
/**
* Asserts something is a non-negative safe integer.
* @param n - Value to validate.
* @returns The validated number.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validates a non-negative length or counter.
*
* ```ts
* anumber(1);
* ```
*/
function anumber(n, title = "") {
	if (typeof n !== "number") throw new TypeError(atitle(title) + "expected number, got " + typeof n);
	if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
	return n;
}
/**
* Asserts something is Uint8Array.
* @param value - Value to validate.
* @param length - Expected byte length.
* @param title - Optional label used in error messages.
* @returns The validated byte array.
* On Node, `Buffer` is accepted too because it is a Uint8Array view.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument lengths. {@link RangeError}
* @example
* Validates a fixed-length nonce or key buffer.
*
* ```ts
* abytes(new Uint8Array([1, 2]), 2);
* ```
*/
function abytes(value, length, title = "") {
	if (isBytes(value) && (length === void 0 || value.length === length)) return value;
	if (length !== void 0) anumber(length, "length");
	const bytes = isBytes(value);
	const ofLen = length !== void 0 ? ` of length ${length}` : "";
	const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
	const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
	if (!bytes) throw new TypeError(message);
	throw new RangeError(message);
}
var aobject = (value, label) => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(label === "object" ? "expected valid options object" : `"${label}" expected object, got type=${typeof value}`);
};
/**
* Asserts a hash- or MAC-like instance has not been destroyed or finished.
* @param instance - Stateful instance to validate.
* @param checkFinished - Whether to reject finished instances.
* When `false`, only `destroyed` is checked.
* @throws If the hash instance has already been destroyed or finalized. {@link Error}
* @example
* Guards against calling `update()` or `digest()` on a finished hash.
*
* ```ts
* aexists({ destroyed: false, finished: false });
* ```
*/
function aexists(instance, checkFinished = true) {
	if (instance.destroyed) throw new Error("hash was destroyed");
	if (checkFinished && instance.finished) throw new Error("digest() was already called");
}
/**
* Asserts output is a sufficiently-sized byte array.
* @param out - Output buffer to validate.
* @param instance - Hash-like instance providing `outputLen`.
* This is the relaxed `digestInto()`-style contract: output must be at least `outputLen`,
* unlike one-shot cipher helpers elsewhere in the repo that often require exact lengths.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong output buffer lengths. {@link RangeError}
* @example
* Verifies that a caller-provided output buffer is large enough.
*
* ```ts
* aoutput(new Uint8Array(16), { outputLen: 16 });
* ```
*/
function aoutput(out, instance) {
	abytes(out, void 0, "output");
	const min = instance.outputLen;
	if (!(out.length >= min)) throw new RangeError("\"output\" expected length >= " + min);
}
/**
* Casts a typed-array view to Uint32Array.
* @param arr - Typed-array view to reinterpret.
* @returns Uint32Array view over the same bytes. Callers are expected to provide a
* 4-byte-aligned offset; trailing `1..3` bytes are silently dropped.
* @example
* Views a byte buffer as 32-bit words for block processing.
*
* ```ts
* u32(new Uint8Array(4));
* ```
*/
function u32(arr) {
	return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/**
* Zeroizes typed arrays in place.
* Warning: JS provides no guarantees.
* @param arrays - Arrays to wipe.
* @example
* Wipes a temporary key buffer after use.
*
* ```ts
* const bytes = new Uint8Array([1]);
* clean(bytes);
* ```
*/
function clean(...arrays) {
	for (let i = 0; i < arrays.length; i++) arrays[i].fill(0);
}
/**
* Creates a DataView for byte-level manipulation.
* @param arr - Typed-array view to wrap.
* @returns DataView over the same bytes.
* @example
* Creates an endian-aware view for length encoding.
*
* ```ts
* createView(new Uint8Array(4));
* ```
*/
function createView(arr) {
	return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/**
* Whether the current platform is little-endian.
* Most are; some IBM systems are not.
*/
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
/**
* Reverses byte order of one 32-bit word.
* @param word - Unsigned 32-bit word to swap.
* @returns The same word with bytes reversed.
* @example
* Swaps a big-endian word into little-endian byte order.
*
* ```ts
* byteSwap(0x11223344);
* ```
*/
function byteSwap(word) {
	return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
/**
* Byte-swaps every word of a Uint32Array in place.
* @param arr - Uint32Array whose words should be swapped.
* @returns The same array after in-place byte swapping.
* @example
* Swaps every 32-bit word in a word-view buffer.
*
* ```ts
* byteSwap32(new Uint32Array([0x11223344]));
* ```
*/
function byteSwap32(arr) {
	for (let i = 0; i < arr.length; i++) arr[i] = byteSwap(arr[i]);
	return arr;
}
/**
* Normalizes a Uint32Array view to the little-endian representation expected by cipher cores.
* @param u - Word view to normalize in place.
* @returns Little-endian normalized word view.
* @example
* Normalizes a word-view buffer before block processing.
*
* ```ts
* swap32IfBE(new Uint32Array([0x11223344]));
* ```
*/
var swap32IfBE = isLE ? (u) => u : byteSwap32;
var hasHexBuiltin = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function")();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
/**
* Convert byte array to hex string. Uses built-in function, when available.
* @param bytes - Bytes to encode.
* @returns Lowercase hexadecimal string.
* @throws On wrong argument types. {@link TypeError}
* @example
* Formats ciphertext bytes for logs or test vectors.
*
* ```ts
* bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])); // 'cafe0123'
* ```
*/
function bytesToHex(bytes) {
	abytes(bytes);
	if (hasHexBuiltin) return bytes.toHex();
	let hex = "";
	for (let i = 0; i < bytes.length; i++) hex += hexes[bytes[i]];
	return hex;
}
function asciiToBase16(ch) {
	return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - 55 : ch >= 97 && ch <= 102 ? ch - 87 : void 0;
}
/**
* Convert hex string to byte array. Uses built-in function, when available.
* @param hex - hexadecimal string to decode
* @returns Decoded bytes.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Decode lowercase hexadecimal into bytes.
* ```ts
* hexToBytes('cafe0123'); // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
* ```
*/
function hexToBytes(hex) {
	if (typeof hex !== "string") throw new TypeError("hex string expected, got " + typeof hex);
	if (hasHexBuiltin) try {
		return Uint8Array.fromHex(hex);
	} catch (error) {
		if (error instanceof SyntaxError) throw new RangeError(error.message);
		throw error;
	}
	const hl = hex.length;
	const al = hl / 2;
	if (hl % 2) throw new RangeError("hex string expected, got unpadded hex of length " + hl);
	const array = new Uint8Array(al);
	for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
		const n1 = asciiToBase16(hex.charCodeAt(hi));
		const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
		if (n1 === void 0 || n2 === void 0) {
			const char = hex[hi] + hex[hi + 1];
			throw new RangeError("hex string expected, got non-hex character \"" + char + "\" at index " + hi);
		}
		array[ai] = n1 * 16 + n2;
	}
	return array;
}
/**
* Converts string to bytes using UTF8 encoding.
* @param str - String to encode.
* @returns UTF-8 bytes in a detached fresh Uint8Array copy.
* @throws On wrong argument types. {@link TypeError}
* @example
* Encodes application text before encryption or MACing.
*
* ```ts
* utf8ToBytes('abc'); // new Uint8Array([97, 98, 99])
* ```
*/
function utf8ToBytes(str) {
	if (typeof str !== "string") throw new TypeError("string expected");
	return new Uint8Array(new TextEncoder().encode(str));
}
/**
* Checks if two U8A use same underlying buffer and overlaps.
* This is invalid and can corrupt data.
* @param a - First byte view.
* @param b - Second byte view.
* @returns `true` when the views overlap in memory.
* @example
* Detects whether two slices alias the same backing buffer.
*
* ```ts
* overlapBytes(new Uint8Array(4), new Uint8Array(4));
* ```
*/
function overlapBytes(a, b) {
	if (!a.byteLength || !b.byteLength) return false;
	return a.buffer === b.buffer && a.byteOffset < b.byteOffset + b.byteLength && b.byteOffset < a.byteOffset + a.byteLength;
}
/**
* Copies several Uint8Arrays into one.
* @param arrays - Byte arrays to concatenate.
* @returns Combined byte array.
* @throws On wrong argument types inside the byte-array list. {@link TypeError}
* @example
* Builds a `nonce || ciphertext` style buffer.
*
* ```ts
* concatBytes(new Uint8Array([1]), new Uint8Array([2]));
* ```
*/
function concatBytes(...arrays) {
	let sum = 0;
	for (let i = 0; i < arrays.length; i++) {
		const a = arrays[i];
		abytes(a);
		sum += a.length;
	}
	const res = new Uint8Array(sum);
	for (let i = 0, pad = 0; i < arrays.length; i++) {
		const a = arrays[i];
		res.set(a, pad);
		pad += a.length;
	}
	return res;
}
/**
* Merges user options into defaults.
* @param defaults - Default option values.
* @param opts - User-provided overrides.
* @returns Combined options object.
* `defaults` is a library-owned mutable object; user-provided `opts` only need to be
* object-shaped, since "plain object" checks reject valid proxy/cross-realm containers.
* The merge mutates `defaults` in place and returns the same object, so direct callers
* should pass a fresh defaults object unless they intentionally want shared state updated.
* @throws If options are missing or not an object. {@link Error}
* @example
* Applies user overrides to the default cipher options.
*
* ```ts
* checkOpts({ rounds: 20 }, { rounds: 8 });
* ```
*/
function checkOpts(defaults, opts) {
	aobject(defaults, "defaults");
	aobject(opts, "opts");
	return Object.assign(defaults, opts);
}
/**
* Compares two byte arrays in kinda constant time once lengths already match.
* @param a - First byte array.
* @param b - Second byte array.
* @returns `true` when the arrays contain the same bytes. Different lengths still return early.
* @example
* Compares an expected authentication tag with the received one.
*
* ```ts
* equalBytes(new Uint8Array([1]), new Uint8Array([1]));
* ```
*/
function equalBytes(a, b) {
	a = abytes(a);
	b = abytes(b);
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}
/**
* Wraps a keyed MAC constructor into a one-shot helper with `.create()`.
* @param keyLen - Valid probe-key length used to read static metadata once.
* The probe key is only used for `outputLen` / `blockLen`, so callers with several valid key sizes
* can pass any representative size as long as those values stay fixed.
* @param macCons - Keyed MAC constructor or factory.
* @param fromMsg - Optional adapter that derives extra constructor args from the one-shot message.
* @returns Callable MAC helper with `.create()`.
*/
function wrapMacConstructor(keyLen, macCons, fromMsg) {
	const mac = macCons;
	const getArgs = fromMsg || (() => []);
	const macC = (msg, key) => mac(key, ...getArgs(msg)).update(msg).digest();
	const tmp = mac(new Uint8Array(keyLen), ...getArgs(/* @__PURE__ */ new Uint8Array(0)));
	macC.outputLen = tmp.outputLen;
	macC.blockLen = tmp.blockLen;
	macC.create = (key, ...args) => mac(key, ...args);
	return macC;
}
/**
* Wraps a cipher: validates args, ensures encrypt() can only be called once.
* Used internally by the exported cipher constructors.
* Output-buffer support is inferred from the wrapped `encrypt` / `decrypt`
* arity (`fn.length === 2`), so wrapped output-capable methods must use a normal
* second parameter, not a default/rest parameter. AAD support is explicit in
* `params.withAAD`; optional AAD starts after the nonce slot when one is present.
* @__NO_SIDE_EFFECTS__
* @param params - Static cipher metadata. See {@link CipherParams}.
* @param constructor - Cipher constructor.
* @returns Wrapped constructor with validation.
*/
var wrapCipher = (params, constructor) => {
	function wrappedCipher(key, ...args) {
		abytes(key, void 0, "key");
		if (params.nonceLength !== void 0) {
			const nonce = args[0];
			abytes(nonce, params.varSizeNonce ? void 0 : params.nonceLength, "nonce");
		}
		const tagl = params.tagLength;
		const aadStart = params.nonceLength !== void 0 ? 1 : 0;
		if (!params.withAAD) {
			for (let i = aadStart; i < args.length; i++) if (isBytes(args[i])) throw new Error("AAD not supported");
		}
		if (params.withAAD && args[aadStart] !== void 0) abytes(args[aadStart], void 0, "AAD");
		const cipher = constructor(key, ...args);
		const checkOutput = (fnLength, output) => {
			if (output !== void 0) {
				if (fnLength !== 2) throw new Error("cipher output not supported");
				abytes(output, void 0, "output");
			}
		};
		let called = false;
		return {
			encrypt(data, output) {
				if (called) throw new Error("cannot encrypt() twice with same key + nonce");
				called = true;
				abytes(data, void 0, "data");
				checkOutput(cipher.encrypt.length, output);
				return cipher.encrypt(data, output);
			},
			decrypt(data, output) {
				abytes(data, void 0, "data");
				if (tagl && data.length < tagl) throw new Error("\"ciphertext\" expected length >= tagLength=" + tagl);
				checkOutput(cipher.decrypt.length, output);
				return cipher.decrypt(data, output);
			}
		};
	}
	Object.assign(wrappedCipher, params);
	return wrappedCipher;
};
/**
* By default, returns u8a of length.
* When out is available, it checks it for validity and uses it.
* @param expectedLength - Required output length.
* @param out - Optional destination buffer.
* @param onlyAligned - Whether `out` must be 4-byte aligned.
* @returns Output buffer ready for writing.
* @throws On wrong argument types. {@link TypeError}
* @throws If the provided output buffer has the wrong size. {@link RangeError}
* @throws If the provided output buffer has the wrong alignment. {@link Error}
* @example
* Reuses a caller-provided output buffer when lengths match.
*
* ```ts
* getOutput(16, new Uint8Array(16));
* ```
*/
function getOutput(expectedLength, out, onlyAligned = true) {
	if (out === void 0) return new Uint8Array(expectedLength);
	abytes(out, expectedLength, "output");
	if (onlyAligned && !isAligned32(out)) throw new Error("invalid output, must be aligned");
	return out;
}
/**
* Encodes data and AAD lengths into a 16-byte buffer.
* @param dataLength - Data length. Units are caller-defined: GCM passes bit
* lengths, ChaCha20-Poly1305 passes byte lengths — the helper writes the raw values.
* @param aadLength - AAD length, same unit convention as `dataLength`.
* The serialized block is still `aadLength || dataLength`, matching GCM/Poly1305
* conventions even though the helper parameter order is `(dataLength, aadLength)`.
* @param isLE - Whether to encode lengths as little-endian.
* @returns 16-byte length block.
* @throws On wrong argument types passed to the endian validator. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Builds the length block appended by GCM and Poly1305.
*
* ```ts
* u64Lengths(16, 8, true);
* ```
*/
function u64Lengths(dataLength, aadLength, isLE) {
	anumber(dataLength);
	anumber(aadLength);
	abool(isLE);
	const num = /* @__PURE__ */ new Uint8Array(16);
	const view = createView(num);
	view.setBigUint64(0, BigInt(aadLength), isLE);
	view.setBigUint64(8, BigInt(dataLength), isLE);
	return num;
}
/**
* Checks whether a byte array is aligned to a 4-byte offset.
* @param bytes - Byte array to inspect.
* @returns `true` when the view is 4-byte aligned.
* @example
* Checks whether a buffer can be safely viewed as Uint32Array.
*
* ```ts
* isAligned32(new Uint8Array(4));
* ```
*/
function isAligned32(bytes) {
	return bytes.byteOffset % 4 === 0;
}
/**
* Copies bytes into a new Uint8Array.
* @param bytes - Bytes to copy.
* @returns Copied byte array.
* @throws On wrong argument types. {@link TypeError}
* @example
* Copies input into an aligned Uint8Array before block processing.
*
* ```ts
* copyBytes(new Uint8Array([1, 2]));
* ```
*/
function copyBytes(bytes) {
	return Uint8Array.from(abytes(bytes));
}
/**
* Cryptographically secure PRNG backed by `crypto.getRandomValues`.
* @param bytesLength - number of random bytes to generate
* @returns Random bytes.
* The platform `getRandomValues()` implementation still defines any
* single-call length cap, and this helper rejects oversize requests
* with a stable library `RangeError` instead of host-specific errors.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @throws If the current runtime does not provide `crypto.getRandomValues`. {@link Error}
* @example
* Generate a fresh random key or nonce.
* ```ts
* const key = randomBytes(16);
* ```
*/
function randomBytes$1(bytesLength = 32) {
	anumber(bytesLength, "bytesLength");
	const cr = typeof globalThis === "object" ? globalThis.crypto : null;
	if (typeof cr?.getRandomValues !== "function") throw new Error("crypto.getRandomValues must be defined");
	if (bytesLength > 65536) throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
	return cr.getRandomValues(new Uint8Array(bytesLength));
}
/**
* Uses CSPRNG for nonce, nonce injected in ciphertext.
* For `encrypt`, a `nonceBytes`-length buffer is fetched from CSPRNG and
* prepended to encrypted ciphertext. For `decrypt`, first `nonceBytes` of ciphertext
* are treated as nonce. The wrapper always allocates a fresh `nonce || ciphertext`
* buffer on encrypt and intentionally does not support caller-provided destination buffers.
* Too-short decrypt inputs are split into short/empty nonce views and then delegated
* to the wrapped cipher instead of being rejected here first.
*
* NOTE: Under the same key, using random nonces (e.g. `managedNonce`) with AES-GCM and ChaCha
* should be limited to `2**23` (8M) messages to get a collision chance of
* `2**-50`. Stretching to `2**32` (4B) messages would raise that chance to
* `2**-33`, still negligible but creeping up.
* @param fn - Cipher constructor that expects a nonce.
* @param randomBytes_ - Random-byte source used for nonce generation.
* @returns Cipher constructor that prepends the nonce to ciphertext.
* @throws On wrong argument types. {@link TypeError}
* @throws On invalid nonce lengths observed at wrapper construction or use. {@link RangeError}
* @example
* Prepends a fresh random nonce to every ciphertext.
*
* ```ts
* import { gcm } from '@noble/ciphers/aes.js';
* import { managedNonce, randomBytes } from '@noble/ciphers/utils.js';
* const wrapped = managedNonce(gcm);
* const key = randomBytes(16);
* const ciphertext = wrapped(key).encrypt(new Uint8Array([1, 2, 3]));
* wrapped(key).decrypt(ciphertext);
* ```
*/
function managedNonce(fn, randomBytes_ = randomBytes$1) {
	if (typeof fn !== "function") throw new TypeError("\"fn\" expected cipher constructor, got type=" + typeof fn);
	if (typeof randomBytes_ !== "function") throw new TypeError("\"randomBytes_\" expected function, got type=" + typeof randomBytes_);
	const { nonceLength } = fn;
	anumber(nonceLength, "fn.nonceLength");
	const addNonce = (nonce, ciphertext, plaintext) => {
		const out = concatBytes(nonce, ciphertext);
		if (!overlapBytes(plaintext, ciphertext)) ciphertext.fill(0);
		return out;
	};
	const res = ((key, ...args) => ({
		encrypt(plaintext) {
			abytes(plaintext, void 0, "data");
			const nonce = randomBytes_(nonceLength);
			const encrypted = fn(key, nonce, ...args).encrypt(plaintext);
			if (encrypted instanceof Promise) return encrypted.then((ct) => addNonce(nonce, ct, plaintext));
			return addNonce(nonce, encrypted, plaintext);
		},
		decrypt(ciphertext) {
			abytes(ciphertext, void 0, "data");
			const nonce = ciphertext.subarray(0, nonceLength);
			const decrypted = ciphertext.subarray(nonceLength);
			return fn(key, nonce, ...args).decrypt(decrypted);
		}
	}));
	if ("blockSize" in fn) res.blockSize = fn.blockSize;
	if ("tagLength" in fn) res.tagLength = fn.tagLength;
	if ("withAAD" in fn) res.withAAD = fn.withAAD;
	return res;
}
//#endregion
//#region ../../node_modules/.bun/@noble+ciphers@2.3.0/node_modules/@noble/ciphers/_arx.js
/**
* Basic utils for ARX (add-rotate-xor) salsa and chacha ciphers.

RFC8439 requires multi-step cipher stream, where
authKey starts with counter: 0, actual msg with counter: 1.

For this, we need a way to re-use nonce / counter:

const counter = new Uint8Array(4);
chacha(..., counter, ...); // counter is now 1
chacha(..., counter, ...); // counter is now 2

This is complicated:

- 32-bit counters are enough, no need for 64-bit: max ArrayBuffer size in JS is 4GB
- Original papers don't allow mutating counters
- Counter overflow is undefined [^1]
- Idea A: allow providing (nonce | counter) instead of just nonce, re-use it
- Caveat: Cannot be re-used through all cases:
- * chacha has (counter | nonce)
- * xchacha has (nonce16 | counter | nonce16)
- Idea B: separate nonce / counter and provide separate API for counter re-use
- Caveat: there are different counter sizes depending on an algorithm.
- salsa & chacha also differ in structures of key & sigma:
salsa20:      s[0] | k(4) | s[1] | nonce(2) | cnt(2) | s[2] | k(4) | s[3]
chacha:       s(4) | k(8) | cnt(1) | nonce(3)
chacha20orig: s(4) | k(8) | cnt(2) | nonce(2)
- Idea C: helper method such as `setSalsaState(key, nonce, sigma, data)`
- Caveat: we can't re-use counter array

xchacha uses the subkey and remaining 8 byte nonce with ChaCha20 as normal
(prefixed by 4 NUL bytes, since RFC8439 specifies a 12-byte nonce).
Counter overflow is undefined; see {@link https://mailarchive.ietf.org/arch/msg/cfrg/gsOnTJzcbgG6OqD8Sc0GO5aR_tU/ | the CFRG thread}.
Current noble policy is strict non-wrap for the shared 32-bit counter path:
exported ARX ciphers reject initial `0xffffffff` and stop before any implicit
wrap back to zero.
See {@link https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha#appendix-A.2 | the XChaCha appendix} for the extended-nonce construction.

* @module
*/
var encodeStr = (str) => Uint8Array.from(str.split(""), (c) => c.charCodeAt(0));
var sigma16_32 = /* @__PURE__ */ (() => swap32IfBE(u32(encodeStr("expand 16-byte k"))))();
var sigma32_32 = /* @__PURE__ */ (() => swap32IfBE(u32(encodeStr("expand 32-byte k"))))();
/**
* Rotates a 32-bit word left.
* @param a - Input word.
* @param b - Rotation count in bits.
* @returns Rotated 32-bit word.
* @example
* Moves the top byte of `0x12345678` into the low byte position.
* ```ts
* rotl(0x12345678, 8);
* ```
*/
function rotl(a, b) {
	return a << b | a >>> 32 - b;
}
var BLOCK_LEN = 64;
var BLOCK_LEN32 = 16;
var MAX_COUNTER = /* @__PURE__ */ (() => 2 ** 32 - 1)();
var U32_EMPTY = /* @__PURE__ */ Uint32Array.of();
function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
	const len = data.length;
	const block = new Uint8Array(BLOCK_LEN);
	const b32 = u32(block);
	const isAligned = isLE && isAligned32(data) && isAligned32(output);
	const d32 = isAligned ? u32(data) : U32_EMPTY;
	const o32 = isAligned ? u32(output) : U32_EMPTY;
	if (!isLE) {
		for (let pos = 0; pos < len; counter++) {
			core(sigma, key, nonce, b32, counter, rounds);
			swap32IfBE(b32);
			if (counter >= MAX_COUNTER) throw new Error("arx: counter overflow");
			const take = Math.min(BLOCK_LEN, len - pos);
			for (let j = 0, posj; j < take; j++) {
				posj = pos + j;
				output[posj] = data[posj] ^ block[j];
			}
			pos += take;
		}
		return;
	}
	for (let pos = 0; pos < len; counter++) {
		core(sigma, key, nonce, b32, counter, rounds);
		if (counter >= MAX_COUNTER) throw new Error("arx: counter overflow");
		const take = Math.min(BLOCK_LEN, len - pos);
		if (isAligned && take === BLOCK_LEN) {
			const pos32 = pos / 4;
			if (pos % 4 !== 0) throw new Error("arx: invalid block position");
			for (let j = 0, posj; j < BLOCK_LEN32; j++) {
				posj = pos32 + j;
				o32[posj] = d32[posj] ^ b32[j];
			}
			pos += BLOCK_LEN;
			continue;
		}
		for (let j = 0, posj; j < take; j++) {
			posj = pos + j;
			output[posj] = data[posj] ^ block[j];
		}
		pos += take;
	}
}
/**
* Creates an ARX stream cipher from a 32-bit core permutation.
* Used internally to build the exported Salsa and ChaCha stream ciphers.
* @param core - Core function that fills one keystream block.
* @param opts - Cipher layout and nonce-extension options. See {@link CipherOpts}.
* @returns Stream cipher function over byte arrays.
* @throws If the core callback, key size, counter, or output sizing is invalid. {@link Error}
*/
function createCipher(core, opts) {
	const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts({
		allowShortKeys: false,
		counterLength: 8,
		counterRight: false,
		rounds: 20
	}, opts);
	if (typeof core !== "function") throw new Error("core must be a function");
	anumber(counterLength);
	anumber(rounds);
	abool(counterRight);
	abool(allowShortKeys);
	return (key, nonce, data, output, counter = 0) => {
		abytes(key, void 0, "key");
		abytes(nonce, void 0, "nonce");
		abytes(data, void 0, "data");
		const len = data.length;
		output = getOutput(len, output, false);
		anumber(counter);
		if (counter < 0 || counter >= MAX_COUNTER) throw new Error("arx: counter overflow");
		const toClean = [];
		let l = key.length;
		let k;
		let sigma;
		if (l === 32) {
			toClean.push(k = copyBytes(key));
			sigma = sigma32_32;
		} else if (l === 16 && allowShortKeys) {
			k = /* @__PURE__ */ new Uint8Array(32);
			k.set(key);
			k.set(key, 16);
			sigma = sigma16_32;
			toClean.push(k);
		} else {
			abytes(key, 32, "arx key");
			throw new Error("invalid key size");
		}
		if (!isLE || !isAligned32(nonce)) toClean.push(nonce = copyBytes(nonce));
		let k32 = u32(k);
		if (extendNonceFn) {
			if (nonce.length !== 24) throw new Error("arx: extended nonce must be 24 bytes");
			const n16 = nonce.subarray(0, 16);
			if (isLE) extendNonceFn(sigma, k32, u32(n16), k32);
			else {
				const sigmaRaw = swap32IfBE(Uint32Array.from(sigma));
				extendNonceFn(sigmaRaw, k32, u32(n16), k32);
				clean(sigmaRaw);
				swap32IfBE(k32);
			}
			nonce = nonce.subarray(16);
		} else if (!isLE) swap32IfBE(k32);
		const nonceNcLen = 16 - counterLength;
		if (nonceNcLen !== nonce.length) throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
		if (nonceNcLen !== 12) {
			const nc = /* @__PURE__ */ new Uint8Array(12);
			nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
			nonce = nc;
			toClean.push(nonce);
		}
		const n32 = swap32IfBE(u32(nonce));
		try {
			runCipher(core, sigma, k32, n32, data, output, counter, rounds);
			return output;
		} finally {
			clean(...toClean);
		}
	};
}
//#endregion
//#region ../../node_modules/.bun/@noble+ciphers@2.3.0/node_modules/@noble/ciphers/_poly1305.js
/**
* Poly1305 ({@link https://cr.yp.to/mac/poly1305-20050329.pdf | PDF},
* {@link https://en.wikipedia.org/wiki/Poly1305 | wiki})
* is a fast and parallel secret-key message-authentication code suitable for
* a wide variety of applications. It was standardized in
* {@link https://www.rfc-editor.org/rfc/rfc8439 | RFC 8439} and is now used in TLS 1.3.
*
* Polynomial MACs are not perfect for every situation:
* they lack Random Key Robustness: the MAC can be forged, and can't be used in PAKE schemes.
* See {@link https://keymaterial.net/2020/09/07/invisible-salamanders-in-aes-gcm-siv/ | the invisible salamanders attack writeup}.
* To combat invisible salamanders, `hash(key)` can be included in ciphertext,
* however, this would violate ciphertext indistinguishability:
* an attacker would know which key was used - so `HKDF(key, i)`
* could be used instead.
*
* Check out the {@link https://cr.yp.to/mac.html | original website}.
* Based on public-domain {@link https://github.com/floodyberry/poly1305-donna | poly1305-donna}.
* @module
*/
function u8to16(a, i) {
	return a[i++] & 255 | (a[i++] & 255) << 8;
}
/**
* Incremental Poly1305 MAC state.
* Prefer `poly1305()` for one-shot use.
* @param key - 32-byte Poly1305 one-time key.
* @example
* Feeds one chunk into an incremental Poly1305 state with a fresh one-time key.
*
* ```ts
* import { Poly1305 } from '@noble/ciphers/_poly1305.js';
* import { randomBytes } from '@noble/ciphers/utils.js';
* const key = randomBytes(32);
* const mac = new Poly1305(key);
* mac.update(new Uint8Array([1, 2, 3]));
* mac.digest();
* ```
*/
var Poly1305 = class {
	blockLen = 16;
	outputLen = 16;
	buffer = /* @__PURE__ */ new Uint8Array(16);
	r = /* @__PURE__ */ new Uint16Array(10);
	h = /* @__PURE__ */ new Uint16Array(10);
	pad = /* @__PURE__ */ new Uint16Array(8);
	pos = 0;
	finished = false;
	destroyed = false;
	constructor(key) {
		key = copyBytes(abytes(key, 32, "key"));
		const t0 = u8to16(key, 0);
		const t1 = u8to16(key, 2);
		const t2 = u8to16(key, 4);
		const t3 = u8to16(key, 6);
		const t4 = u8to16(key, 8);
		const t5 = u8to16(key, 10);
		const t6 = u8to16(key, 12);
		const t7 = u8to16(key, 14);
		this.r[0] = t0 & 8191;
		this.r[1] = (t0 >>> 13 | t1 << 3) & 8191;
		this.r[2] = (t1 >>> 10 | t2 << 6) & 7939;
		this.r[3] = (t2 >>> 7 | t3 << 9) & 8191;
		this.r[4] = (t3 >>> 4 | t4 << 12) & 255;
		this.r[5] = t4 >>> 1 & 8190;
		this.r[6] = (t4 >>> 14 | t5 << 2) & 8191;
		this.r[7] = (t5 >>> 11 | t6 << 5) & 8065;
		this.r[8] = (t6 >>> 8 | t7 << 8) & 8191;
		this.r[9] = t7 >>> 5 & 127;
		for (let i = 0; i < 8; i++) this.pad[i] = u8to16(key, 16 + 2 * i);
	}
	process(data, offset, isLast = false) {
		const hibit = isLast ? 0 : 2048;
		const { h, r } = this;
		const r0 = r[0];
		const r1 = r[1];
		const r2 = r[2];
		const r3 = r[3];
		const r4 = r[4];
		const r5 = r[5];
		const r6 = r[6];
		const r7 = r[7];
		const r8 = r[8];
		const r9 = r[9];
		const t0 = u8to16(data, offset + 0);
		const t1 = u8to16(data, offset + 2);
		const t2 = u8to16(data, offset + 4);
		const t3 = u8to16(data, offset + 6);
		const t4 = u8to16(data, offset + 8);
		const t5 = u8to16(data, offset + 10);
		const t6 = u8to16(data, offset + 12);
		const t7 = u8to16(data, offset + 14);
		let h0 = h[0] + (t0 & 8191);
		let h1 = h[1] + ((t0 >>> 13 | t1 << 3) & 8191);
		let h2 = h[2] + ((t1 >>> 10 | t2 << 6) & 8191);
		let h3 = h[3] + ((t2 >>> 7 | t3 << 9) & 8191);
		let h4 = h[4] + ((t3 >>> 4 | t4 << 12) & 8191);
		let h5 = h[5] + (t4 >>> 1 & 8191);
		let h6 = h[6] + ((t4 >>> 14 | t5 << 2) & 8191);
		let h7 = h[7] + ((t5 >>> 11 | t6 << 5) & 8191);
		let h8 = h[8] + ((t6 >>> 8 | t7 << 8) & 8191);
		let h9 = h[9] + (t7 >>> 5 | hibit);
		let c = 0;
		let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6);
		c = d0 >>> 13;
		d0 &= 8191;
		d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1);
		c += d0 >>> 13;
		d0 &= 8191;
		let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7);
		c = d1 >>> 13;
		d1 &= 8191;
		d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2);
		c += d1 >>> 13;
		d1 &= 8191;
		let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8);
		c = d2 >>> 13;
		d2 &= 8191;
		d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3);
		c += d2 >>> 13;
		d2 &= 8191;
		let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9);
		c = d3 >>> 13;
		d3 &= 8191;
		d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4);
		c += d3 >>> 13;
		d3 &= 8191;
		let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
		c = d4 >>> 13;
		d4 &= 8191;
		d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5);
		c += d4 >>> 13;
		d4 &= 8191;
		let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
		c = d5 >>> 13;
		d5 &= 8191;
		d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6);
		c += d5 >>> 13;
		d5 &= 8191;
		let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
		c = d6 >>> 13;
		d6 &= 8191;
		d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7);
		c += d6 >>> 13;
		d6 &= 8191;
		let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
		c = d7 >>> 13;
		d7 &= 8191;
		d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8);
		c += d7 >>> 13;
		d7 &= 8191;
		let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
		c = d8 >>> 13;
		d8 &= 8191;
		d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9);
		c += d8 >>> 13;
		d8 &= 8191;
		let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
		c = d9 >>> 13;
		d9 &= 8191;
		d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
		c += d9 >>> 13;
		d9 &= 8191;
		c = (c << 2) + c | 0;
		c = c + d0 | 0;
		d0 = c & 8191;
		c = c >>> 13;
		d1 += c;
		h[0] = d0;
		h[1] = d1;
		h[2] = d2;
		h[3] = d3;
		h[4] = d4;
		h[5] = d5;
		h[6] = d6;
		h[7] = d7;
		h[8] = d8;
		h[9] = d9;
	}
	finalize() {
		const { h, pad } = this;
		const g = /* @__PURE__ */ new Uint16Array(10);
		let c = h[1] >>> 13;
		h[1] &= 8191;
		for (let i = 2; i < 10; i++) {
			h[i] += c;
			c = h[i] >>> 13;
			h[i] &= 8191;
		}
		h[0] += c * 5;
		c = h[0] >>> 13;
		h[0] &= 8191;
		h[1] += c;
		c = h[1] >>> 13;
		h[1] &= 8191;
		h[2] += c;
		g[0] = h[0] + 5;
		c = g[0] >>> 13;
		g[0] &= 8191;
		for (let i = 1; i < 10; i++) {
			g[i] = h[i] + c;
			c = g[i] >>> 13;
			g[i] &= 8191;
		}
		g[9] -= 8192;
		let mask = (c ^ 1) - 1;
		for (let i = 0; i < 10; i++) g[i] &= mask;
		mask = ~mask;
		for (let i = 0; i < 10; i++) h[i] = h[i] & mask | g[i];
		h[0] = (h[0] | h[1] << 13) & 65535;
		h[1] = (h[1] >>> 3 | h[2] << 10) & 65535;
		h[2] = (h[2] >>> 6 | h[3] << 7) & 65535;
		h[3] = (h[3] >>> 9 | h[4] << 4) & 65535;
		h[4] = (h[4] >>> 12 | h[5] << 1 | h[6] << 14) & 65535;
		h[5] = (h[6] >>> 2 | h[7] << 11) & 65535;
		h[6] = (h[7] >>> 5 | h[8] << 8) & 65535;
		h[7] = (h[8] >>> 8 | h[9] << 5) & 65535;
		let f = h[0] + pad[0];
		h[0] = f & 65535;
		for (let i = 1; i < 8; i++) {
			f = (h[i] + pad[i] | 0) + (f >>> 16) | 0;
			h[i] = f & 65535;
		}
		clean(g);
	}
	update(data) {
		aexists(this);
		abytes(data);
		data = copyBytes(data);
		const { buffer, blockLen } = this;
		const len = data.length;
		for (let pos = 0; pos < len;) {
			const take = Math.min(blockLen - this.pos, len - pos);
			if (take === blockLen) {
				for (; blockLen <= len - pos; pos += blockLen) this.process(data, pos);
				continue;
			}
			buffer.set(data.subarray(pos, pos + take), this.pos);
			this.pos += take;
			pos += take;
			if (this.pos === blockLen) {
				this.process(buffer, 0, false);
				this.pos = 0;
			}
		}
		return this;
	}
	destroy() {
		this.destroyed = true;
		clean(this.h, this.r, this.buffer, this.pad);
	}
	digestInto(out) {
		aexists(this);
		aoutput(out, this);
		this.finished = true;
		const { buffer, h } = this;
		let { pos } = this;
		if (pos) {
			buffer[pos++] = 1;
			for (; pos < 16; pos++) buffer[pos] = 0;
			this.process(buffer, 0, true);
		}
		this.finalize();
		let opos = 0;
		for (let i = 0; i < 8; i++) {
			out[opos++] = h[i] >>> 0;
			out[opos++] = h[i] >>> 8;
		}
	}
	digest() {
		const { buffer, outputLen } = this;
		this.digestInto(buffer);
		const res = buffer.slice(0, outputLen);
		this.destroy();
		return res;
	}
};
/**
* Poly1305 MAC from RFC 8439.
* @param msg - Message bytes to authenticate.
* @param key - 32-byte Poly1305 one-time key.
* @returns 16-byte authentication tag.
* @example
* Authenticates one message with a one-shot Poly1305 call and a fresh key.
*
* ```ts
* import { poly1305 } from '@noble/ciphers/_poly1305.js';
* import { randomBytes } from '@noble/ciphers/utils.js';
* const key = randomBytes(32);
* poly1305(new Uint8Array(), key);
* ```
*/
var poly1305 = /* @__PURE__ */ wrapMacConstructor(32, (key) => new Poly1305(key));
//#endregion
//#region ../../node_modules/.bun/@noble+ciphers@2.3.0/node_modules/@noble/ciphers/chacha.js
/**
* ChaCha stream cipher, released
* in 2008. Developed after Salsa20, ChaCha aims to increase diffusion per round.
* It was standardized in
* {@link https://www.rfc-editor.org/rfc/rfc8439 | RFC 8439} and
* is now used in TLS 1.3.
*
* {@link https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha | XChaCha20}
* extended-nonce variant is also provided. Similar to XSalsa, it's safe to use with
* randomly-generated nonces.
*
* Check out
* {@link http://cr.yp.to/chacha/chacha-20080128.pdf | PDF},
* {@link https://en.wikipedia.org/wiki/Salsa20 | wiki}, and
* {@link https://cr.yp.to/chacha.html | website}.
*
* @module
*/
/**
* ChaCha core function. Uses an unrolled loop (chachaCore, hchacha) - 4x
* faster than a simple loop, but larger & harder to read. A simple-loop
* reference version lives in `test/misc/micro-ciphers.ts`;
* `test/arx.test.ts` keeps the two aligned.
* The specific implementation is selected in `createCipher` below.
*/
/** RFC 8439 §2.3 block core for `state = constants | key | counter | nonce`. */
function chachaCore(s, k, n, out, cnt, rounds = 20) {
	let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2];
	let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
	for (let r = 0; r < rounds; r += 2) {
		x00 = x00 + x04 | 0;
		x12 = rotl(x12 ^ x00, 16);
		x08 = x08 + x12 | 0;
		x04 = rotl(x04 ^ x08, 12);
		x00 = x00 + x04 | 0;
		x12 = rotl(x12 ^ x00, 8);
		x08 = x08 + x12 | 0;
		x04 = rotl(x04 ^ x08, 7);
		x01 = x01 + x05 | 0;
		x13 = rotl(x13 ^ x01, 16);
		x09 = x09 + x13 | 0;
		x05 = rotl(x05 ^ x09, 12);
		x01 = x01 + x05 | 0;
		x13 = rotl(x13 ^ x01, 8);
		x09 = x09 + x13 | 0;
		x05 = rotl(x05 ^ x09, 7);
		x02 = x02 + x06 | 0;
		x14 = rotl(x14 ^ x02, 16);
		x10 = x10 + x14 | 0;
		x06 = rotl(x06 ^ x10, 12);
		x02 = x02 + x06 | 0;
		x14 = rotl(x14 ^ x02, 8);
		x10 = x10 + x14 | 0;
		x06 = rotl(x06 ^ x10, 7);
		x03 = x03 + x07 | 0;
		x15 = rotl(x15 ^ x03, 16);
		x11 = x11 + x15 | 0;
		x07 = rotl(x07 ^ x11, 12);
		x03 = x03 + x07 | 0;
		x15 = rotl(x15 ^ x03, 8);
		x11 = x11 + x15 | 0;
		x07 = rotl(x07 ^ x11, 7);
		x00 = x00 + x05 | 0;
		x15 = rotl(x15 ^ x00, 16);
		x10 = x10 + x15 | 0;
		x05 = rotl(x05 ^ x10, 12);
		x00 = x00 + x05 | 0;
		x15 = rotl(x15 ^ x00, 8);
		x10 = x10 + x15 | 0;
		x05 = rotl(x05 ^ x10, 7);
		x01 = x01 + x06 | 0;
		x12 = rotl(x12 ^ x01, 16);
		x11 = x11 + x12 | 0;
		x06 = rotl(x06 ^ x11, 12);
		x01 = x01 + x06 | 0;
		x12 = rotl(x12 ^ x01, 8);
		x11 = x11 + x12 | 0;
		x06 = rotl(x06 ^ x11, 7);
		x02 = x02 + x07 | 0;
		x13 = rotl(x13 ^ x02, 16);
		x08 = x08 + x13 | 0;
		x07 = rotl(x07 ^ x08, 12);
		x02 = x02 + x07 | 0;
		x13 = rotl(x13 ^ x02, 8);
		x08 = x08 + x13 | 0;
		x07 = rotl(x07 ^ x08, 7);
		x03 = x03 + x04 | 0;
		x14 = rotl(x14 ^ x03, 16);
		x09 = x09 + x14 | 0;
		x04 = rotl(x04 ^ x09, 12);
		x03 = x03 + x04 | 0;
		x14 = rotl(x14 ^ x03, 8);
		x09 = x09 + x14 | 0;
		x04 = rotl(x04 ^ x09, 7);
	}
	let oi = 0;
	out[oi++] = y00 + x00 | 0;
	out[oi++] = y01 + x01 | 0;
	out[oi++] = y02 + x02 | 0;
	out[oi++] = y03 + x03 | 0;
	out[oi++] = y04 + x04 | 0;
	out[oi++] = y05 + x05 | 0;
	out[oi++] = y06 + x06 | 0;
	out[oi++] = y07 + x07 | 0;
	out[oi++] = y08 + x08 | 0;
	out[oi++] = y09 + x09 | 0;
	out[oi++] = y10 + x10 | 0;
	out[oi++] = y11 + x11 | 0;
	out[oi++] = y12 + x12 | 0;
	out[oi++] = y13 + x13 | 0;
	out[oi++] = y14 + x14 | 0;
	out[oi++] = y15 + x15 | 0;
}
/**
* hchacha hashes key and nonce into key' and nonce' for xchacha20.
* Algorithmically identical to `hchacha_small` from `test/misc/micro-ciphers.ts`,
* but this exported path normalizes word order on big-endian hosts.
* Reuses `chachaCore` and subtracts its feed-forward, keeping the hot per-block
* path untouched.
* @param s - Sigma constants as 32-bit words.
* @param k - Key words.
* @param i - Nonce-prefix words.
* @param out - Output buffer for the derived subkey.
* @example
* Derives the XChaCha subkey from sigma, key, and nonce-prefix words.
*
* ```ts
* const sigma = new Uint32Array(4);
* const key = new Uint32Array(8);
* const nonce = new Uint32Array(4);
* const out = new Uint32Array(8);
* hchacha(sigma, key, nonce, out);
* ```
*/
function hchacha(s, k, i, out) {
	const s2 = isLE ? s : swap32IfBE(s.slice(0, 4));
	const k2 = isLE ? k : swap32IfBE(k.slice(0, 8));
	const i2 = isLE ? i : swap32IfBE(i.slice(0, 4));
	const t = /* @__PURE__ */ new Uint32Array(16);
	chachaCore(s2, k2, i2.subarray(1), t, i2[0]);
	let oi = 0;
	out[oi++] = t[0] - s2[0] | 0;
	out[oi++] = t[1] - s2[1] | 0;
	out[oi++] = t[2] - s2[2] | 0;
	out[oi++] = t[3] - s2[3] | 0;
	out[oi++] = t[12] - i2[0] | 0;
	out[oi++] = t[13] - i2[1] | 0;
	out[oi++] = t[14] - i2[2] | 0;
	out[oi++] = t[15] - i2[3] | 0;
	swap32IfBE(out);
	if (!isLE) clean(s2, k2, i2);
	clean(t);
}
/**
* XChaCha eXtended-nonce ChaCha. With 24-byte nonce, it's safe to make it random (CSPRNG).
* See {@link https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha | the IRTF draft}.
* The nonce/counter layout still reserves 8 counter bytes internally, but the shared public
* `counter` argument follows noble's strict non-wrapping 32-bit policy. See `src/_arx.ts`
* near `MAX_COUNTER` for the full counter-policy rationale.
* @param key - 32-byte key.
* @param nonce - 24-byte extended nonce.
* @param data - Input bytes to xor with the keystream.
* @param output - Optional destination buffer.
* @param counter - Initial block counter.
* @returns Encrypted or decrypted bytes.
* @example
* Encrypts bytes with XChaCha20 using a fresh key and random 24-byte nonce.
*
* ```ts
* import { xchacha20 } from '@noble/ciphers/chacha.js';
* import { randomBytes } from '@noble/ciphers/utils.js';
* const key = randomBytes(32);
* const nonce = randomBytes(24);
* xchacha20(key, nonce, new Uint8Array(4));
* ```
*/
var xchacha20 = /* @__PURE__ */ createCipher(chachaCore, {
	counterRight: false,
	counterLength: 8,
	extendNonceFn: hchacha,
	allowShortKeys: false
});
var ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
var updatePadded = (h, msg) => {
	h.update(msg);
	const leftover = msg.length % 16;
	if (leftover) h.update(ZEROS16.subarray(leftover));
};
var ZEROS32 = /* @__PURE__ */ new Uint8Array(32);
function computeTag(fn, key, nonce, ciphertext, AAD) {
	if (AAD !== void 0) abytes(AAD, void 0, "AAD");
	const authKey = fn(key, nonce, ZEROS32);
	const lengths = u64Lengths(ciphertext.length, AAD ? AAD.length : 0, true);
	const h = poly1305.create(authKey);
	if (AAD) updatePadded(h, AAD);
	updatePadded(h, ciphertext);
	h.update(lengths);
	const res = h.digest();
	clean(authKey, lengths);
	return res;
}
/**
* AEAD algorithm from RFC 8439.
* Salsa20 and chacha (RFC 8439) use poly1305 differently.
* We could have composed them, but it's hard because of authKey:
* In salsa20, authKey changes position in salsa stream.
* In chacha, authKey can't be computed inside computeTag, it modifies the counter.
*/
var _poly1305_aead = (xorStream) => (key, nonce, AAD) => {
	const tagLength = 16;
	return {
		encrypt(plaintext, output) {
			const plength = plaintext.length;
			output = getOutput(plength + tagLength, output, false);
			output.set(plaintext);
			const oPlain = output.subarray(0, -16);
			xorStream(key, nonce, oPlain, oPlain, 1);
			const tag = computeTag(xorStream, key, nonce, oPlain, AAD);
			output.set(tag, plength);
			clean(tag);
			return output;
		},
		decrypt(ciphertext, output) {
			output = getOutput(ciphertext.length - tagLength, output, false);
			const data = ciphertext.subarray(0, -16);
			const passedTag = ciphertext.subarray(-16);
			const tag = computeTag(xorStream, key, nonce, data, AAD);
			if (!equalBytes(passedTag, tag)) {
				clean(tag);
				throw new Error("invalid tag");
			}
			output.set(ciphertext.subarray(0, -16));
			xorStream(key, nonce, output, output, 1);
			clean(tag);
			return output;
		}
	};
};
/**
* XChaCha20-Poly1305 extended-nonce chacha.
*
* Can be safely used with random nonces (CSPRNG).
* See {@link https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha | the IRTF draft}.
* @param key - 32-byte key.
* @param nonce - 24-byte nonce.
* @param AAD - Additional authenticated data.
* @returns AEAD cipher instance.
* @example
* Encrypts and authenticates plaintext with a fresh key and random 24-byte nonce.
*
* ```ts
* import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
* import { randomBytes } from '@noble/ciphers/utils.js';
* const key = randomBytes(32);
* const nonce = randomBytes(24);
* const aad = new TextEncoder().encode('session metadata');
* const cipher = xchacha20poly1305(key, nonce, aad);
* cipher.encrypt(new Uint8Array([1, 2, 3]));
* ```
*/
var xchacha20poly1305 = /* @__PURE__ */ wrapCipher({
	blockSize: 64,
	nonceLength: 24,
	tagLength: 16,
	withAAD: true
}, /* @__PURE__ */ _poly1305_aead(xchacha20));
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/crypto/index.mjs
var ENVELOPE_PREFIX = "$ba$";
function parseEnvelope(data) {
	if (!data.startsWith(ENVELOPE_PREFIX)) return null;
	const firstSep = 4;
	const secondSep = data.indexOf("$", firstSep);
	if (secondSep === -1) return null;
	const version = parseInt(data.slice(firstSep, secondSep), 10);
	if (!Number.isInteger(version) || version < 0) return null;
	return {
		version,
		ciphertext: data.slice(secondSep + 1)
	};
}
function formatEnvelope(version, ciphertext) {
	return `${ENVELOPE_PREFIX}${version}$${ciphertext}`;
}
async function rawEncrypt(secret, data) {
	const keyAsBytes = await createHash$1("SHA-256").digest(secret);
	const dataAsBytes = utf8ToBytes(data);
	return bytesToHex(managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes)).encrypt(dataAsBytes));
}
async function rawDecrypt(secret, hex) {
	const keyAsBytes = await createHash$1("SHA-256").digest(secret);
	const dataAsBytes = hexToBytes(hex);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
}
var symmetricEncrypt = async ({ key, data }) => {
	if (typeof key === "string") return rawEncrypt(key, data);
	const secret = key.keys.get(key.currentVersion);
	if (!secret) throw new Error(`Secret version ${key.currentVersion} not found in keys`);
	const ciphertext = await rawEncrypt(secret, data);
	return formatEnvelope(key.currentVersion, ciphertext);
};
var symmetricDecrypt = async ({ key, data }) => {
	if (typeof key === "string") return rawDecrypt(key, data);
	const envelope = parseEnvelope(data);
	if (envelope) {
		const secret = key.keys.get(envelope.version);
		if (!secret) throw new Error(`Secret version ${envelope.version} not found in keys (key may have been retired)`);
		return rawDecrypt(secret, envelope.ciphertext);
	}
	if (key.legacySecret) return rawDecrypt(key.legacySecret, data);
	throw new Error("Cannot decrypt legacy bare-hex payload: no legacy secret available. Set BETTER_AUTH_SECRET for backwards compatibility.");
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/context/store-capabilities.mjs
function hasServerSessionStore(options) {
	return !!options.database || !!options.secondaryStorage;
}
function hasServerAccountStore(options) {
	return !!options.database;
}
function shouldBindAccountCookieToSessionUser(options) {
	return hasServerAccountStore(options);
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/utils/db.mjs
/**
* Filters output data by removing fields with the `returned: false` attribute.
* This ensures sensitive fields are not exposed in API responses.
*/
function filterOutputFields(data, additionalFields) {
	if (!data || !additionalFields) return data;
	const returnFiltered = Object.entries(additionalFields).filter(([, { returned }]) => returned === false).map(([key]) => key);
	return Object.entries(structuredClone(data)).filter(([key]) => !returnFiltered.includes(key)).reduce((acc, [key, value]) => ({
		...acc,
		[key]: value
	}), {});
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/schema.mjs
var cache = /* @__PURE__ */ new WeakMap();
function getFields(options, modelName, mode) {
	const cacheKey = `${modelName}:${mode}`;
	if (!cache.has(options)) cache.set(options, /* @__PURE__ */ new Map());
	const tableCache = cache.get(options);
	if (tableCache.has(cacheKey)) return tableCache.get(cacheKey);
	const coreSchema = mode === "output" ? getAuthTables(options)[modelName]?.fields ?? {} : {};
	const additionalFields = modelName === "user" || modelName === "session" || modelName === "account" ? options[modelName]?.additionalFields : void 0;
	let schema = {
		...coreSchema,
		...additionalFields ?? {}
	};
	for (const plugin of options.plugins || []) if (plugin.schema && plugin.schema[modelName]) schema = {
		...schema,
		...plugin.schema[modelName].fields
	};
	tableCache.set(cacheKey, schema);
	return schema;
}
function parseUserOutput(options, user) {
	return filterOutputFields(user, getFields(options, "user", "output"));
}
/**
* Builds a synthetic user object that matches the shape of a real user
* returned from the database. This ensures enumeration protection works
* correctly by making synthetic and real user responses indistinguishable.
*
* The function iterates over the user output schema and:
* - Includes all fields that should be returned (returned !== false)
* - Uses provided values when available
* - Sets optional fields to null when no value is provided
* - Applies default values where defined
* - Always includes the 'id' field (not part of schema but always present)
*/
function buildSyntheticUserOutput(options, data) {
	const schema = getFields(options, "user", "output");
	const result = {};
	for (const key in schema) {
		const fieldAttr = schema[key];
		if (fieldAttr.returned === false) continue;
		if (key in data && data[key] !== void 0) result[key] = data[key];
		else if (fieldAttr.defaultValue !== void 0) result[key] = typeof fieldAttr.defaultValue === "function" ? fieldAttr.defaultValue() : fieldAttr.defaultValue;
		else if (!fieldAttr.required) result[key] = null;
	}
	if ("id" in data) result.id = data.id;
	return result;
}
function parseSessionOutput(options, session) {
	return filterOutputFields(session, getFields(options, "session", "output"));
}
function parseAccountOutput(options, account) {
	const { accessToken: _accessToken, refreshToken: _refreshToken, idToken: _idToken, accessTokenExpiresAt: _accessTokenExpiresAt, refreshTokenExpiresAt: _refreshTokenExpiresAt, password: _password, ...rest } = filterOutputFields(account, getFields(options, "account", "output"));
	return rest;
}
function parseInputData(data, schema) {
	const action = schema.action || "create";
	const fields = schema.fields;
	const parsedData = Object.create(null);
	for (const key in fields) {
		if (key in data) {
			if (fields[key].input === false) {
				if (fields[key].defaultValue !== void 0) {
					if (action !== "update") {
						parsedData[key] = fields[key].defaultValue;
						continue;
					}
				}
				if (data[key]) throw APIError.from("BAD_REQUEST", {
					...BASE_ERROR_CODES.FIELD_NOT_ALLOWED,
					message: `${key} is not allowed to be set`
				});
				continue;
			}
			if (fields[key].validator?.input && data[key] !== void 0) {
				const result = fields[key].validator.input["~standard"].validate(data[key]);
				if (result instanceof Promise) throw APIError.from("INTERNAL_SERVER_ERROR", BASE_ERROR_CODES.ASYNC_VALIDATION_NOT_SUPPORTED);
				if ("issues" in result && result.issues) throw APIError.from("BAD_REQUEST", {
					...BASE_ERROR_CODES.VALIDATION_ERROR,
					message: result.issues[0]?.message || "Validation Error"
				});
				parsedData[key] = result.value;
				continue;
			}
			if (fields[key].transform?.input && data[key] !== void 0) {
				parsedData[key] = fields[key].transform?.input(data[key]);
				continue;
			}
			parsedData[key] = data[key];
			continue;
		}
		if (fields[key].defaultValue !== void 0 && action === "create") {
			if (typeof fields[key].defaultValue === "function") {
				parsedData[key] = fields[key].defaultValue();
				continue;
			}
			parsedData[key] = fields[key].defaultValue;
			continue;
		}
		if (fields[key].required && action === "create") throw APIError.from("BAD_REQUEST", {
			...BASE_ERROR_CODES.MISSING_FIELD,
			message: `${key} is required`
		});
	}
	return parsedData;
}
function parseUserInput(options, user = {}, action) {
	return parseInputData(user, {
		fields: getFields(options, "user", "input"),
		action
	});
}
function parseAdditionalUserInputFromProviderProfile(options, profile = {}, action) {
	const schema = getFields(options, "user", "input");
	const allowedProfileFields = Object.create(null);
	for (const key of Object.keys(profile)) {
		if (schema[key]?.input === false) continue;
		allowedProfileFields[key] = profile[key];
	}
	return parseInputData(allowedProfileFields, {
		fields: schema,
		action
	});
}
function parseSessionInput(options, session, action) {
	return parseInputData(session, {
		fields: getFields(options, "session", "input"),
		action
	});
}
function getSessionDefaultFields(options) {
	const fields = getFields(options, "session", "input");
	const defaults = {};
	for (const key in fields) if (fields[key].defaultValue !== void 0) defaults[key] = typeof fields[key].defaultValue === "function" ? fields[key].defaultValue() : fields[key].defaultValue;
	return defaults;
}
function mergeSchema(schema, newSchema) {
	if (!newSchema) return schema;
	for (const table in newSchema) {
		const newModelName = newSchema[table]?.modelName;
		if (newModelName) schema[table].modelName = newModelName;
		for (const field in schema[table].fields) {
			const newField = newSchema[table]?.fields?.[field];
			if (!newField) continue;
			schema[table].fields[field].fieldName = newField;
		}
	}
	return schema;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/utils/date.mjs
var getDate = (span, unit = "ms") => {
	return new Date(Date.now() + (unit === "sec" ? span * 1e3 : span));
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/utils/is-promise.mjs
function isPromise(obj) {
	return !!obj && (typeof obj === "object" || typeof obj === "function") && typeof obj.then === "function";
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/utils/time.mjs
var SEC = 1e3;
var MIN = SEC * 60;
var HOUR = MIN * 60;
var DAY = HOUR * 24;
var WEEK = DAY * 7;
var MONTH = DAY * 30;
var YEAR = DAY * 365.25;
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)(?: (ago|from now))?$/i;
function parse(value) {
	const match = REGEX.exec(value);
	if (!match || match[4] && match[1]) throw new TypeError(`Invalid time string format: "${value}". Use formats like "7d", "30m", "1 hour", etc.`);
	const n = parseFloat(match[2]);
	const unit = match[3].toLowerCase();
	let result;
	switch (unit) {
		case "years":
		case "year":
		case "yrs":
		case "yr":
		case "y":
			result = n * YEAR;
			break;
		case "months":
		case "month":
		case "mo":
			result = n * MONTH;
			break;
		case "weeks":
		case "week":
		case "w":
			result = n * WEEK;
			break;
		case "days":
		case "day":
		case "d":
			result = n * DAY;
			break;
		case "hours":
		case "hour":
		case "hrs":
		case "hr":
		case "h":
			result = n * HOUR;
			break;
		case "minutes":
		case "minute":
		case "mins":
		case "min":
		case "m":
			result = n * MIN;
			break;
		case "seconds":
		case "second":
		case "secs":
		case "sec":
		case "s":
			result = n * SEC;
			break;
		default: throw new TypeError(`Unknown time unit: "${unit}"`);
	}
	if (match[1] === "-" || match[4] === "ago") return -result;
	return result;
}
/**
* Parse a time string and return the value in milliseconds.
*
* @param value - A time string like "7d", "30m", "1 hour", "2 hours ago"
* @returns The parsed value in milliseconds
* @throws TypeError if the string format is invalid
*
* @example
* ms("1d")          // 86400000
* ms("2 hours")     // 7200000
* ms("30s")         // 30000
* ms("2 hours ago") // -7200000
*/
function ms(value) {
	return parse(value);
}
/**
* Parse a time string and return the value in seconds.
*
* @param value - A time string like "7d", "30m", "1 hour", "2 hours ago"
* @returns The parsed value in seconds (rounded)
* @throws TypeError if the string format is invalid
*
* @example
* sec("1d")          // 86400
* sec("2 hours")     // 7200
* sec("-30s")        // -30
* sec("2 hours ago") // -7200
*/
function sec(value) {
	return Math.round(parse(value) / 1e3);
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/cookies/cookie-utils.mjs
function tryDecode$2(str) {
	if (str.indexOf("%") === -1) return str;
	try {
		return decodeURIComponent(str);
	} catch {
		return str;
	}
}
var SECURE_COOKIE_PREFIX = "__Secure-";
/**
* Split a comma-joined `Set-Cookie` header string into individual cookies.
*/
function splitSetCookieHeader(setCookie) {
	if (!setCookie) return [];
	const result = [];
	let start = 0;
	let i = 0;
	while (i < setCookie.length) {
		if (setCookie[i] === ",") {
			let j = i + 1;
			while (j < setCookie.length && setCookie[j] === " ") j++;
			while (j < setCookie.length && setCookie[j] !== "=" && setCookie[j] !== ";" && setCookie[j] !== ",") j++;
			if (j < setCookie.length && setCookie[j] === "=") {
				const part = setCookie.slice(start, i).trim();
				if (part) result.push(part);
				start = i + 1;
				while (start < setCookie.length && setCookie[start] === " ") start++;
				i = start;
				continue;
			}
		}
		i++;
	}
	const last = setCookie.slice(start).trim();
	if (last) result.push(last);
	return result;
}
function parseSetCookieHeader(setCookie) {
	const cookies = /* @__PURE__ */ new Map();
	splitSetCookieHeader(setCookie).forEach((cookieString) => {
		const [nameValue, ...attributes] = cookieString.split(";").map((part) => part.trim());
		const [name, ...valueParts] = (nameValue || "").split("=");
		const value = unquoteCookieValue(valueParts.join("="));
		if (!name) return;
		const attrObj = { value: tryDecode$2(value) };
		attributes.forEach((attribute) => {
			const [attrName, ...attrValueParts] = attribute.split("=");
			const attrValue = attrValueParts.join("=");
			const normalizedAttrName = attrName.trim().toLowerCase();
			switch (normalizedAttrName) {
				case "max-age":
					attrObj["max-age"] = attrValue ? parseInt(attrValue.trim(), 10) : void 0;
					break;
				case "expires":
					attrObj.expires = attrValue ? new Date(attrValue.trim()) : void 0;
					break;
				case "domain":
					attrObj.domain = attrValue ? attrValue.trim() : void 0;
					break;
				case "path":
					attrObj.path = attrValue ? attrValue.trim() : void 0;
					break;
				case "secure":
					attrObj.secure = true;
					break;
				case "httponly":
					attrObj.httponly = true;
					break;
				case "samesite":
					attrObj.samesite = attrValue ? attrValue.trim().toLowerCase() : void 0;
					break;
				case "partitioned":
					attrObj.partitioned = true;
					break;
				default:
					attrObj[normalizedAttrName] = attrValue ? attrValue.trim() : true;
					break;
			}
		});
		cookies.set(name, attrObj);
	});
	return cookies;
}
/**
* Cookie-name token char set per RFC 7230 §3.2.6.
*
* @see https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6
*/
var cookieNameRegex = /^[\x21\x23-\x27\x2A\x2B\x2D\x2E\x30-\x39\x41-\x5A\x5E\x5F\x60\x61-\x7A\x7C\x7E]+$/;
/**
* Cookie-value char set per RFC 6265 §4.1.1, plus space and comma.
*
* @see https://datatracker.ietf.org/doc/html/rfc6265#section-4.1.1
* @see https://github.com/golang/go/issues/7243
*/
var cookieValueRegex = /^[\x20\x21\x23-\x3A\x3C-\x5B\x5D-\x7E]*$/;
/**
* Strip surrounding double-quotes per RFC 6265 §4.1.1 quoted-string form.
*
* @see https://datatracker.ietf.org/doc/html/rfc6265#section-4.1.1
*/
function unquoteCookieValue(value) {
	if (value.length < 2 || !value.startsWith("\"") || !value.endsWith("\"")) return value;
	return value.slice(1, -1);
}
/**
* Trim leading/trailing OWS (space / horizontal tab) per RFC 7230 §3.2.3.
* Narrower than `String.prototype.trim()`, which strips CR/LF and other
* whitespace and would let CTLs escape `cookieValueRegex`.
*
* @see https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.3
*/
function trimOWS(s) {
	let start = 0;
	let end = s.length;
	while (start < end) {
		const c = s.charCodeAt(start);
		if (c !== 32 && c !== 9) break;
		start++;
	}
	while (end > start) {
		const c = s.charCodeAt(end - 1);
		if (c !== 32 && c !== 9) break;
		end--;
	}
	return start === 0 && end === s.length ? s : s.slice(start, end);
}
/**
* Tolerates `;` separators without the SP that RFC 6265 §4.2.1 mandates,
* since proxies and runtimes commonly strip it. Silently drops entries
* whose name violates RFC 7230 token or whose value violates RFC 6265
* cookie-octet (plus space and comma). Strips optional surrounding
* double-quotes per RFC 6265 §4.1.1.
*/
function parseCookies$1(cookie) {
	const cookieMap = /* @__PURE__ */ new Map();
	if (cookie.length < 2) return cookieMap;
	for (const chunk of cookie.split(";")) {
		const eq = chunk.indexOf("=");
		if (eq === -1) continue;
		const key = trimOWS(chunk.slice(0, eq));
		const val = unquoteCookieValue(trimOWS(chunk.slice(eq + 1)));
		if (cookieNameRegex.test(key) && cookieValueRegex.test(val)) cookieMap.set(key, tryDecode$2(val));
	}
	return cookieMap;
}
/**
* Add or replace a cookie in the request `Cookie` header.
*
* Cookie pairs are joined with `; `, but `headers.append("cookie", ...)`
* joins with `, ` in some runtimes (e.g. Deno, Cloudflare Workers) and
* breaks downstream cookie parsing. This builds the header value via
* parse-mutate-serialize.
*/
function setRequestCookie(headers, name, value) {
	const cookieMap = parseCookies$1(headers.get("cookie") || "");
	if (cookieNameRegex.test(name)) cookieMap.set(name, value);
	headers.set("cookie", Array.from(cookieMap, ([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "));
}
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/utils.mjs
var jsonContentTypeRegex = /^application\/([a-z0-9.+-]*\+)?json/i;
async function getBody(request, allowedMediaTypes) {
	const contentType = request.headers.get("content-type") || "";
	const normalizedContentType = contentType.toLowerCase();
	if (!request.body) return;
	if (allowedMediaTypes && allowedMediaTypes.length > 0) {
		if (!allowedMediaTypes.some((allowed) => {
			const normalizedContentTypeBase = normalizedContentType.split(";")[0].trim();
			const normalizedAllowed = allowed.toLowerCase().trim();
			return normalizedContentTypeBase === normalizedAllowed || normalizedContentTypeBase.includes(normalizedAllowed);
		})) {
			if (!normalizedContentType) throw new APIError$1(415, {
				message: `Content-Type is required. Allowed types: ${allowedMediaTypes.join(", ")}`,
				code: "UNSUPPORTED_MEDIA_TYPE"
			});
			throw new APIError$1(415, {
				message: `Content-Type "${contentType}" is not allowed. Allowed types: ${allowedMediaTypes.join(", ")}`,
				code: "UNSUPPORTED_MEDIA_TYPE"
			});
		}
	}
	if (jsonContentTypeRegex.test(normalizedContentType)) try {
		return await request.json();
	} catch (e) {
		if (e instanceof SyntaxError) throw new APIError$1(400, {
			message: "Invalid JSON in request body",
			code: "BAD_REQUEST"
		});
		throw e;
	}
	if (normalizedContentType.includes("application/x-www-form-urlencoded")) {
		const formData = await request.formData();
		const result = {};
		formData.forEach((value, key) => {
			result[key] = value.toString();
		});
		return result;
	}
	if (normalizedContentType.includes("multipart/form-data")) {
		const formData = await request.formData();
		const result = {};
		formData.forEach((value, key) => {
			result[key] = value;
		});
		return result;
	}
	if (normalizedContentType.includes("text/plain")) return await request.text();
	if (normalizedContentType.includes("application/octet-stream")) return await request.arrayBuffer();
	if (normalizedContentType.includes("application/pdf") || normalizedContentType.includes("image/") || normalizedContentType.includes("video/")) return await request.blob();
	if (normalizedContentType.includes("application/stream") || request.body instanceof ReadableStream) return request.body;
	return await request.text();
}
function isAPIError$1(error) {
	return error instanceof APIError$1 || error?.name === "APIError";
}
function tryDecode$1(str) {
	try {
		return str.includes("%") ? decodeURIComponent(str) : str;
	} catch {
		return str;
	}
}
async function tryCatch(promise) {
	try {
		return {
			data: await promise,
			error: null
		};
	} catch (error) {
		return {
			data: null,
			error
		};
	}
}
/**
* Check if an object is a `Request`
* - `instanceof`: works for native Request instances
* - `toString`: handles where instanceof check fails but the object is still a valid Request
*/
function isRequest(obj) {
	return obj instanceof Request || Object.prototype.toString.call(obj) === "[object Request]";
}
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/to-response.mjs
function isJSONSerializable(value) {
	if (value === void 0) return false;
	const t = typeof value;
	if (t === "string" || t === "number" || t === "boolean" || t === null) return true;
	if (t !== "object") return false;
	if (Array.isArray(value)) return true;
	if (value.buffer) return false;
	return value.constructor && value.constructor.name === "Object" || typeof value.toJSON === "function";
}
function safeStringify(obj) {
	const parents = /* @__PURE__ */ new WeakMap();
	const ids = /* @__PURE__ */ new WeakMap();
	let id = 0;
	const isAncestor = (value, holder) => {
		let curr = holder;
		while (curr) {
			if (curr === value) return true;
			curr = parents.get(curr);
		}
		return false;
	};
	return JSON.stringify(obj, function(_key, value) {
		if (typeof value === "bigint") return value.toString();
		if (typeof value === "object" && value !== null) {
			if (isAncestor(value, this)) return `[Circular ref-${ids.get(value)}]`;
			parents.set(value, this);
			if (!ids.has(value)) ids.set(value, id++);
		}
		return value;
	});
}
function isJSONResponse(value) {
	if (!value || typeof value !== "object") return false;
	return "_flag" in value && value._flag === "json";
}
/**
* Headers that MUST be stripped when building an HTTP response from
* arbitrary header input. These are request-only, hop-by-hop, or
* transport-managed headers that cause protocol violations when present
* on responses (e.g. Content-Length mismatch → net::ERR_CONTENT_LENGTH_MISMATCH).
*
* Sources:
*   - RFC 9110 §10.1   (Request Context Fields)
*   - RFC 9110 §7.6.1  (Connection / hop-by-hop)
*   - RFC 9110 §11.6-7 (Authentication credentials)
*   - RFC 9110 §12.5   (Content negotiation)
*   - RFC 9110 §13.1   (Conditional request headers)
*   - RFC 9110 §14.2   (Range requests)
*   - RFC 6265 §5.4    (Cookie)
*   - RFC 6454         (Origin)
*/
var REQUEST_ONLY_HEADERS = /* @__PURE__ */ new Set([
	"host",
	"user-agent",
	"referer",
	"from",
	"expect",
	"authorization",
	"proxy-authorization",
	"cookie",
	"origin",
	"accept-charset",
	"accept-encoding",
	"accept-language",
	"if-match",
	"if-none-match",
	"if-modified-since",
	"if-unmodified-since",
	"if-range",
	"range",
	"max-forwards",
	"connection",
	"keep-alive",
	"transfer-encoding",
	"te",
	"upgrade",
	"trailer",
	"proxy-connection",
	"content-length"
]);
function stripRequestOnlyHeaders(headers) {
	for (const name of REQUEST_ONLY_HEADERS) headers.delete(name);
}
/**
* Copy headers from `source` into `target`. `Set-Cookie` is appended (one
* header per cookie) because RFC 9110 §5.3 notes it cannot be combined
* into a single comma-separated value; other headers are set (replace).
*/
function copyHeaders(target, source) {
	if (!source) return;
	for (const [key, value] of new Headers(source).entries()) if (key.toLowerCase() === "set-cookie") target.append(key, value);
	else target.set(key, value);
}
function toResponse(data, init) {
	if (data instanceof Response) {
		if (init?.headers) {
			const safeHeaders = new Headers(init.headers);
			stripRequestOnlyHeaders(safeHeaders);
			copyHeaders(data.headers, safeHeaders);
		}
		return data;
	}
	if (isJSONResponse(data)) {
		const body = data.body;
		const routerResponse = data.routerResponse;
		if (routerResponse instanceof Response) return routerResponse;
		const headers = new Headers();
		copyHeaders(headers, routerResponse?.headers);
		copyHeaders(headers, data.headers);
		if (init?.headers) {
			const safeHeaders = new Headers(init.headers);
			stripRequestOnlyHeaders(safeHeaders);
			copyHeaders(headers, safeHeaders);
		}
		headers.set("Content-Type", "application/json");
		return new Response(JSON.stringify(body), {
			...routerResponse,
			headers,
			status: data.status ?? init?.status ?? routerResponse?.status,
			statusText: init?.statusText ?? routerResponse?.statusText
		});
	}
	if (isAPIError$1(data)) return toResponse(data.body, {
		status: init?.status ?? data.statusCode,
		statusText: data.status.toString(),
		headers: init?.headers || data.headers
	});
	let body = data;
	const headers = new Headers(init?.headers);
	stripRequestOnlyHeaders(headers);
	if (!data) {
		if (data === null) body = JSON.stringify(null);
		headers.set("content-type", "application/json");
	} else if (typeof data === "string") {
		body = data;
		headers.set("Content-Type", "text/plain");
	} else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
		body = data;
		headers.set("Content-Type", "application/octet-stream");
	} else if (data instanceof Blob) {
		body = data;
		headers.set("Content-Type", data.type || "application/octet-stream");
	} else if (data instanceof FormData) body = data;
	else if (data instanceof URLSearchParams) {
		body = data;
		headers.set("Content-Type", "application/x-www-form-urlencoded");
	} else if (data instanceof ReadableStream) {
		body = data;
		headers.set("Content-Type", "application/octet-stream");
	} else if (isJSONSerializable(data)) {
		body = safeStringify(data);
		headers.set("Content-Type", "application/json");
	}
	return new Response(body, {
		...init,
		headers
	});
}
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/crypto.mjs
var algorithm = {
	name: "HMAC",
	hash: "SHA-256"
};
var getCryptoKey = async (secret) => {
	const secretBuf = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
	return await getWebcryptoSubtle().importKey("raw", secretBuf, algorithm, false, ["sign", "verify"]);
};
var verifySignature = async (base64Signature, value, secret) => {
	try {
		const signatureBinStr = atob(base64Signature);
		const signature = new Uint8Array(signatureBinStr.length);
		for (let i = 0, len = signatureBinStr.length; i < len; i++) signature[i] = signatureBinStr.charCodeAt(i);
		return await getWebcryptoSubtle().verify(algorithm, secret, signature, new TextEncoder().encode(value));
	} catch (e) {
		return false;
	}
};
var makeSignature = async (value, secret) => {
	const key = await getCryptoKey(secret);
	const signature = await getWebcryptoSubtle().sign(algorithm.name, key, new TextEncoder().encode(value));
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
};
var signCookieValue = async (value, secret) => {
	const signature = await makeSignature(value, secret);
	value = `${value}.${signature}`;
	value = encodeURIComponent(value);
	return value;
};
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/cookies.mjs
var getCookieKey = (key, prefix) => {
	let finalKey = key;
	if (prefix) if (prefix === "secure") finalKey = "__Secure-" + key;
	else if (prefix === "host") finalKey = "__Host-" + key;
	else return;
	return finalKey;
};
/**
* Parse an HTTP Cookie header string and returning an object of all cookie
* name-value pairs.
*
* Inspired by https://github.com/unjs/cookie-es/blob/main/src/cookie/parse.ts
*
* @param str the string representing a `Cookie` header value
*/
function parseCookies(str) {
	if (typeof str !== "string") throw new TypeError("argument str must be a string");
	const cookies = /* @__PURE__ */ new Map();
	let index = 0;
	while (index < str.length) {
		const eqIdx = str.indexOf("=", index);
		if (eqIdx === -1) break;
		let endIdx = str.indexOf(";", index);
		if (endIdx === -1) endIdx = str.length;
		else if (endIdx < eqIdx) {
			index = str.lastIndexOf(";", eqIdx - 1) + 1;
			continue;
		}
		const key = str.slice(index, eqIdx).trim();
		if (!cookies.has(key)) {
			let val = str.slice(eqIdx + 1, endIdx).trim();
			if (val.codePointAt(0) === 34) val = val.slice(1, -1);
			cookies.set(key, tryDecode$1(val));
		}
		index = endIdx + 1;
	}
	return cookies;
}
var _serialize = (key, value, opt = {}) => {
	let cookie;
	if (opt?.prefix === "secure") cookie = `${`__Secure-${key}`}=${value}`;
	else if (opt?.prefix === "host") cookie = `${`__Host-${key}`}=${value}`;
	else cookie = `${key}=${value}`;
	if (key.startsWith("__Secure-") && !opt.secure) opt.secure = true;
	if (key.startsWith("__Host-")) {
		if (!opt.secure) opt.secure = true;
		if (opt.path !== "/") opt.path = "/";
		if (opt.domain) opt.domain = void 0;
	}
	if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
		if (opt.maxAge > 3456e4) throw new Error("Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration.");
		cookie += `; Max-Age=${Math.floor(opt.maxAge)}`;
	}
	if (opt.domain && opt.prefix !== "host") cookie += `; Domain=${opt.domain}`;
	if (opt.path) cookie += `; Path=${opt.path}`;
	if (opt.expires) {
		if (opt.expires.getTime() - Date.now() > 3456e7) throw new Error("Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future.");
		cookie += `; Expires=${opt.expires.toUTCString()}`;
	}
	if (opt.httpOnly) cookie += "; HttpOnly";
	if (opt.secure) cookie += "; Secure";
	if (opt.sameSite) cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
	if (opt.partitioned) {
		if (!opt.secure) opt.secure = true;
		cookie += "; Partitioned";
	}
	return cookie;
};
var serializeCookie = (key, value, opt) => {
	value = encodeURIComponent(value);
	return _serialize(key, value, opt);
};
var serializeSignedCookie = async (key, value, secret, opt) => {
	value = await signCookieValue(value, secret);
	return _serialize(key, value, opt);
};
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/validator.mjs
/**
* Runs validation on body and query
* @returns error and data object
*/
async function runValidation(options, context = {}) {
	let request = {
		body: context.body,
		query: context.query
	};
	if (options.body) {
		const result = await options.body["~standard"].validate(context.body);
		if (result.issues) return {
			data: null,
			error: fromError(result.issues, "body")
		};
		request.body = result.value;
	}
	if (options.query) {
		const result = await options.query["~standard"].validate(context.query);
		if (result.issues) return {
			data: null,
			error: fromError(result.issues, "query")
		};
		request.query = result.value;
	}
	if (options.requireHeaders && !context.headers) return {
		data: null,
		error: {
			message: "Headers is required",
			issues: []
		}
	};
	if (options.requireRequest && !context.request) return {
		data: null,
		error: {
			message: "Request is required",
			issues: []
		}
	};
	return {
		data: request,
		error: null
	};
}
function fromError(error, validating) {
	return {
		message: error.map((e) => {
			return `[${e.path?.length ? `${validating}.` + e.path.map((x) => typeof x === "object" ? x.key : x).join(".") : validating}] ${e.message}`;
		}).join("; "),
		issues: error
	};
}
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/context.mjs
var createInternalContext = async (context, { options, path }) => {
	const headers = new Headers();
	let responseStatus = void 0;
	const { data, error } = await runValidation(options, context);
	if (error) throw new ValidationError(error.message, error.issues);
	const requestHeaders = "headers" in context ? context.headers instanceof Headers ? context.headers : new Headers(context.headers) : "request" in context && isRequest(context.request) ? context.request.headers : null;
	const requestCookies = requestHeaders?.get("cookie");
	const parsedCookies = requestCookies ? parseCookies(requestCookies) : void 0;
	const internalContext = {
		...context,
		body: data.body,
		query: data.query,
		path: context.path || path || "virtual:",
		context: "context" in context && context.context ? context.context : {},
		returned: void 0,
		headers: context?.headers,
		request: context?.request,
		params: "params" in context ? context.params : void 0,
		method: context.method ?? (Array.isArray(options.method) ? options.method[0] : options.method === "*" ? "GET" : options.method),
		setHeader: (key, value) => {
			headers.set(key, value);
		},
		getHeader: (key) => {
			if (!requestHeaders) return null;
			return requestHeaders.get(key);
		},
		getCookie: (key, prefix) => {
			const finalKey = getCookieKey(key, prefix);
			if (!finalKey) return null;
			return parsedCookies?.get(finalKey) || null;
		},
		getSignedCookie: async (key, secret, prefix) => {
			const finalKey = getCookieKey(key, prefix);
			if (!finalKey) return null;
			const value = parsedCookies?.get(finalKey);
			if (!value) return null;
			const signatureStartPos = value.lastIndexOf(".");
			if (signatureStartPos < 1) return null;
			const signedValue = value.substring(0, signatureStartPos);
			const signature = value.substring(signatureStartPos + 1);
			if (signature.length !== 44 || !signature.endsWith("=")) return null;
			return await verifySignature(signature, signedValue, await getCryptoKey(secret)) ? signedValue : false;
		},
		setCookie: (key, value, options) => {
			const cookie = serializeCookie(key, value, options);
			headers.append("set-cookie", cookie);
			return cookie;
		},
		setSignedCookie: async (key, value, secret, options) => {
			const cookie = await serializeSignedCookie(key, value, secret, options);
			headers.append("set-cookie", cookie);
			return cookie;
		},
		redirect: (url) => {
			headers.set("location", url);
			return new APIError$1("FOUND", void 0, headers);
		},
		error: (status, body, headers) => {
			return new APIError$1(status, body, headers);
		},
		setStatus: (status) => {
			responseStatus = status;
		},
		json: (json, routerResponse) => {
			if (!context.asResponse) return json;
			return {
				body: routerResponse?.body || json,
				routerResponse,
				_flag: "json"
			};
		},
		responseHeaders: headers,
		get responseStatus() {
			return responseStatus;
		}
	};
	for (const middleware of options.use || []) {
		const response = await middleware({
			...internalContext,
			returnHeaders: true,
			asResponse: false
		});
		if (response.response) Object.assign(internalContext.context, response.response);
		/**
		* Apply headers from the middleware to the endpoint headers
		*/
		if (response.headers) response.headers.forEach((value, key) => {
			internalContext.responseHeaders.set(key, value);
		});
	}
	return internalContext;
};
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/endpoint.mjs
function createEndpoint(pathOrOptions, handlerOrOptions, handlerOrNever) {
	const path = typeof pathOrOptions === "string" ? pathOrOptions : void 0;
	const options = typeof handlerOrOptions === "object" ? handlerOrOptions : pathOrOptions;
	const handler = typeof handlerOrOptions === "function" ? handlerOrOptions : handlerOrNever;
	if ((options.method === "GET" || options.method === "HEAD") && options.body) throw new BetterCallError("Body is not allowed with GET or HEAD methods");
	if (path && /\/{2,}/.test(path)) throw new BetterCallError("Path cannot contain consecutive slashes");
	const internalHandler = async (...inputCtx) => {
		const context = inputCtx[0] || {};
		const { data: internalContext, error: validationError } = await tryCatch(createInternalContext(context, {
			options,
			path
		}));
		if (validationError) {
			if (!(validationError instanceof ValidationError)) throw validationError;
			if (options.onValidationError) await options.onValidationError({
				message: validationError.message,
				issues: validationError.issues
			});
			throw new APIError$1(400, {
				message: validationError.message,
				code: "VALIDATION_ERROR"
			});
		}
		const response = await handler(internalContext).catch(async (e) => {
			if (isAPIError$1(e)) {
				const onAPIError = options.onAPIError;
				if (onAPIError) await onAPIError(e);
				if (context.asResponse) return e;
			}
			throw e;
		});
		const headers = internalContext.responseHeaders;
		const status = internalContext.responseStatus;
		return context.asResponse ? toResponse(response, {
			headers,
			status
		}) : context.returnHeaders ? context.returnStatus ? {
			headers,
			response,
			status
		} : {
			headers,
			response
		} : context.returnStatus ? {
			response,
			status
		} : response;
	};
	internalHandler.options = options;
	internalHandler.path = path;
	return internalHandler;
}
createEndpoint.create = (opts) => {
	return (path, options, handler) => {
		return createEndpoint(path, {
			...options,
			use: [...options?.use || [], ...opts?.use || []]
		}, handler);
	};
};
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/middleware.mjs
function createMiddleware(optionsOrHandler, handler) {
	const internalHandler = async (inputCtx) => {
		const context = inputCtx;
		const _handler = typeof optionsOrHandler === "function" ? optionsOrHandler : handler;
		const internalContext = await createInternalContext(context, {
			options: typeof optionsOrHandler === "function" ? {} : optionsOrHandler,
			path: "/"
		});
		if (!_handler) throw new Error("handler must be defined");
		try {
			const response = await _handler(internalContext);
			const headers = internalContext.responseHeaders;
			return context.returnHeaders ? {
				headers,
				response
			} : response;
		} catch (e) {
			if (isAPIError$1(e)) Object.defineProperty(e, kAPIErrorHeaderSymbol, {
				enumerable: false,
				configurable: true,
				get() {
					return internalContext.responseHeaders;
				}
			});
			throw e;
		}
	};
	internalHandler.options = typeof optionsOrHandler === "function" ? {} : optionsOrHandler;
	return internalHandler;
}
createMiddleware.create = (opts) => {
	function fn(optionsOrHandler, handler) {
		if (typeof optionsOrHandler === "function") return createMiddleware({ use: opts?.use }, optionsOrHandler);
		if (!handler) throw new Error("Middleware handler is required");
		return createMiddleware({
			...optionsOrHandler,
			method: "*",
			use: [...opts?.use || [], ...optionsOrHandler.use || []]
		}, handler);
	}
	return fn;
};
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/openapi.mjs
var paths = {};
function getTypeFromZodType(zodType) {
	switch (zodType.constructor.name) {
		case "ZodString": return "string";
		case "ZodNumber": return "number";
		case "ZodBoolean": return "boolean";
		case "ZodObject": return "object";
		case "ZodArray": return "array";
		default: return "string";
	}
}
function getParameters(options) {
	const parameters = [];
	if (options.metadata?.openapi?.parameters) {
		parameters.push(...options.metadata.openapi.parameters);
		return parameters;
	}
	if (options.query instanceof ZodObject) Object.entries(options.query.shape).forEach(([key, value]) => {
		if (value instanceof ZodObject) parameters.push({
			name: key,
			in: "query",
			schema: {
				type: getTypeFromZodType(value),
				..."minLength" in value && value.minLength ? { minLength: value.minLength } : {},
				description: value.description
			}
		});
	});
	return parameters;
}
function getRequestBody(options) {
	if (options.metadata?.openapi?.requestBody) return options.metadata.openapi.requestBody;
	if (!options.body) return void 0;
	if (options.body instanceof ZodObject || options.body instanceof ZodOptional) {
		const shape = options.body.shape;
		if (!shape) return void 0;
		const properties = {};
		const required = [];
		Object.entries(shape).forEach(([key, value]) => {
			if (value instanceof ZodObject) {
				properties[key] = {
					type: getTypeFromZodType(value),
					description: value.description
				};
				if (!(value instanceof ZodOptional)) required.push(key);
			}
		});
		return {
			required: options.body instanceof ZodOptional ? false : options.body ? true : false,
			content: { "application/json": { schema: {
				type: "object",
				properties,
				required
			} } }
		};
	}
}
function getResponse(responses) {
	return {
		"400": {
			content: { "application/json": { schema: {
				type: "object",
				properties: { message: { type: "string" } },
				required: ["message"]
			} } },
			description: "Bad Request. Usually due to missing parameters, or invalid parameters."
		},
		"401": {
			content: { "application/json": { schema: {
				type: "object",
				properties: { message: { type: "string" } },
				required: ["message"]
			} } },
			description: "Unauthorized. Due to missing or invalid authentication."
		},
		"403": {
			content: { "application/json": { schema: {
				type: "object",
				properties: { message: { type: "string" } }
			} } },
			description: "Forbidden. You do not have permission to access this resource or to perform this action."
		},
		"404": {
			content: { "application/json": { schema: {
				type: "object",
				properties: { message: { type: "string" } }
			} } },
			description: "Not Found. The requested resource was not found."
		},
		"429": {
			content: { "application/json": { schema: {
				type: "object",
				properties: { message: { type: "string" } }
			} } },
			description: "Too Many Requests. You have exceeded the rate limit. Try again later."
		},
		"500": {
			content: { "application/json": { schema: {
				type: "object",
				properties: { message: { type: "string" } }
			} } },
			description: "Internal Server Error. This is a problem with the server that you cannot fix."
		},
		...responses
	};
}
async function generator(endpoints, config) {
	const components = { schemas: {} };
	Object.entries(endpoints).forEach(([_, value]) => {
		const options = value.options;
		if (!value.path || options.metadata?.SERVER_ONLY) return;
		if (options.method === "GET") paths[value.path] = { get: {
			tags: ["Default", ...options.metadata?.openapi?.tags || []],
			description: options.metadata?.openapi?.description,
			operationId: options.metadata?.openapi?.operationId,
			security: [{ bearerAuth: [] }],
			parameters: getParameters(options),
			responses: getResponse(options.metadata?.openapi?.responses)
		} };
		if (options.method === "POST") {
			const body = getRequestBody(options);
			paths[value.path] = { post: {
				tags: ["Default", ...options.metadata?.openapi?.tags || []],
				description: options.metadata?.openapi?.description,
				operationId: options.metadata?.openapi?.operationId,
				security: [{ bearerAuth: [] }],
				parameters: getParameters(options),
				...body ? { requestBody: body } : { requestBody: { content: { "application/json": { schema: {
					type: "object",
					properties: {}
				} } } } },
				responses: getResponse(options.metadata?.openapi?.responses)
			} };
		}
	});
	return {
		openapi: "3.1.1",
		info: {
			title: "Better Auth",
			description: "API Reference for your Better Auth Instance",
			version: "1.1.0"
		},
		components,
		security: [{ apiKeyCookie: [] }],
		servers: [{ url: config?.url }],
		tags: [{
			name: "Default",
			description: "Default endpoints that are included with Better Auth by default. These endpoints are not part of any plugin."
		}],
		paths
	};
}
var getHTML = (apiReference, config) => `<!doctype html>
<html>
  <head>
    <title>Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json">
    ${JSON.stringify(apiReference)}
    <\/script>
	 <script>
      var configuration = {
	  	favicon: ${config?.logo ? `data:image/svg+xml;utf8,${encodeURIComponent(config.logo)}` : void 0} ,
	   	theme: ${config?.theme || "saturn"},
        metaData: {
			title: ${config?.title || "Open API Reference"},
			description: ${config?.description || "Better Call Open API"},
		}
      }
      document.getElementById('api-reference').dataset.configuration =
        JSON.stringify(configuration)
    <\/script>
	  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"><\/script>
  </body>
</html>`;
//#endregion
//#region ../../node_modules/.bun/rou3@0.7.12/node_modules/rou3/dist/index.mjs
var NullProtoObj = /* @__PURE__ */ (() => {
	const e = function() {};
	return e.prototype = Object.create(null), Object.freeze(e.prototype), e;
})();
/**
* Create a new router context.
*/
function createRouter() {
	return {
		root: { key: "" },
		static: new NullProtoObj()
	};
}
function splitPath(path) {
	const [_, ...s] = path.split("/");
	return s[s.length - 1] === "" ? s.slice(0, -1) : s;
}
function getMatchParams(segments, paramsMap) {
	const params = new NullProtoObj();
	for (const [index, name] of paramsMap) {
		const segment = index < 0 ? segments.slice(-(index + 1)).join("/") : segments[index];
		if (typeof name === "string") params[name] = segment;
		else {
			const match = segment.match(name);
			if (match) for (const key in match.groups) params[key] = match.groups[key];
		}
	}
	return params;
}
/**
* Add a route to the router context.
*/
function addRoute(ctx, method = "", path, data) {
	method = method.toUpperCase();
	if (path.charCodeAt(0) !== 47) path = `/${path}`;
	path = path.replace(/\\:/g, "%3A");
	const segments = splitPath(path);
	let node = ctx.root;
	let _unnamedParamIndex = 0;
	const paramsMap = [];
	const paramsRegexp = [];
	for (let i = 0; i < segments.length; i++) {
		let segment = segments[i];
		if (segment.startsWith("**")) {
			if (!node.wildcard) node.wildcard = { key: "**" };
			node = node.wildcard;
			paramsMap.push([
				-(i + 1),
				segment.split(":")[1] || "_",
				segment.length === 2
			]);
			break;
		}
		if (segment === "*" || segment.includes(":")) {
			if (!node.param) node.param = { key: "*" };
			node = node.param;
			if (segment === "*") paramsMap.push([
				i,
				`_${_unnamedParamIndex++}`,
				true
			]);
			else if (segment.includes(":", 1)) {
				const regexp = getParamRegexp(segment);
				paramsRegexp[i] = regexp;
				node.hasRegexParam = true;
				paramsMap.push([
					i,
					regexp,
					false
				]);
			} else paramsMap.push([
				i,
				segment.slice(1),
				false
			]);
			continue;
		}
		if (segment === "\\*") segment = segments[i] = "*";
		else if (segment === "\\*\\*") segment = segments[i] = "**";
		const child = node.static?.[segment];
		if (child) node = child;
		else {
			const staticNode = { key: segment };
			if (!node.static) node.static = new NullProtoObj();
			node.static[segment] = staticNode;
			node = staticNode;
		}
	}
	const hasParams = paramsMap.length > 0;
	if (!node.methods) node.methods = new NullProtoObj();
	node.methods[method] ??= [];
	node.methods[method].push({
		data: data || null,
		paramsRegexp,
		paramsMap: hasParams ? paramsMap : void 0
	});
	if (!hasParams) ctx.static["/" + segments.join("/")] = node;
}
function getParamRegexp(segment) {
	const regex = segment.replace(/:(\w+)/g, (_, id) => `(?<${id}>[^/]+)`).replace(/\./g, "\\.");
	return /* @__PURE__ */ new RegExp(`^${regex}$`);
}
/**
* Find a route by path.
*/
function findRoute(ctx, method = "", path, opts) {
	if (path.charCodeAt(path.length - 1) === 47) path = path.slice(0, -1);
	const staticNode = ctx.static[path];
	if (staticNode && staticNode.methods) {
		const staticMatch = staticNode.methods[method] || staticNode.methods[""];
		if (staticMatch !== void 0) return staticMatch[0];
	}
	const segments = splitPath(path);
	const match = _lookupTree(ctx, ctx.root, method, segments, 0)?.[0];
	if (match === void 0) return;
	if (opts?.params === false) return match;
	return {
		data: match.data,
		params: match.paramsMap ? getMatchParams(segments, match.paramsMap) : void 0
	};
}
function _lookupTree(ctx, node, method, segments, index) {
	if (index === segments.length) {
		if (node.methods) {
			const match = node.methods[method] || node.methods[""];
			if (match) return match;
		}
		if (node.param && node.param.methods) {
			const match = node.param.methods[method] || node.param.methods[""];
			if (match) {
				const pMap = match[0].paramsMap;
				if (pMap?.[pMap?.length - 1]?.[2]) return match;
			}
		}
		if (node.wildcard && node.wildcard.methods) {
			const match = node.wildcard.methods[method] || node.wildcard.methods[""];
			if (match) {
				const pMap = match[0].paramsMap;
				if (pMap?.[pMap?.length - 1]?.[2]) return match;
			}
		}
		return;
	}
	const segment = segments[index];
	if (node.static) {
		const staticChild = node.static[segment];
		if (staticChild) {
			const match = _lookupTree(ctx, staticChild, method, segments, index + 1);
			if (match) return match;
		}
	}
	if (node.param) {
		const match = _lookupTree(ctx, node.param, method, segments, index + 1);
		if (match) {
			if (node.param.hasRegexParam) {
				const exactMatch = match.find((m) => m.paramsRegexp[index]?.test(segment)) || match.find((m) => !m.paramsRegexp[index]);
				return exactMatch ? [exactMatch] : void 0;
			}
			return match;
		}
	}
	if (node.wildcard && node.wildcard.methods) return node.wildcard.methods[method] || node.wildcard.methods[""];
}
/**
* Find all route patterns that match the given path.
*/
function findAllRoutes(ctx, method = "", path, opts) {
	if (path.charCodeAt(path.length - 1) === 47) path = path.slice(0, -1);
	const segments = splitPath(path);
	const matches = _findAll(ctx, ctx.root, method, segments, 0);
	if (opts?.params === false) return matches;
	return matches.map((m) => {
		return {
			data: m.data,
			params: m.paramsMap ? getMatchParams(segments, m.paramsMap) : void 0
		};
	});
}
function _findAll(ctx, node, method, segments, index, matches = []) {
	const segment = segments[index];
	if (node.wildcard && node.wildcard.methods) {
		const match = node.wildcard.methods[method] || node.wildcard.methods[""];
		if (match) matches.push(...match);
	}
	if (node.param) {
		_findAll(ctx, node.param, method, segments, index + 1, matches);
		if (index === segments.length && node.param.methods) {
			const match = node.param.methods[method] || node.param.methods[""];
			if (match) {
				const pMap = match[0].paramsMap;
				if (pMap?.[pMap?.length - 1]?.[2]) matches.push(...match);
			}
		}
	}
	const staticChild = node.static?.[segment];
	if (staticChild) _findAll(ctx, staticChild, method, segments, index + 1, matches);
	if (index === segments.length && node.methods) {
		const match = node.methods[method] || node.methods[""];
		if (match) matches.push(...match);
	}
	return matches;
}
//#endregion
//#region ../../node_modules/.bun/better-call@1.3.7+68a1e3a0c4588df3/node_modules/better-call/dist/router.mjs
var createRouter$1 = (endpoints, config) => {
	if (!config?.openapi?.disabled) {
		const openapi = {
			path: "/api/reference",
			...config?.openapi
		};
		endpoints["openapi"] = createEndpoint(openapi.path, { method: "GET" }, async (c) => {
			const schema = await generator(endpoints);
			return new Response(getHTML(schema, openapi.scalar), { headers: { "Content-Type": "text/html" } });
		});
	}
	const router = createRouter();
	const middlewareRouter = createRouter();
	for (const endpoint of Object.values(endpoints)) {
		if (!endpoint.options || !endpoint.path) continue;
		if (endpoint.options?.metadata?.SERVER_ONLY) continue;
		const methods = Array.isArray(endpoint.options?.method) ? endpoint.options.method : [endpoint.options?.method];
		for (const method of methods) addRoute(router, method, endpoint.path, endpoint);
	}
	if (config?.routerMiddleware?.length) for (const { path, middleware } of config.routerMiddleware) addRoute(middlewareRouter, "*", path, middleware);
	const basePath = config?.basePath && config.basePath !== "/" ? config.basePath.replace(/\/+$/, "") : "";
	const processRequest = async (request) => {
		const url = new URL(request.url);
		const pathname = url.pathname;
		let path;
		if (basePath) {
			if (!pathname.startsWith(`${basePath}/`)) return new Response(null, {
				status: 404,
				statusText: "Not Found"
			});
			path = pathname.slice(basePath.length);
		} else path = pathname;
		if (path.length === 0 || /\/{2,}/.test(path)) return new Response(null, {
			status: 404,
			statusText: "Not Found"
		});
		const route = findRoute(router, request.method, path);
		if (path.endsWith("/") !== route?.data?.path?.endsWith("/") && !config?.skipTrailingSlashes) return new Response(null, {
			status: 404,
			statusText: "Not Found"
		});
		if (!route?.data) return new Response(null, {
			status: 404,
			statusText: "Not Found"
		});
		const query = {};
		url.searchParams.forEach((value, key) => {
			if (key in query) if (Array.isArray(query[key])) query[key].push(value);
			else query[key] = [query[key], value];
			else query[key] = value;
		});
		const handler = route.data;
		try {
			const allowedMediaTypes = handler.options.metadata?.allowedMediaTypes || config?.allowedMediaTypes;
			const context = {
				path,
				method: request.method,
				headers: request.headers,
				params: route.params ? JSON.parse(JSON.stringify(route.params)) : {},
				request,
				body: handler.options.disableBody ? void 0 : await getBody(handler.options.cloneRequest ? request.clone() : request, allowedMediaTypes),
				query,
				_flag: "router",
				asResponse: true,
				context: config?.routerContext
			};
			const middlewareRoutes = findAllRoutes(middlewareRouter, "*", path);
			if (middlewareRoutes?.length) for (const { data: middleware, params } of middlewareRoutes) {
				const res = await middleware({
					...context,
					params,
					asResponse: false
				});
				if (res instanceof Response) return res;
			}
			return await handler(context);
		} catch (error) {
			if (config?.onError) try {
				const errorResponse = await config.onError(error, request);
				if (errorResponse instanceof Response) return toResponse(errorResponse);
			} catch (error) {
				if (isAPIError$1(error)) return toResponse(error);
				throw error;
			}
			if (config?.throwError) throw error;
			if (isAPIError$1(error)) return toResponse(error);
			console.error(`# SERVER_ERROR: `, error);
			return new Response(null, {
				status: 500,
				statusText: "Internal Server Error"
			});
		}
	};
	return {
		handler: async (request) => {
			const onReq = await config?.onRequest?.(request);
			if (onReq instanceof Response) return onReq;
			const req = isRequest(onReq) ? onReq : request;
			const res = await processRequest(req);
			const onRes = await config?.onResponse?.(res, req);
			if (onRes instanceof Response) return onRes;
			return res;
		},
		endpoints
	};
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/cookies/session-store.mjs
/**
* Per-cookie byte ceiling.
* Safari's ~4093 floor is the lowest among browsers.
* Kept a little under it for attributes added after sizing.
*
* @see https://datatracker.ietf.org/doc/html/rfc6265#section-6.1
* @see https://github.com/dotnet/aspnetcore/blob/aa5493528640932601bb82ef3295e4d8ca7e11c5/src/Shared/ChunkingCookieManager/ChunkingCookieManager.cs#L40
*/
var MAX_COOKIE_SIZE = 4050;
/**
* Max chunks per cookie.
* A larger value does not belong in a cookie.
*/
var MAX_COOKIE_CHUNKS = 100;
/**
* Largest value that keeps the serialized cookie within {@link MAX_COOKIE_SIZE},
* measured with the real `serializeCookie` writer so it stays in sync with the
* wire. Non-positive when the name and attributes alone overflow.
*/
function getMaxCookieValueSize(name, options) {
	return MAX_COOKIE_SIZE - serializeCookie(name, "", { ...options }).length;
}
/**
* Read all existing chunks from cookies
*/
function readExistingChunks(cookieName, ctx) {
	const chunks = {};
	const cookies = parseCookies$1(ctx.headers?.get("cookie") || "");
	for (const [name, value] of cookies) if (name.startsWith(cookieName)) chunks[name] = value;
	return chunks;
}
/**
* Split a cookie value into chunks if needed
*/
function chunkCookie(storeName, cookie, chunks, logger) {
	const chunkSize = getMaxCookieValueSize(`${cookie.name}.${MAX_COOKIE_CHUNKS - 1}`, cookie.attributes);
	const chunkCount = chunkSize > 0 ? Math.ceil(cookie.value.length / chunkSize) : Infinity;
	if (chunkCount <= 1) {
		chunks[cookie.name] = cookie.value;
		return [cookie];
	}
	if (chunkCount > MAX_COOKIE_CHUNKS) {
		logger.warn(`${storeName} cookie is too large to store even after chunking, so the cache was skipped. Reduce the cached data or use a database session.`);
		return [];
	}
	const cookies = [];
	for (let i = 0; i < chunkCount; i++) {
		const name = `${cookie.name}.${i}`;
		const start = i * chunkSize;
		const value = cookie.value.substring(start, start + chunkSize);
		cookies.push({
			...cookie,
			name,
			value
		});
		chunks[name] = value;
	}
	logger.debug(`CHUNKING_${storeName.toUpperCase()}_COOKIE`, {
		message: `${storeName} cookie exceeds the ${MAX_COOKIE_SIZE} byte limit and was split into ${chunkCount} chunks.`,
		valueSize: cookie.value.length,
		chunkCount,
		chunkSizes: cookies.map((c) => c.value.length)
	});
	return cookies;
}
/**
* Get all cookies that should be cleaned (removed)
*/
function getCleanCookies(chunks, cookieOptions) {
	const cleanedChunks = {};
	for (const name in chunks) cleanedChunks[name] = {
		name,
		value: "",
		attributes: {
			...cookieOptions,
			maxAge: 0
		}
	};
	return cleanedChunks;
}
/**
* Store that splits a cookie into numbered chunks when its serialized form
* would exceed the per-cookie byte limit, expiring stale chunks as needed.
*
* @see https://github.com/nextauthjs/next-auth/blob/27b2519b84b8eb9cf053775dea29d577d2aa0098/packages/next-auth/src/core/lib/cookie.ts
*/
var storeFactory = (storeName) => (cookieName, cookieOptions, ctx) => {
	const chunks = readExistingChunks(cookieName, ctx);
	const logger = ctx.context.logger;
	const expireExistingChunks = () => {
		const expired = getCleanCookies(chunks, cookieOptions);
		for (const name in chunks) delete chunks[name];
		return expired;
	};
	return {
		chunk(value, options) {
			const cookies = expireExistingChunks();
			const chunked = chunkCookie(storeName, {
				name: cookieName,
				value,
				attributes: {
					...cookieOptions,
					...options
				}
			}, chunks, logger);
			for (const chunk of chunked) cookies[chunk.name] = chunk;
			return Object.values(cookies);
		},
		clean() {
			return Object.values(expireExistingChunks());
		},
		setCookies(cookies) {
			for (const cookie of cookies) ctx.setCookie(cookie.name, cookie.value, cookie.attributes);
		}
	};
};
var createSessionStore = storeFactory("Session");
var createAccountStore = storeFactory("Account");
function getChunkedCookie(ctx, cookieName) {
	const value = ctx.getCookie(cookieName);
	if (value) return value;
	const chunks = [];
	const cookieHeader = ctx.headers?.get("cookie");
	if (!cookieHeader) return null;
	for (const [name, val] of parseCookies$1(cookieHeader)) if (name.startsWith(cookieName + ".")) {
		const indexStr = name.split(".").at(-1);
		const index = parseInt(indexStr || "0", 10);
		if (!isNaN(index)) chunks.push({
			index,
			value: val
		});
	}
	if (chunks.length > 0) {
		chunks.sort((a, b) => a.index - b.index);
		return chunks.map((c) => c.value).join("");
	}
	return null;
}
async function setAccountCookie(c, accountData) {
	const accountDataCookie = c.context.authCookies.accountData;
	const options = {
		maxAge: 300,
		...accountDataCookie.attributes
	};
	const data = await symmetricEncodeJWT(accountData, c.context.secretConfig, "better-auth-account", options.maxAge);
	const accountStore = createAccountStore(accountDataCookie.name, options, c);
	accountStore.setCookies(accountStore.chunk(data, options));
}
async function getAccountCookie(c) {
	const accountCookie = getChunkedCookie(c, c.context.authCookies.accountData.name);
	if (accountCookie) {
		const accountData = safeJSONParse(await symmetricDecodeJWT(accountCookie, c.context.secretConfig, "better-auth-account"));
		if (accountData) return accountData;
	}
	return null;
}
var getSessionQuerySchema = z$1.optional(z$1.object({
	disableCookieCache: z$1.coerce.boolean().meta({ description: "Disable cookie cache and fetch session from database" }).optional(),
	disableRefresh: z$1.coerce.boolean().meta({ description: "Disable session refresh. Useful for checking session status, without updating the session" }).optional()
}));
//#endregion
//#region ../../node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/binary.mjs
var decoders = /* @__PURE__ */ new Map();
var binary = {
	decode: (data, encoding = "utf-8") => {
		if (!decoders.has(encoding)) decoders.set(encoding, new TextDecoder(encoding));
		return decoders.get(encoding).decode(data);
	},
	encode: new TextEncoder().encode
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/hex.mjs
var hexadecimal = "0123456789abcdef";
var hex = {
	encode: (data) => {
		if (typeof data === "string") data = new TextEncoder().encode(data);
		if (data.byteLength === 0) return "";
		const buffer = new Uint8Array(data);
		let result = "";
		for (const byte of buffer) result += byte.toString(16).padStart(2, "0");
		return result;
	},
	decode: (data) => {
		if (!data) return "";
		if (typeof data === "string") {
			if (data.length % 2 !== 0) throw new Error("Invalid hexadecimal string");
			if (!new RegExp(`^[${hexadecimal}]+$`).test(data)) throw new Error("Invalid hexadecimal string");
			const result = new Uint8Array(data.length / 2);
			for (let i = 0; i < data.length; i += 2) result[i / 2] = parseInt(data.slice(i, i + 2), 16);
			return new TextDecoder().decode(result);
		}
		return new TextDecoder().decode(data);
	}
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/hmac.mjs
var createHMAC = (algorithm = "SHA-256", encoding = "none") => {
	const hmac = {
		importKey: async (key, keyUsage) => {
			return getWebcryptoSubtle().importKey("raw", typeof key === "string" ? new TextEncoder().encode(key) : key, {
				name: "HMAC",
				hash: { name: algorithm }
			}, false, [keyUsage]);
		},
		sign: async (hmacKey, data) => {
			if (typeof hmacKey === "string") hmacKey = await hmac.importKey(hmacKey, "sign");
			const signature = await getWebcryptoSubtle().sign("HMAC", hmacKey, typeof data === "string" ? new TextEncoder().encode(data) : data);
			if (encoding === "hex") return hex.encode(signature);
			if (encoding === "base64" || encoding === "base64url" || encoding === "base64urlnopad") return base64Url.encode(signature, { padding: encoding !== "base64urlnopad" });
			return signature;
		},
		verify: async (hmacKey, data, signature) => {
			if (typeof hmacKey === "string") hmacKey = await hmac.importKey(hmacKey, "verify");
			if (encoding === "hex") signature = hex.decode(signature);
			if (encoding === "base64" || encoding === "base64url" || encoding === "base64urlnopad") signature = await base64.decode(signature);
			return getWebcryptoSubtle().verify("HMAC", hmacKey, typeof signature === "string" ? new TextEncoder().encode(signature) : signature, typeof data === "string" ? new TextEncoder().encode(data) : data);
		}
	};
	return hmac;
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/cookies/index.mjs
function createCookieGetter(options) {
	const baseURLString = typeof options.baseURL === "string" ? options.baseURL : void 0;
	const dynamicProtocol = typeof options.baseURL === "object" && options.baseURL !== null ? options.baseURL.protocol : void 0;
	const secureCookiePrefix = (options.advanced?.useSecureCookies !== void 0 ? options.advanced?.useSecureCookies : dynamicProtocol === "https" ? true : dynamicProtocol === "http" ? false : baseURLString ? baseURLString.startsWith("https://") : isProduction) ? SECURE_COOKIE_PREFIX : "";
	const crossSubdomainEnabled = !!options.advanced?.crossSubDomainCookies?.enabled;
	const domain = crossSubdomainEnabled ? options.advanced?.crossSubDomainCookies?.domain || (baseURLString ? new URL(baseURLString).hostname : void 0) : void 0;
	if (crossSubdomainEnabled && !domain && !isDynamicBaseURLConfig(options.baseURL)) throw new BetterAuthError("baseURL is required when crossSubdomainCookies are enabled.");
	function createCookie(cookieName, overrideAttributes = {}) {
		const prefix = options.advanced?.cookiePrefix || "better-auth";
		const name = options.advanced?.cookies?.[cookieName]?.name || `${prefix}.${cookieName}`;
		const attributes = options.advanced?.cookies?.[cookieName]?.attributes ?? {};
		return {
			name: `${secureCookiePrefix}${name}`,
			attributes: {
				secure: !!secureCookiePrefix,
				sameSite: "lax",
				path: "/",
				httpOnly: true,
				...crossSubdomainEnabled ? { domain } : {},
				...options.advanced?.defaultCookieAttributes,
				...overrideAttributes,
				...attributes
			}
		};
	}
	return createCookie;
}
function getCookies(options) {
	const createCookie = createCookieGetter(options);
	const sessionToken = createCookie("session_token", { maxAge: options.session?.expiresIn || sec("7d") });
	const sessionData = createCookie("session_data", { maxAge: options.session?.cookieCache?.maxAge || 300 });
	const accountData = createCookie("account_data", { maxAge: options.session?.cookieCache?.maxAge || 300 });
	const dontRememberToken = createCookie("dont_remember");
	return {
		sessionToken: {
			name: sessionToken.name,
			attributes: sessionToken.attributes
		},
		sessionData: {
			name: sessionData.name,
			attributes: sessionData.attributes
		},
		dontRememberToken: {
			name: dontRememberToken.name,
			attributes: dontRememberToken.attributes
		},
		accountData: {
			name: accountData.name,
			attributes: accountData.attributes
		}
	};
}
async function setCookieCache(ctx, session, dontRememberMe) {
	if (!ctx.context.options.session?.cookieCache?.enabled) return;
	const filteredSession = filterOutputFields(session.session, ctx.context.options.session?.additionalFields);
	const filteredUser = parseUserOutput(ctx.context.options, session.user);
	const versionConfig = ctx.context.options.session?.cookieCache?.version;
	let version = "1";
	if (versionConfig) {
		if (typeof versionConfig === "string") version = versionConfig;
		else if (typeof versionConfig === "function") {
			const result = versionConfig(session.session, session.user);
			version = isPromise(result) ? await result : result;
		}
	}
	const sessionData = {
		session: filteredSession,
		user: filteredUser,
		updatedAt: Date.now(),
		version
	};
	const options = {
		...ctx.context.authCookies.sessionData.attributes,
		maxAge: dontRememberMe ? void 0 : ctx.context.authCookies.sessionData.attributes.maxAge
	};
	const expiresAtDate = getDate(options.maxAge || 60, "sec").getTime();
	const strategy = ctx.context.options.session?.cookieCache?.strategy || "compact";
	let data;
	if (strategy === "jwe") data = await symmetricEncodeJWT(sessionData, ctx.context.secretConfig, "better-auth-session", options.maxAge || 300);
	else if (strategy === "jwt") data = await signJWT(sessionData, ctx.context.secret, options.maxAge || 300);
	else data = base64Url.encode(JSON.stringify({
		session: sessionData,
		expiresAt: expiresAtDate,
		signature: await createHMAC("SHA-256", "base64urlnopad").sign(ctx.context.secret, JSON.stringify({
			...sessionData,
			expiresAt: expiresAtDate
		}))
	}), { padding: false });
	const sessionStore = createSessionStore(ctx.context.authCookies.sessionData.name, options, ctx);
	sessionStore.setCookies(sessionStore.chunk(data, options));
	if (ctx.context.options.account?.storeAccountCookie && !hasPendingSetCookie(ctx, ctx.context.authCookies.accountData.name)) {
		const accountData = await getAccountCookie(ctx);
		if (accountData) if (!shouldBindAccountCookieToSessionUser(ctx.context.options) || accountData.userId === session.user.id) await setAccountCookie(ctx, accountData);
		else {
			expireCookie(ctx, ctx.context.authCookies.accountData);
			const accountStore = createAccountStore(ctx.context.authCookies.accountData.name, ctx.context.authCookies.accountData.attributes, ctx);
			accountStore.setCookies(accountStore.clean());
		}
	}
}
async function setSessionCookie(ctx, session, dontRememberMe, overrides) {
	const dontRememberMeCookie = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
	dontRememberMe = dontRememberMe !== void 0 ? dontRememberMe : !!dontRememberMeCookie;
	const options = ctx.context.authCookies.sessionToken.attributes;
	const maxAge = dontRememberMe ? void 0 : ctx.context.sessionConfig.expiresIn;
	await ctx.setSignedCookie(ctx.context.authCookies.sessionToken.name, session.session.token, ctx.context.secret, {
		...options,
		maxAge,
		...overrides
	});
	if (dontRememberMe) await ctx.setSignedCookie(ctx.context.authCookies.dontRememberToken.name, "true", ctx.context.secret, ctx.context.authCookies.dontRememberToken.attributes);
	await setCookieCache(ctx, session, dontRememberMe);
	ctx.context.setNewSession(session);
}
/**
* Remove any prior `Set-Cookie` entries on the current response whose cookie
* name matches `cookieName` or any chunked variant (`${cookieName}.0`, etc.).
*
* Prevents a valid cookie value from leaking on the wire when the same cookie
* is set and then expired within a single request (e.g. `/sign-in/email`
* writes credential session cookies and the 2FA after-hook expires them).
* Browsers honor the expiring entry, but anything reading the raw response
* headers — proxy/LB logs, server-side SDK consumers, observability tools —
* sees the earlier valid value and could replay it (bypassing the 2FA gate
* when the cookie cache is enabled).
*
* Scrubs both the local middleware scope's `responseHeaders` and the outer
* endpoint scope's `ctx.context.responseHeaders`, because plugin after-hooks
* run in a fresh local scope while accumulated response headers live on the
* outer one. `scoped.context` is required by {@link GenericEndpointContext}
* but unit-test mocks pass a minimal object via `as any`, so we use optional
* chaining defensively. The `Set` collapses the case where both scopes
* reference the same `Headers`.
*/
function removeSetCookieEntries(ctx, cookieName) {
	const scoped = ctx;
	const targets = /* @__PURE__ */ new Set();
	if (scoped.responseHeaders) targets.add(scoped.responseHeaders);
	if (scoped.context?.responseHeaders) targets.add(scoped.context.responseHeaders);
	const exact = `${cookieName}=`;
	const chunk = `${cookieName}.`;
	for (const headers of targets) {
		const existing = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : splitSetCookieHeader(headers.get("set-cookie") || "");
		if (!existing.length) continue;
		const survivors = existing.filter((entry) => !entry.startsWith(exact) && !entry.startsWith(chunk));
		if (survivors.length === existing.length) continue;
		headers.delete("set-cookie");
		for (const entry of survivors) headers.append("set-cookie", entry);
	}
}
/**
* Whether the response already has a pending `Set-Cookie` for `cookieName`
* or a chunked variant.
*/
function hasPendingSetCookie(ctx, cookieName) {
	const scoped = ctx;
	const targets = /* @__PURE__ */ new Set();
	if (scoped.responseHeaders) targets.add(scoped.responseHeaders);
	if (scoped.context?.responseHeaders) targets.add(scoped.context.responseHeaders);
	const exact = `${cookieName}=`;
	const chunk = `${cookieName}.`;
	for (const headers of targets) if ((typeof headers.getSetCookie === "function" ? headers.getSetCookie() : splitSetCookieHeader(headers.get("set-cookie") || "")).some((entry) => entry.startsWith(exact) || entry.startsWith(chunk))) return true;
	return false;
}
/**
* Expires a cookie by setting `maxAge: 0` while preserving its attributes
*/
function expireCookie(ctx, cookie) {
	removeSetCookieEntries(ctx, cookie.name);
	ctx.setCookie(cookie.name, "", {
		...cookie.attributes,
		maxAge: 0
	});
}
function deleteSessionCookie(ctx, skipDontRememberMe) {
	expireCookie(ctx, ctx.context.authCookies.sessionToken);
	expireCookie(ctx, ctx.context.authCookies.sessionData);
	if (ctx.context.options.account?.storeAccountCookie) {
		expireCookie(ctx, ctx.context.authCookies.accountData);
		const accountStore = createAccountStore(ctx.context.authCookies.accountData.name, ctx.context.authCookies.accountData.attributes, ctx);
		const cleanCookies = accountStore.clean();
		accountStore.setCookies(cleanCookies);
	}
	if (ctx.context.oauthConfig.storeStateStrategy === "cookie") expireCookie(ctx, ctx.context.createAuthCookie("oauth_state"));
	const sessionStore = createSessionStore(ctx.context.authCookies.sessionData.name, ctx.context.authCookies.sessionData.attributes, ctx);
	const cleanCookies = sessionStore.clean();
	sessionStore.setCookies(cleanCookies);
	if (!skipDontRememberMe) expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/state.mjs
var stateDataSchema = z$1.looseObject({
	callbackURL: z$1.string(),
	codeVerifier: z$1.string(),
	errorURL: z$1.string().optional(),
	newUserURL: z$1.string().optional(),
	expiresAt: z$1.number(),
	oauthState: z$1.string().optional(),
	link: z$1.object({
		email: z$1.string(),
		userId: z$1.coerce.string()
	}).optional(),
	requestSignUp: z$1.boolean().optional()
});
new Set(Object.keys(stateDataSchema.shape));
var StateError = class extends BetterAuthError {
	code;
	details;
	/**
	* The per-flow `errorCallbackURL` recovered from the parsed state, when the
	* failure happened after the state was successfully parsed (for example a
	* nonce or state-cookie mismatch). It was origin-validated at sign-in, so
	* the callback can safely redirect there instead of the default error page.
	* Absent when the state could not be parsed at all.
	*/
	errorURL;
	constructor(message, options) {
		super(message, options);
		this.code = options.code;
		this.details = options.details;
		this.errorURL = options.errorURL;
	}
};
async function generateGenericState(c, stateData, settings) {
	const state = generateRandomString(32);
	if (c.context.oauthConfig.storeStateStrategy === "cookie") {
		const payload = {
			...stateData,
			oauthState: state
		};
		const encryptedData = await symmetricEncrypt({
			key: c.context.secretConfig,
			data: JSON.stringify(payload)
		});
		const stateCookie = c.context.createAuthCookie(settings?.cookieName ?? "oauth_state", { maxAge: 600 });
		c.setCookie(stateCookie.name, encryptedData, stateCookie.attributes);
		return {
			state,
			codeVerifier: stateData.codeVerifier
		};
	}
	const stateCookie = c.context.createAuthCookie(settings?.cookieName ?? "state", { maxAge: 300 });
	await c.setSignedCookie(stateCookie.name, state, c.context.secret, stateCookie.attributes);
	const expiresAt = /* @__PURE__ */ new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + 10);
	if (!await c.context.internalAdapter.createVerificationValue({
		value: JSON.stringify({
			...stateData,
			oauthState: state
		}),
		identifier: state,
		expiresAt
	})) throw new StateError("Unable to create verification. Make sure the database adapter is properly working and there is a verification table in the database", { code: "state_generation_error" });
	return {
		state,
		codeVerifier: stateData.codeVerifier
	};
}
async function parseGenericState(c, state, settings) {
	if (!state) throw new StateError("State not found in OAuth callback", { code: "state_not_found" });
	const storeStateStrategy = c.context.oauthConfig.storeStateStrategy;
	let parsedData;
	if (storeStateStrategy === "cookie") {
		const stateCookie = c.context.createAuthCookie(settings?.cookieName ?? "oauth_state");
		const encryptedData = c.getCookie(stateCookie.name);
		if (!encryptedData) throw new StateError("State mismatch: auth state cookie not found", {
			code: "state_mismatch",
			details: { state }
		});
		try {
			const decryptedData = await symmetricDecrypt({
				key: c.context.secretConfig,
				data: encryptedData
			});
			parsedData = stateDataSchema.parse(JSON.parse(decryptedData));
		} catch (error) {
			throw new StateError("State invalid: Failed to decrypt or parse auth state", {
				code: "state_invalid",
				details: { state },
				cause: error
			});
		}
		if (!parsedData.oauthState || parsedData.oauthState !== state) throw new StateError("State mismatch: OAuth state parameter does not match stored state", {
			code: "state_security_mismatch",
			details: { state },
			errorURL: parsedData.errorURL
		});
		expireCookie(c, stateCookie);
	} else {
		const data = await c.context.internalAdapter.findVerificationValue(state);
		if (!data) throw new StateError("State mismatch: verification not found", {
			code: "state_mismatch",
			details: { state }
		});
		parsedData = stateDataSchema.parse(JSON.parse(data.value));
		if (parsedData.oauthState !== void 0 && parsedData.oauthState !== state) throw new StateError("State mismatch: OAuth state parameter does not match stored state", {
			code: "state_security_mismatch",
			details: { state },
			errorURL: parsedData.errorURL
		});
		const stateCookie = c.context.createAuthCookie(settings?.cookieName ?? "state");
		const stateCookieValue = await c.getSignedCookie(stateCookie.name, c.context.secret);
		if (!(settings?.skipStateCookieCheck ?? c.context.oauthConfig.skipStateCookieCheck) && (!stateCookieValue || stateCookieValue !== state)) throw new StateError("State mismatch: State not persisted correctly", {
			code: "state_security_mismatch",
			details: { state },
			errorURL: parsedData.errorURL
		});
		expireCookie(c, stateCookie);
		await c.context.internalAdapter.deleteVerificationByIdentifier(state);
	}
	if (parsedData.expiresAt < Date.now()) throw new StateError("Invalid state: request expired", {
		code: "state_mismatch",
		details: { expiresAt: parsedData.expiresAt },
		errorURL: parsedData.errorURL
	});
	return parsedData;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/oauth2/errors.mjs
var HANDLING_DOCS_URL = "https://www.better-auth.com/docs/concepts/oauth#handling-providers-without-email";
/**
* Redirect the user to the OAuth error page with a machine-readable `error`
* code (and optional `error_description`).
*
* Every OAuth callback path routes its failures through this helper so the
* query parameter name, the `?`/`&` separator, and URL encoding are decided in
* one place. The error page reads the `error` query parameter, so callers must
* never hand-build the redirect with a different parameter name.
*/
function redirectOnError(ctx, errorURL, error, description) {
	const params = new URLSearchParams({ error });
	if (description) params.set("error_description", description);
	const sep = errorURL.includes("?") ? "&" : "?";
	throw ctx.redirect(`${errorURL}${sep}${params.toString()}`);
}
/**
* Build the logger message shown when an OAuth provider does not return an
* email address. Kept in one place so every rejection site points users at
* the same workaround docs.
*/
function missingEmailLogMessage(providerId, options) {
	return `${options?.source === "generic" ? `Generic OAuth provider "${providerId}"` : `Provider "${providerId}"`} did not return an email${options?.source === "id_token" ? " in the id token" : ""}. Either request the provider's email scope, or synthesize one via \`mapProfileToUser\`. See ${HANDLING_DOCS_URL}`;
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/context/endpoint-context.mjs
var ensureAsyncStorage$1 = async () => {
	const betterAuthGlobal = __getBetterAuthGlobal();
	if (!betterAuthGlobal.context.endpointContextAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		betterAuthGlobal.context.endpointContextAsyncStorage = new AsyncLocalStorage();
	}
	return betterAuthGlobal.context.endpointContextAsyncStorage;
};
async function getCurrentAuthContext() {
	const context = (await ensureAsyncStorage$1()).getStore();
	if (!context) throw new Error("No auth context found. Please make sure you are calling this function within a `runWithEndpointContext` callback.");
	return context;
}
async function runWithEndpointContext(context, fn) {
	return (await ensureAsyncStorage$1()).run(context, fn);
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/context/request-state.mjs
var ensureAsyncStorage = async () => {
	const betterAuthGlobal = __getBetterAuthGlobal();
	if (!betterAuthGlobal.context.requestStateAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		betterAuthGlobal.context.requestStateAsyncStorage = new AsyncLocalStorage();
	}
	return betterAuthGlobal.context.requestStateAsyncStorage;
};
async function hasRequestState() {
	return (await ensureAsyncStorage()).getStore() !== void 0;
}
async function getCurrentRequestState() {
	const store = (await ensureAsyncStorage()).getStore();
	if (!store) throw new Error("No request state found. Please make sure you are calling this function within a `runWithRequestState` callback.");
	return store;
}
async function runWithRequestState(store, fn) {
	return (await ensureAsyncStorage()).run(store, fn);
}
function defineRequestState(initFn) {
	const ref = Object.freeze({});
	return {
		get ref() {
			return ref;
		},
		async get() {
			const store = await getCurrentRequestState();
			if (!store.has(ref)) {
				const initialValue = await initFn();
				store.set(ref, initialValue);
				return initialValue;
			}
			return store.get(ref);
		},
		async set(value) {
			(await getCurrentRequestState()).set(ref, value);
		}
	};
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/state/oauth.mjs
var { get: getOAuthState, set: setOAuthState } = defineRequestState(() => null);
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/oauth2/state.mjs
async function generateState(c, link, additionalData) {
	const callbackURL = c.body?.callbackURL || c.context.options.baseURL;
	if (!callbackURL) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CALLBACK_URL_REQUIRED);
	const codeVerifier = generateRandomString(128);
	const stateData = {
		...additionalData ? additionalData : {},
		callbackURL,
		codeVerifier,
		errorURL: c.body?.errorCallbackURL,
		newUserURL: c.body?.newUserCallbackURL,
		link,
		expiresAt: Date.now() + 600 * 1e3,
		requestSignUp: c.body?.requestSignUp
	};
	await setOAuthState(stateData);
	try {
		return generateGenericState(c, stateData);
	} catch (error) {
		c.context.logger.error("Failed to create verification", error);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Unable to create verification",
			cause: error
		});
	}
}
async function parseState(c) {
	const state = c.query.state || c.body?.state;
	const errorURL = c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
	let parsedData;
	try {
		parsedData = await parseGenericState(c, state);
	} catch (error) {
		c.context.logger.error("Failed to parse state", error);
		let code = "internal_server_error";
		let redirectErrorURL = errorURL;
		if (error instanceof StateError) {
			code = error.code === "state_security_mismatch" ? "state_mismatch" : error.code;
			redirectErrorURL = error.errorURL ?? errorURL;
		}
		redirectOnError(c, redirectErrorURL, code);
	}
	if (!parsedData.errorURL) parsedData.errorURL = errorURL;
	if (parsedData) await setOAuthState(parsedData);
	return parsedData;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/utils/hide-metadata.mjs
var HIDE_METADATA = { scope: "server" };
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/utils/is-api-error.mjs
function isAPIError(error) {
	return error instanceof APIError$1 || error instanceof APIError || error?.name === "APIError";
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/api/index.mjs
/**
* Better-call's createEndpoint re-throws APIError without exposing the headers
* accumulated on ctx.responseHeaders (e.g. Set-Cookie from deleteSessionCookie
* before throw). Attach them to the error via kAPIErrorHeaderSymbol — matching
* better-call's createMiddleware contract so the outer pipeline can merge them
* into the response.
*/
function attachResponseHeadersToAPIError(responseHeaders, e) {
	if (!isAPIError(e) || !responseHeaders) return;
	Object.defineProperty(e, kAPIErrorHeaderSymbol, {
		enumerable: false,
		configurable: true,
		value: responseHeaders,
		writable: false
	});
}
var optionsMiddleware = createMiddleware(async () => {
	/**
	* This will be passed on the instance of
	* the context. Used to infer the type
	* here.
	*/
	return {};
});
var createAuthMiddleware = createMiddleware.create({ use: [optionsMiddleware, createMiddleware(async () => {
	return {};
})] });
var use = [optionsMiddleware];
function createAuthEndpoint(pathOrOptions, handlerOrOptions, handlerOrNever) {
	const path = typeof pathOrOptions === "string" ? pathOrOptions : void 0;
	const options = typeof handlerOrOptions === "object" ? handlerOrOptions : pathOrOptions;
	const handler = typeof handlerOrOptions === "function" ? handlerOrOptions : handlerOrNever;
	const wrapped = async (ctx) => {
		const runtimeCtx = ctx;
		try {
			return await runWithEndpointContext(ctx, () => handler(ctx));
		} catch (e) {
			attachResponseHeadersToAPIError(runtimeCtx.responseHeaders, e);
			throw e;
		}
	};
	if (path) return createEndpoint(path, {
		...options,
		use: [...options?.use || [], ...use]
	}, wrapped);
	return createEndpoint({
		...options,
		use: [...options?.use || [], ...use]
	}, wrapped);
}
/**
* Set `metadata.SERVER_ONLY` while preserving any existing metadata
* (`$Infer`, `openapi`, ...).
*/
function withServerOnly(options) {
	return {
		...options,
		metadata: {
			...options.metadata,
			SERVER_ONLY: true
		}
	};
}
/**
* Declare a **server-only** endpoint.
*
* The endpoint is callable through `auth.api.*` from trusted server code but is
* never registered on the HTTP router and never emitted into the OpenAPI
* schema. It takes no path because it has no URL to be reached at.
*
* Prefer this over the path-less `createAuthEndpoint({ ... }, handler)` form.
* Setting `metadata.SERVER_ONLY` makes the intent explicit at the call site and
* keeps the endpoint off the HTTP surface even if a path is later added by
* mistake: better-call's router skips an endpoint when its path is missing *or*
* when `SERVER_ONLY` is set, so the two together are defense in depth. Relying
* on path omission alone is invisible and one keystroke away from exposure.
*
* @example
* ```ts
* viewBackupCodes: createAuthEndpoint.serverOnly(
* 	{ method: "POST", body: schema },
* 	async (ctx) => { ... },
* )
* ```
*/
createAuthEndpoint.serverOnly = (options, handler) => createAuthEndpoint(withServerOnly(options), handler);
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/auth/trusted-origins.mjs
/**
* Matches the given url against an origin or origin pattern
* See "options.trustedOrigins" for details of supported patterns
*
* @param url The url to test
* @param pattern The origin pattern
* @param [settings] Specify supported pattern matching settings
* @returns {boolean} true if the URL matches the origin pattern, false otherwise.
*/
var matchesOriginPattern = (url, pattern, settings) => {
	if (url.startsWith("/")) {
		if (settings?.allowRelativePaths) return url.startsWith("/") && /^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/.test(url);
		return false;
	}
	if (pattern.includes("*") || pattern.includes("?")) {
		if (pattern.includes("://")) return wildcardMatch(pattern)(getOrigin(url) || url);
		const host = getHost(url);
		if (!host) return false;
		return wildcardMatch(pattern)(host);
	}
	const protocol = getProtocol(url);
	return protocol === "http:" || protocol === "https:" || !protocol ? pattern === getOrigin(url) : url.startsWith(pattern);
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/utils/deprecate.mjs
/**
* Wraps a function to log a deprecation warning at once.
*/
function deprecate(fn, message, logger) {
	let warned = false;
	return function(...args) {
		if (!warned) {
			(logger?.warn ?? console.warn)(`[Deprecation] ${message}`);
			warned = true;
		}
		return fn.apply(this, args);
	};
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/middlewares/origin-check.mjs
/**
* Checks if CSRF should be skipped for backward compatibility.
* Previously, disableOriginCheck also disabled CSRF checks.
* This maintains that behavior when disableCSRFCheck isn't explicitly set.
* Only triggers for skipOriginCheck === true, not for path arrays.
*/
function shouldSkipCSRFForBackwardCompat(ctx) {
	return ctx.context.skipOriginCheck === true && ctx.context.options.advanced?.disableCSRFCheck === void 0;
}
/**
* Checks if the origin check should be skipped for the current request.
* Handles both boolean (skip all) and array (skip specific paths) configurations.
*/
function shouldSkipOriginCheck(ctx) {
	const skipOriginCheck = ctx.context.skipOriginCheck;
	if (skipOriginCheck === true) return true;
	if (Array.isArray(skipOriginCheck) && ctx.request) try {
		const basePath = new URL(ctx.context.baseURL).pathname;
		const currentPath = normalizePathname(ctx.request.url, basePath);
		return skipOriginCheck.some((skipPath) => {
			const normalizedSkipPath = skipPath.replace(/\/+$/, "");
			return currentPath === normalizedSkipPath || currentPath.startsWith(`${normalizedSkipPath}/`);
		});
	} catch {}
	return false;
}
/**
* Logs deprecation warning for users relying on coupled behavior.
* Only logs if user explicitly set disableOriginCheck (not test environment default).
*/
var logBackwardCompatWarning = deprecate(function logBackwardCompatWarning() {}, "disableOriginCheck: true currently also disables CSRF checks. In a future version, disableOriginCheck will ONLY disable URL validation. To keep CSRF disabled, add disableCSRFCheck: true to your config.");
/**
* A middleware to validate callbackURL and origin against trustedOrigins.
* Also handles CSRF protection using Fetch Metadata for first-login scenarios.
*/
var originCheckMiddleware = createAuthMiddleware(async (ctx) => {
	if (ctx.request?.method === "GET" || ctx.request?.method === "OPTIONS" || ctx.request?.method === "HEAD" || !ctx.request) return;
	await validateOrigin(ctx);
	if (shouldSkipOriginCheck(ctx)) return;
	const { body, query } = ctx;
	const callbackURL = body?.callbackURL || query?.callbackURL;
	const redirectURL = body?.redirectTo;
	const errorCallbackURL = body?.errorCallbackURL;
	const newUserCallbackURL = body?.newUserCallbackURL;
	const validateURL = (url, label) => {
		if (!url) return;
		if (typeof url !== "string") throw APIError.fromStatus("BAD_REQUEST", { message: `Invalid ${label}: expected a string` });
		if (!ctx.context.isTrustedOrigin(url, { allowRelativePaths: label !== "origin" })) {
			ctx.context.logger.error(`Invalid ${label}: ${url}`);
			ctx.context.logger.info(`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`, `Current list of trustedOrigins: ${ctx.context.trustedOrigins}`);
			if (label === "origin") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);
			if (label === "callbackURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
			if (label === "redirectURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_REDIRECT_URL);
			if (label === "errorCallbackURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ERROR_CALLBACK_URL);
			if (label === "newUserCallbackURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_NEW_USER_CALLBACK_URL);
			throw APIError.fromStatus("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};
	callbackURL && validateURL(callbackURL, "callbackURL");
	redirectURL && validateURL(redirectURL, "redirectURL");
	errorCallbackURL && validateURL(errorCallbackURL, "errorCallbackURL");
	newUserCallbackURL && validateURL(newUserCallbackURL, "newUserCallbackURL");
});
var originCheck = (getValue) => createAuthMiddleware(async (ctx) => {
	if (!ctx.request) return;
	if (shouldSkipOriginCheck(ctx)) return;
	const callbackURL = getValue(ctx);
	const validateURL = (url, label) => {
		if (!url) return;
		if (!ctx.context.isTrustedOrigin(url, { allowRelativePaths: label !== "origin" })) {
			ctx.context.logger.error(`Invalid ${label}: ${url}`);
			ctx.context.logger.info(`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`, `Current list of trustedOrigins: ${ctx.context.trustedOrigins}`);
			if (label === "origin") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);
			if (label === "callbackURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
			if (label === "redirectURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_REDIRECT_URL);
			if (label === "errorCallbackURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ERROR_CALLBACK_URL);
			if (label === "newUserCallbackURL") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_NEW_USER_CALLBACK_URL);
			throw APIError.fromStatus("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};
	const callbacks = Array.isArray(callbackURL) ? callbackURL : [callbackURL];
	for (const url of callbacks) validateURL(url, "callbackURL");
});
/**
* Validates origin header against trusted origins.
* @param ctx - The endpoint context
* @param forceValidate - If true, always validate origin regardless of cookies/skip flags
*/
async function validateOrigin(ctx, forceValidate = false) {
	const headers = ctx.request?.headers;
	if (!headers || !ctx.request) return;
	const originHeader = headers.get("origin") || headers.get("referer") || "";
	const useCookies = headers.has("cookie");
	if (ctx.context.skipCSRFCheck) return;
	if (shouldSkipCSRFForBackwardCompat(ctx)) {
		ctx.context.options.advanced?.disableOriginCheck === true && logBackwardCompatWarning();
		return;
	}
	if (shouldSkipOriginCheck(ctx)) return;
	if (!(forceValidate || useCookies)) return;
	if (!originHeader || originHeader === "null") throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.MISSING_OR_NULL_ORIGIN);
	const trustedOrigins = Array.isArray(ctx.context.options.trustedOrigins) ? ctx.context.trustedOrigins : [...ctx.context.trustedOrigins, ...(await ctx.context.options.trustedOrigins?.(ctx.request))?.filter((v) => Boolean(v)) || []];
	if (!trustedOrigins.some((origin) => matchesOriginPattern(originHeader, origin))) {
		ctx.context.logger.error(`Invalid origin: ${originHeader}`);
		ctx.context.logger.info(`If it's a valid URL, please add ${originHeader} to trustedOrigins in your auth config\n`, `Current list of trustedOrigins: ${trustedOrigins}`);
		throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);
	}
}
/**
* Middleware for CSRF protection using Fetch Metadata headers.
* This prevents cross-site navigation login attacks while supporting progressive enhancement.
*/
var formCsrfMiddleware = createAuthMiddleware(async (ctx) => {
	if (!ctx.request) return;
	await validateFormCsrf(ctx);
});
/**
* Validates CSRF protection for first-login scenarios using Fetch Metadata headers.
* This prevents cross-site form submission attacks while supporting progressive enhancement.
*/
async function validateFormCsrf(ctx) {
	const req = ctx.request;
	if (!req) return;
	if (ctx.context.skipCSRFCheck) return;
	if (shouldSkipCSRFForBackwardCompat(ctx)) return;
	const headers = req.headers;
	if (headers.has("cookie")) return await validateOrigin(ctx);
	const site = headers.get("Sec-Fetch-Site");
	const mode = headers.get("Sec-Fetch-Mode");
	const dest = headers.get("Sec-Fetch-Dest");
	if (Boolean(site && site.trim() || mode && mode.trim() || dest && dest.trim())) {
		if (site === "cross-site" && mode === "navigate") {
			ctx.context.logger.error("Blocked cross-site navigation login attempt (CSRF protection)", {
				secFetchSite: site,
				secFetchMode: mode,
				secFetchDest: dest
			});
			throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED);
		}
		return await validateOrigin(ctx, true);
	}
	if (headers.get("origin") || headers.get("referer")) return await validateOrigin(ctx, true);
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/utils/ip.mjs
/**
* Checks if an IP is valid IPv4 or IPv6
*/
function isValidIP(ip) {
	return z$1.ipv4().safeParse(ip).success || z$1.ipv6().safeParse(ip).success;
}
/**
* Checks if an IP is IPv6
*/
function isIPv6(ip) {
	return z$1.ipv6().safeParse(ip).success;
}
/**
* Converts IPv4-mapped IPv6 address to IPv4
* e.g., "::ffff:192.0.2.1" -> "192.0.2.1"
*/
function extractIPv4FromMapped(ipv6) {
	const lower = ipv6.toLowerCase();
	if (lower.startsWith("::ffff:")) {
		const ipv4Part = lower.substring(7);
		if (z$1.ipv4().safeParse(ipv4Part).success) return ipv4Part;
	}
	const parts = ipv6.split(":");
	if (parts.length === 7 && parts[5]?.toLowerCase() === "ffff") {
		const ipv4Part = parts[6];
		if (ipv4Part && z$1.ipv4().safeParse(ipv4Part).success) return ipv4Part;
	}
	if (lower.includes("::ffff:") || lower.includes(":ffff:")) {
		const groups = expandIPv6(ipv6);
		if (groups.length === 8 && groups[0] === "0000" && groups[1] === "0000" && groups[2] === "0000" && groups[3] === "0000" && groups[4] === "0000" && groups[5] === "ffff" && groups[6] && groups[7]) return `${Number.parseInt(groups[6].substring(0, 2), 16)}.${Number.parseInt(groups[6].substring(2, 4), 16)}.${Number.parseInt(groups[7].substring(0, 2), 16)}.${Number.parseInt(groups[7].substring(2, 4), 16)}`;
	}
	return null;
}
/**
* Expands a compressed IPv6 address to full form
* e.g., "2001:db8::1" -> ["2001", "0db8", "0000", "0000", "0000", "0000", "0000", "0001"]
*/
function expandIPv6(ipv6) {
	if (ipv6.includes("::")) {
		const sides = ipv6.split("::");
		const left = sides[0] ? sides[0].split(":") : [];
		const right = sides[1] ? sides[1].split(":") : [];
		const missingGroups = 8 - left.length - right.length;
		const zeros = Array(missingGroups).fill("0000");
		const paddedLeft = left.map((g) => g.padStart(4, "0"));
		const paddedRight = right.map((g) => g.padStart(4, "0"));
		return [
			...paddedLeft,
			...zeros,
			...paddedRight
		];
	}
	return ipv6.split(":").map((g) => g.padStart(4, "0"));
}
/**
* Normalizes an IPv6 address to canonical form
* e.g., "2001:DB8::1" -> "2001:0db8:0000:0000:0000:0000:0000:0001"
*/
function normalizeIPv6(ipv6, subnetPrefix) {
	const groups = expandIPv6(ipv6);
	if (subnetPrefix !== void 0 && subnetPrefix < 128) {
		let bitsRemaining = Math.max(0, Math.floor(subnetPrefix));
		return groups.map((group) => {
			if (bitsRemaining <= 0) return "0000";
			if (bitsRemaining >= 16) {
				bitsRemaining -= 16;
				return group;
			}
			const masked = Number.parseInt(group, 16) & (65535 << 16 - bitsRemaining & 65535);
			bitsRemaining = 0;
			return masked.toString(16).padStart(4, "0");
		}).join(":").toLowerCase();
	}
	return groups.join(":").toLowerCase();
}
/**
* Normalizes an IP address (IPv4 or IPv6) for consistent rate limiting.
*
* @param ip - The IP address to normalize
* @param options - Normalization options
* @returns Normalized IP address
*
* @example
* normalizeIP("2001:DB8::1")
* // -> "2001:0db8:0000:0000:0000:0000:0000:0000"
*
* @example
* normalizeIP("::ffff:192.0.2.1")
* // -> "192.0.2.1" (converted to IPv4)
*
* @example
* normalizeIP("2001:db8::1", { ipv6Subnet: 64 })
* // -> "2001:0db8:0000:0000:0000:0000:0000:0000" (subnet /64)
*/
function normalizeIP(ip, options = {}) {
	if (z$1.ipv4().safeParse(ip).success) return ip.toLowerCase();
	if (!isIPv6(ip)) return ip.toLowerCase();
	const ipv4 = extractIPv4FromMapped(ip);
	if (ipv4) return ipv4.toLowerCase();
	return normalizeIPv6(ip, options.ipv6Subnet ?? 64);
}
/**
* Raw bytes of an IP for CIDR comparison. Returns `null` for an invalid IP.
*/
function ipToBytes(ip) {
	if (z$1.ipv4().safeParse(ip).success) return Uint8Array.from(ip.split(".").map((octet) => Number(octet)));
	if (!isIPv6(ip)) return null;
	const mapped = extractIPv4FromMapped(ip);
	if (mapped) return Uint8Array.from(mapped.split(".").map((octet) => Number(octet)));
	const groups = expandIPv6(ip);
	const bytes = /* @__PURE__ */ new Uint8Array(16);
	for (let i = 0; i < 8; i++) {
		const group = Number.parseInt(groups[i] ?? "0", 16);
		bytes[i * 2] = group >> 8 & 255;
		bytes[i * 2 + 1] = group & 255;
	}
	return bytes;
}
var CIDR_PREFIX_PATTERN = /^\d+$/;
/**
* Parses an IP or `IP/prefix` string into network bytes and a prefix length.
* The prefix must be digits only and within the address family. `null` if the
* value is not a valid IP or CIDR range, which keeps a malformed entry from
* silently behaving like a non-match.
*/
function parseCIDR(value) {
	const slash = value.lastIndexOf("/");
	const bytes = ipToBytes(slash === -1 ? value : value.slice(0, slash));
	if (!bytes) return null;
	const maxBits = bytes.length * 8;
	if (slash === -1) return {
		bytes,
		prefix: maxBits
	};
	const prefixPart = value.slice(slash + 1);
	if (!CIDR_PREFIX_PATTERN.test(prefixPart)) return null;
	const prefix = Number(prefixPart);
	return prefix <= maxBits ? {
		bytes,
		prefix
	} : null;
}
/**
* Whether `ipBytes` falls inside an already-parsed CIDR network.
*/
function matchesCIDR(ipBytes, net) {
	if (ipBytes.length !== net.bytes.length) return false;
	let bitsRemaining = net.prefix;
	for (let i = 0; i < ipBytes.length && bitsRemaining > 0; i++) {
		const take = bitsRemaining >= 8 ? 8 : bitsRemaining;
		const mask = take === 8 ? 255 : 255 << 8 - take & 255;
		if (((ipBytes[i] ?? 0) & mask) !== ((net.bytes[i] ?? 0) & mask)) return false;
		bitsRemaining -= 8;
	}
	return true;
}
/**
* Trusted-proxy entries that are not a valid IP address or CIDR range.
*/
function findInvalidTrustedProxies(entries) {
	return entries.filter((entry) => parseCIDR(entry) === null);
}
/**
* Resolves the client IP from a forwarded header. The leftmost token is spoofable,
* so with `trustedProxies` the chain is stripped from the right to the first
* untrusted hop. Otherwise only a single-value header is trusted. Returns `null`
* when no trustworthy client IP can be resolved.
*/
function getIPFromHeader(value, options = {}) {
	const forwardedIps = value.split(",").map((ip) => ip.trim()).filter(Boolean);
	if (forwardedIps.length === 0) return null;
	const trustedProxies = (options.trustedProxies ?? []).map(parseCIDR).filter((proxy) => {
		return proxy !== null;
	});
	if (trustedProxies.length > 0) {
		for (let i = forwardedIps.length - 1; i >= 0; i--) {
			const ip = forwardedIps[i];
			const ipBytes = ip ? ipToBytes(ip) : null;
			if (!ip || !ipBytes) return null;
			if (trustedProxies.some((proxy) => matchesCIDR(ipBytes, proxy))) continue;
			return normalizeIP(ip, { ipv6Subnet: options.ipv6Subnet });
		}
		return null;
	}
	if (forwardedIps.length !== 1) return null;
	const selectedIp = forwardedIps[0];
	if (!selectedIp || !isValidIP(selectedIp)) return null;
	return normalizeIP(selectedIp, { ipv6Subnet: options.ipv6Subnet });
}
var LOCALHOST_IP = "127.0.0.1";
var DEFAULT_IP_HEADERS = ["x-forwarded-for"];
/**
* Resolves the client IP for a request from the configured IP headers.
* Honors `disableIpTracking`, walks `ipAddressHeaders` in order (default
* `x-forwarded-for`), and falls back to localhost in development and test.
* Returns `null` when tracking is disabled or no trustworthy IP can be resolved.
*/
function getIp(req, options) {
	if (options.advanced?.ipAddress?.disableIpTracking) return null;
	const headers = "headers" in req ? req.headers : req;
	const ipHeaders = options.advanced?.ipAddress?.ipAddressHeaders || DEFAULT_IP_HEADERS;
	for (const key of ipHeaders) {
		const value = "get" in headers ? headers.get(key) : headers[key];
		if (typeof value === "string") {
			const ip = getIPFromHeader(value, {
				ipv6Subnet: options.advanced?.ipAddress?.ipv6Subnet,
				trustedProxies: options.advanced?.ipAddress?.trustedProxies
			});
			if (ip) return ip;
		}
	}
	if (isTest() || isDevelopment()) return LOCALHOST_IP;
	return null;
}
/**
* Creates a rate limit key from IP and path
* Uses a separator to prevent collision attacks
*
* @param ip - The IP address (should be normalized)
* @param path - The request path
* @returns Rate limit key
*/
function createRateLimitKey(ip, path) {
	return `${ip}|${path}`;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/rate-limiter/index.mjs
var memory = /* @__PURE__ */ new Map();
var MEMORY_STORE_MAX_ENTRIES = 1e5;
function pruneMemoryStore() {
	const now = Date.now();
	for (const [key, entry] of memory) if (now >= entry.expiresAt) memory.delete(key);
	if (memory.size <= MEMORY_STORE_MAX_ENTRIES) return;
	const overflow = memory.size - MEMORY_STORE_MAX_ENTRIES;
	let removed = 0;
	for (const key of memory.keys()) {
		memory.delete(key);
		if (++removed >= overflow) break;
	}
}
/**
* Decide an atomic rate-limit step against an in-memory `RateLimit` snapshot
* for the rolling `window` (seconds) and `max`. Shared by the memory backend
* (read-decide-write is atomic under single-threaded JS) and as the fallback
* for storages lacking an atomic primitive.
*/
function decideConsume(data, rule, now) {
	const windowInMs = rule.window * 1e3;
	if (!data) return {
		next: {
			key: "",
			count: 1,
			lastRequest: now
		},
		update: false,
		allowed: true,
		retryAfter: null
	};
	if (now - data.lastRequest > windowInMs) return {
		next: {
			...data,
			count: 1,
			lastRequest: now
		},
		update: true,
		allowed: true,
		retryAfter: null
	};
	if (data.count >= rule.max) return {
		next: data,
		update: true,
		allowed: false,
		retryAfter: getRetryAfter(data.lastRequest, rule.window)
	};
	return {
		next: {
			...data,
			count: data.count + 1,
			lastRequest: now
		},
		update: true,
		allowed: true,
		retryAfter: null
	};
}
function rateLimitResponse(retryAfter) {
	return new Response(JSON.stringify({ message: "Too many requests. Please try again later." }), {
		status: 429,
		statusText: "Too Many Requests",
		headers: { "X-Retry-After": retryAfter.toString() }
	});
}
function getRetryAfter(lastRequest, window) {
	const now = Date.now();
	const windowInMs = window * 1e3;
	return Math.ceil((lastRequest + windowInMs - now) / 1e3);
}
function createDatabaseStorageWrapper(ctx) {
	const model = "rateLimit";
	const db = ctx.adapter;
	const readRow = async (key) => {
		const data = (await db.findMany({
			model,
			where: [{
				field: "key",
				value: key
			}]
		}))[0];
		if (typeof data?.lastRequest === "bigint") data.lastRequest = Number(data.lastRequest);
		return data;
	};
	const consume = async (key, rule) => {
		const windowInMs = rule.window * 1e3;
		const data = await readRow(key);
		const now = Date.now();
		if (!data) try {
			await db.create({
				model,
				data: {
					key,
					count: 1,
					lastRequest: now
				}
			});
			return {
				allowed: true,
				retryAfter: null
			};
		} catch (error) {
			if (!await readRow(key)) throw error;
			return consume(key, rule);
		}
		if (now - data.lastRequest > windowInMs) {
			if (await db.incrementOne({
				model,
				where: [{
					field: "key",
					value: key
				}, {
					field: "lastRequest",
					operator: "lte",
					value: data.lastRequest
				}],
				increment: {},
				set: {
					count: 1,
					lastRequest: now
				}
			})) {
				deleteExpiredRows(now);
				return {
					allowed: true,
					retryAfter: null
				};
			}
			return consume(key, rule);
		}
		const windowStart = now - windowInMs;
		if (await db.incrementOne({
			model,
			where: [
				{
					field: "key",
					value: key
				},
				{
					field: "lastRequest",
					operator: "gt",
					value: windowStart
				},
				{
					field: "count",
					operator: "lt",
					value: rule.max
				}
			],
			increment: { count: 1 },
			set: { lastRequest: now }
		})) return {
			allowed: true,
			retryAfter: null
		};
		const fresh = await readRow(key);
		if (!fresh) return consume(key, rule);
		if (now - fresh.lastRequest > windowInMs) return consume(key, rule);
		return {
			allowed: false,
			retryAfter: getRetryAfter(fresh.lastRequest, rule.window)
		};
	};
	const deleteExpiredRows = (now) => {
		const cutoff = now - Math.max(ctx.rateLimit.window, ...getDefaultSpecialRules().map((r) => r.window)) * 1e3;
		ctx.runInBackground(db.deleteMany({
			model,
			where: [{
				field: "lastRequest",
				operator: "lt",
				value: cutoff
			}]
		}).then(() => void 0).catch((e) => ctx.logger.error("Error pruning rate limit rows", e)));
	};
	return {
		get: readRow,
		set: async (key, value, _update) => {
			try {
				if (_update) await db.updateMany({
					model,
					where: [{
						field: "key",
						value: key
					}],
					update: {
						count: value.count,
						lastRequest: value.lastRequest
					}
				});
				else await db.create({
					model,
					data: {
						key,
						count: value.count,
						lastRequest: value.lastRequest
					}
				});
			} catch (e) {
				ctx.logger.error("Error setting rate limit", e);
			}
		},
		consume
	};
}
function getRateLimitStorage(ctx, rateLimitSettings) {
	if (ctx.options.rateLimit?.customStorage) return ctx.options.rateLimit.customStorage;
	const storage = ctx.rateLimit.storage;
	if (storage === "secondary-storage") {
		const ttlFor = (window) => window ?? ctx.options.rateLimit?.window ?? 10;
		return {
			get: async (key) => {
				const data = await ctx.options.secondaryStorage?.get(key);
				return data ? safeJSONParse(data) : null;
			},
			set: async (key, value, _update) => {
				await ctx.options.secondaryStorage?.set?.(key, JSON.stringify(value), ttlFor(rateLimitSettings.window));
			},
			consume: ctx.options.secondaryStorage?.increment ? async (key, rule) => {
				if (await ctx.options.secondaryStorage.increment(key, ttlFor(rule.window)) <= rule.max) return {
					allowed: true,
					retryAfter: null
				};
				return {
					allowed: false,
					retryAfter: rule.window
				};
			} : void 0
		};
	} else if (storage === "memory") {
		const ttlFor = (window) => window ?? ctx.options.rateLimit?.window ?? 10;
		return {
			async get(key) {
				const entry = memory.get(key);
				if (!entry) return null;
				if (Date.now() >= entry.expiresAt) {
					memory.delete(key);
					return null;
				}
				return entry.data;
			},
			async set(key, value, _update) {
				const expiresAt = Date.now() + ttlFor(rateLimitSettings.window) * 1e3;
				memory.set(key, {
					data: value,
					expiresAt
				});
			},
			async consume(key, rule) {
				pruneMemoryStore();
				const now = Date.now();
				const entry = memory.get(key);
				const decision = decideConsume(entry && now < entry.expiresAt ? entry.data : void 0, rule, now);
				if (decision.allowed) memory.set(key, {
					data: {
						...decision.next,
						key
					},
					expiresAt: now + ttlFor(rule.window) * 1e3
				});
				return {
					allowed: decision.allowed,
					retryAfter: decision.retryAfter
				};
			}
		};
	}
	return createDatabaseStorageWrapper(ctx);
}
var ipWarningLogged = false;
var NO_TRUSTED_IP_KEY = "no-trusted-ip";
async function resolveRateLimitConfig(req, ctx) {
	const basePath = new URL(ctx.baseURL).pathname;
	const path = normalizePathname(req.url, basePath);
	let currentWindow = ctx.rateLimit.window;
	let currentMax = ctx.rateLimit.max;
	const ip = getIp(req, ctx.options);
	if (!ip && ctx.options.advanced?.ipAddress?.disableIpTracking) return null;
	if (!ip && !ipWarningLogged) {
		ctx.logger.warn("Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket. Ensure your runtime forwards a trusted client IP header, then set `advanced.ipAddress.ipAddressHeaders` or `advanced.ipAddress.trustedProxies` so the address can be resolved.");
		ipWarningLogged = true;
	}
	const key = createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path);
	const specialRule = getDefaultSpecialRules().find((rule) => rule.pathMatcher(path));
	if (specialRule) {
		currentWindow = specialRule.window;
		currentMax = specialRule.max;
	}
	for (const plugin of ctx.options.plugins || []) if (plugin.rateLimit) {
		const matchedRule = plugin.rateLimit.find((rule) => rule.pathMatcher(path));
		if (matchedRule) {
			currentWindow = matchedRule.window;
			currentMax = matchedRule.max;
			break;
		}
	}
	if (ctx.rateLimit.customRules) {
		const _path = Object.keys(ctx.rateLimit.customRules).find((p) => {
			if (p.includes("*")) return wildcardMatch(p)(path);
			return p === path;
		});
		if (_path) {
			const customRule = ctx.rateLimit.customRules[_path];
			const resolved = typeof customRule === "function" ? await customRule(req, {
				window: currentWindow,
				max: currentMax
			}) : customRule;
			if (resolved) {
				currentWindow = resolved.window;
				currentMax = resolved.max;
			}
			if (resolved === false) return null;
		}
	}
	return {
		key,
		currentWindow,
		currentMax
	};
}
var legacyFallbackWarningLogged = false;
/**
* Decides the rate limit for the request in a single atomic step. The whole
* check-and-increment happens here in the request phase; there is no separate
* response-phase write-back, so concurrent requests cannot all pass a stale
* read before any increment lands.
*/
async function onRequestRateLimit(req, ctx) {
	if (!ctx.rateLimit.enabled) return;
	const config = await resolveRateLimitConfig(req, ctx);
	if (!config) return;
	const { key, currentWindow, currentMax } = config;
	const storage = getRateLimitStorage(ctx, { window: currentWindow });
	const rule = {
		window: currentWindow,
		max: currentMax
	};
	if (storage.consume) {
		const { allowed, retryAfter } = await storage.consume(key, rule);
		if (!allowed) return rateLimitResponse(retryAfter ?? currentWindow);
		return;
	}
	return legacyConsume(ctx, storage, key, rule);
}
/**
* Non-atomic check-then-increment for storages that do not implement `consume`
* (custom storages, or secondary storages without `increment`). Under
* concurrency this is best-effort: simultaneous requests can each pass the
* check before either write lands.
*
* FIXME(rate-limit-consume-required): remove on `next` once `consume` is the
* sole required member of the storage contract.
*/
async function legacyConsume(ctx, storage, key, rule) {
	if (!legacyFallbackWarningLogged) {
		ctx.logger.warn("Rate limiting is best-effort: the configured storage has no atomic `consume`, so concurrent requests may bypass the limit. Provide a storage that implements `consume` for strict enforcement.");
		legacyFallbackWarningLogged = true;
	}
	const decision = decideConsume(await storage.get(key), rule, Date.now());
	if (!decision.allowed) return rateLimitResponse(decision.retryAfter ?? rule.window);
	await storage.set(key, {
		...decision.next,
		key
	}, decision.update);
}
function getDefaultSpecialRules() {
	return [{
		pathMatcher(path) {
			return path.startsWith("/sign-in") || path.startsWith("/sign-up") || path.startsWith("/change-password") || path.startsWith("/change-email");
		},
		window: 10,
		max: 3
	}, {
		pathMatcher(path) {
			return path === "/request-password-reset" || path === "/send-verification-email" || path.startsWith("/forget-password") || path === "/email-otp/send-verification-otp" || path === "/email-otp/request-password-reset";
		},
		window: 60,
		max: 3
	}];
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/state/should-session-refresh.mjs
/**
* State for skipping session refresh
*
* In some cases, such as when using server-side rendering (SSR) or when dealing with
* certain types of requests, it may be necessary to skip session refresh to prevent
* potential inconsistencies between the session data in the database and the session
* data stored in cookies.
*/
var { get: getShouldSkipSessionRefresh, set: setShouldSkipSessionRefresh } = defineRequestState(() => false);
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/session.mjs
var getSession = () => createAuthEndpoint("/get-session", {
	method: ["GET", "POST"],
	operationId: "getSession",
	query: getSessionQuerySchema,
	requireHeaders: true,
	metadata: { openapi: {
		operationId: "getSession",
		description: "Get the current session",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: ["object", "null"],
				properties: {
					session: { $ref: "#/components/schemas/Session" },
					user: { $ref: "#/components/schemas/User" }
				},
				required: ["session", "user"]
			} } }
		} }
	} }
}, async (ctx) => {
	const deferSessionRefresh = ctx.context.options.session?.deferSessionRefresh;
	const isPostRequest = ctx.method === "POST";
	if (isPostRequest && !deferSessionRefresh) throw APIError.from("METHOD_NOT_ALLOWED", BASE_ERROR_CODES.METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED);
	try {
		const sessionCookieToken = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
		if (!sessionCookieToken) return null;
		const sessionDataCookie = getChunkedCookie(ctx, ctx.context.authCookies.sessionData.name);
		let sessionDataPayload = null;
		if (sessionDataCookie) {
			const strategy = ctx.context.options.session?.cookieCache?.strategy || "compact";
			if (strategy === "jwe") {
				const payload = await symmetricDecodeJWT(sessionDataCookie, ctx.context.secretConfig, "better-auth-session");
				if (payload && payload.session && payload.user) sessionDataPayload = {
					session: {
						session: payload.session,
						user: payload.user,
						updatedAt: payload.updatedAt,
						version: payload.version
					},
					expiresAt: payload.exp ? payload.exp * 1e3 : Date.now()
				};
				else expireCookie(ctx, ctx.context.authCookies.sessionData);
			} else if (strategy === "jwt") {
				const payload = await verifyJWT(sessionDataCookie, ctx.context.secret);
				if (payload && payload.session && payload.user) sessionDataPayload = {
					session: {
						session: payload.session,
						user: payload.user,
						updatedAt: payload.updatedAt,
						version: payload.version
					},
					expiresAt: payload.exp ? payload.exp * 1e3 : Date.now()
				};
				else expireCookie(ctx, ctx.context.authCookies.sessionData);
			} else {
				const parsed = safeJSONParse(binary.decode(base64Url.decode(sessionDataCookie)));
				if (parsed) if (await createHMAC("SHA-256", "base64urlnopad").verify(ctx.context.secret, JSON.stringify({
					...parsed.session,
					expiresAt: parsed.expiresAt
				}), parsed.signature)) sessionDataPayload = parsed;
				else expireCookie(ctx, ctx.context.authCookies.sessionData);
			}
		}
		const dontRememberMe = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
		/**
		* If session data is present in the cookie, check if it should be used or refreshed
		*/
		if (sessionDataPayload?.session && ctx.context.options.session?.cookieCache?.enabled && !ctx.query?.disableCookieCache) {
			const session = sessionDataPayload.session;
			const versionConfig = ctx.context.options.session?.cookieCache?.version;
			let expectedVersion = "1";
			if (versionConfig) {
				if (typeof versionConfig === "string") expectedVersion = versionConfig;
				else if (typeof versionConfig === "function") {
					const result = versionConfig(session.session, session.user);
					expectedVersion = result instanceof Promise ? await result : result;
				}
			}
			if ((session.version || "1") !== expectedVersion) expireCookie(ctx, ctx.context.authCookies.sessionData);
			else {
				const cachedSessionExpiresAt = new Date(session.session.expiresAt);
				if (sessionDataPayload.expiresAt < Date.now() || cachedSessionExpiresAt < /* @__PURE__ */ new Date()) expireCookie(ctx, ctx.context.authCookies.sessionData);
				else {
					const cookieRefreshCache = ctx.context.sessionConfig.cookieRefreshCache;
					if (cookieRefreshCache === false) {
						ctx.context.session = session;
						const parsedSession = parseSessionOutput(ctx.context.options, {
							...session.session,
							expiresAt: new Date(session.session.expiresAt),
							createdAt: new Date(session.session.createdAt),
							updatedAt: new Date(session.session.updatedAt)
						});
						const parsedUser = parseUserOutput(ctx.context.options, {
							...session.user,
							createdAt: new Date(session.user.createdAt),
							updatedAt: new Date(session.user.updatedAt)
						});
						return ctx.json({
							session: parsedSession,
							user: parsedUser
						});
					}
					const timeUntilExpiry = sessionDataPayload.expiresAt - Date.now();
					const updateAge = cookieRefreshCache.updateAge * 1e3;
					const shouldSkipSessionRefresh = await getShouldSkipSessionRefresh();
					if (timeUntilExpiry < updateAge && !shouldSkipSessionRefresh) {
						const refreshedSession = {
							session: { ...session.session },
							user: session.user,
							updatedAt: Date.now()
						};
						await setCookieCache(ctx, refreshedSession, false);
						const sessionTokenOptions = ctx.context.authCookies.sessionToken.attributes;
						const sessionTokenMaxAge = dontRememberMe ? void 0 : ctx.context.sessionConfig.expiresIn;
						await ctx.setSignedCookie(ctx.context.authCookies.sessionToken.name, session.session.token, ctx.context.secret, {
							...sessionTokenOptions,
							maxAge: sessionTokenMaxAge
						});
						const parsedRefreshedSession = parseSessionOutput(ctx.context.options, {
							...refreshedSession.session,
							expiresAt: new Date(refreshedSession.session.expiresAt),
							createdAt: new Date(refreshedSession.session.createdAt),
							updatedAt: new Date(refreshedSession.session.updatedAt)
						});
						const parsedRefreshedUser = parseUserOutput(ctx.context.options, {
							...refreshedSession.user,
							createdAt: new Date(refreshedSession.user.createdAt),
							updatedAt: new Date(refreshedSession.user.updatedAt)
						});
						ctx.context.session = {
							session: parsedRefreshedSession,
							user: parsedRefreshedUser
						};
						return ctx.json({
							session: parsedRefreshedSession,
							user: parsedRefreshedUser
						});
					}
					const parsedSession = parseSessionOutput(ctx.context.options, {
						...session.session,
						expiresAt: new Date(session.session.expiresAt),
						createdAt: new Date(session.session.createdAt),
						updatedAt: new Date(session.session.updatedAt)
					});
					const parsedUser = parseUserOutput(ctx.context.options, {
						...session.user,
						createdAt: new Date(session.user.createdAt),
						updatedAt: new Date(session.user.updatedAt)
					});
					ctx.context.session = {
						session: parsedSession,
						user: parsedUser
					};
					return ctx.json({
						session: parsedSession,
						user: parsedUser
					});
				}
			}
		}
		const session = await ctx.context.internalAdapter.findSession(sessionCookieToken);
		ctx.context.session = session;
		if (!session || session.session.expiresAt < /* @__PURE__ */ new Date()) {
			deleteSessionCookie(ctx);
			if (session) {
				/**
				* if session expired clean up the session
				* Only delete on POST when deferSessionRefresh is enabled
				*/
				if (!deferSessionRefresh || isPostRequest) await ctx.context.internalAdapter.deleteSession(session.session.token);
			}
			return ctx.json(null);
		}
		/**
		* We don't need to update the session if the user doesn't want to be remembered
		* or if the session refresh is disabled
		*/
		if (dontRememberMe || ctx.query?.disableRefresh) {
			const parsedSession = parseSessionOutput(ctx.context.options, session.session);
			const parsedUser = parseUserOutput(ctx.context.options, session.user);
			return ctx.json({
				session: parsedSession,
				user: parsedUser
			});
		}
		const expiresIn = ctx.context.sessionConfig.expiresIn;
		const updateAge = ctx.context.sessionConfig.updateAge;
		const shouldBeUpdated = session.session.expiresAt.valueOf() - expiresIn * 1e3 + updateAge * 1e3 <= Date.now();
		const disableRefresh = ctx.query?.disableRefresh || ctx.context.options.session?.disableSessionRefresh;
		const shouldSkipSessionRefresh = await getShouldSkipSessionRefresh();
		const needsRefresh = shouldBeUpdated && !disableRefresh && !shouldSkipSessionRefresh;
		/**
		* When deferSessionRefresh is enabled and this is a GET request,
		* return the session without performing writes, but include needsRefresh flag
		*/
		if (deferSessionRefresh && !isPostRequest) {
			await setCookieCache(ctx, session, !!dontRememberMe);
			const parsedSession = parseSessionOutput(ctx.context.options, session.session);
			const parsedUser = parseUserOutput(ctx.context.options, session.user);
			return ctx.json({
				session: parsedSession,
				user: parsedUser,
				needsRefresh
			});
		}
		if (needsRefresh) {
			const updatedSession = await ctx.context.internalAdapter.updateSession(session.session.token, {
				expiresAt: getDate(ctx.context.sessionConfig.expiresIn, "sec"),
				updatedAt: /* @__PURE__ */ new Date()
			});
			if (!updatedSession) {
				/**
				* Handle case where session update fails (e.g., concurrent deletion)
				*/
				deleteSessionCookie(ctx);
				throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.FAILED_TO_GET_SESSION);
			}
			const maxAge = ctx.context.sessionConfig.expiresIn;
			await setSessionCookie(ctx, {
				session: updatedSession,
				user: session.user
			}, false, { maxAge });
			const parsedUpdatedSession = parseSessionOutput(ctx.context.options, updatedSession);
			const parsedUser = parseUserOutput(ctx.context.options, session.user);
			return ctx.json({
				session: parsedUpdatedSession,
				user: parsedUser
			});
		}
		await setCookieCache(ctx, session, !!dontRememberMe);
		const parsedSession = parseSessionOutput(ctx.context.options, session.session);
		const parsedUser = parseUserOutput(ctx.context.options, session.user);
		return ctx.json({
			session: parsedSession,
			user: parsedUser
		});
	} catch (error) {
		if (isAPIError(error)) throw error;
		ctx.context.logger.error("INTERNAL_SERVER_ERROR", error);
		throw APIError.from("INTERNAL_SERVER_ERROR", BASE_ERROR_CODES.FAILED_TO_GET_SESSION);
	}
});
/**
* Whether the deployment keeps sessions in a durable server-side store
* (a database or secondary storage) rather than only in the signed cookie.
*
* Sensitive operations use this to decide whether the cookie cache is merely an
* optimization that must be bypassed for an authoritative read (`true`), or the
* only place the session lives and therefore the authority itself (`false`, for
* stateless / DB-less deployments). Pass the result as `disableCookieCache` so a
* revoked-but-cached session cannot authorize a sensitive action.
*/
var isStateful = (ctx) => hasServerSessionStore(ctx.context.options);
var getSessionFromCtx = async (ctx, config) => {
	if (ctx.context.session) return ctx.context.session;
	const session = await getSession()({
		...ctx,
		method: "GET",
		asResponse: false,
		headers: ctx.headers,
		returnHeaders: true,
		returnStatus: false,
		query: {
			...config,
			...ctx.query,
			disableCookieCache: config?.disableCookieCache || ctx.query?.disableCookieCache,
			disableRefresh: config?.disableRefresh || ctx.query?.disableRefresh
		}
	}).catch(() => {
		return null;
	});
	if (!session) {
		ctx.context.session = null;
		return null;
	}
	if (session.headers) session.headers.forEach((value, key) => {
		if (!ctx.context.responseHeaders) ctx.context.responseHeaders = new Headers({ [key]: value });
		else if (key.toLowerCase() === "set-cookie") ctx.context.responseHeaders.append(key, value);
		else ctx.context.responseHeaders.set(key, value);
	});
	ctx.context.session = session.response;
	return session.response;
};
/**
* Reads the session from the source that can authorize sensitive work.
*
* Stateful deployments must re-read the server-side session store because an
* earlier hook may have populated `ctx.context.session` from cookie cache.
* Stateless deployments keep the signed cookie as the session record.
*/
var getAuthoritativeSessionFromCtx = async (ctx) => {
	if (!isStateful(ctx)) return getSessionFromCtx(ctx);
	ctx.context.session = null;
	return getSessionFromCtx(ctx, { disableCookieCache: true });
};
/**
* The middleware forces the endpoint to require a valid session.
*/
var sessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) throw APIError.from("UNAUTHORIZED", {
		message: "Unauthorized",
		code: "UNAUTHORIZED"
	});
	return { session };
});
/**
* This middleware forces the endpoint to require a valid authoritative session.
* This should be used for sensitive operations like password changes, account deletion, etc.
*/
var sensitiveSessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getAuthoritativeSessionFromCtx(ctx);
	if (!session?.session) throw APIError.from("UNAUTHORIZED", {
		message: "Unauthorized",
		code: "UNAUTHORIZED"
	});
	return { session };
});
createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session && (ctx.request || ctx.headers)) throw APIError.from("UNAUTHORIZED", {
		message: "Unauthorized",
		code: "UNAUTHORIZED"
	});
	return { session };
});
/**
* This middleware forces the endpoint to require a valid session,
* as well as making sure the session is fresh before proceeding.
*
* Session freshness check will be skipped if the session config's freshAge
* is set to 0
*/
var freshSessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) throw APIError.from("UNAUTHORIZED", {
		message: "Unauthorized",
		code: "UNAUTHORIZED"
	});
	if (ctx.context.sessionConfig.freshAge !== 0) {
		const createdAt = new Date(session.session.createdAt).getTime();
		const freshAge = ctx.context.sessionConfig.freshAge * 1e3;
		if (Date.now() - createdAt >= freshAge) throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.SESSION_NOT_FRESH);
	}
	return { session };
});
/**
* user active sessions list
*/
var listSessions = () => createAuthEndpoint("/list-sessions", {
	method: "GET",
	operationId: "listUserSessions",
	use: [freshSessionMiddleware],
	requireHeaders: true,
	metadata: { openapi: {
		operationId: "listUserSessions",
		description: "List all active sessions for the user",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "array",
				items: { $ref: "#/components/schemas/Session" }
			} } }
		} }
	} }
}, async (ctx) => {
	try {
		const activeSessions = (await ctx.context.internalAdapter.listSessions(ctx.context.session.user.id, { onlyActiveSessions: true })).filter((session) => {
			return session.expiresAt > /* @__PURE__ */ new Date();
		});
		return ctx.json(activeSessions.map((session) => parseSessionOutput(ctx.context.options, session)));
	} catch (e) {
		ctx.context.logger.error(e);
		throw ctx.error("INTERNAL_SERVER_ERROR");
	}
});
/**
* revoke a single session
*/
var revokeSession = createAuthEndpoint("/revoke-session", {
	method: "POST",
	body: z$1.object({ token: z$1.string().meta({ description: "The token to revoke" }) }),
	use: [sensitiveSessionMiddleware],
	requireHeaders: true,
	metadata: { openapi: {
		description: "Revoke a single session",
		requestBody: { content: { "application/json": { schema: {
			type: "object",
			properties: { token: {
				type: "string",
				description: "The token to revoke"
			} },
			required: ["token"]
		} } } },
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { status: {
					type: "boolean",
					description: "Indicates if the session was revoked successfully"
				} },
				required: ["status"]
			} } }
		} }
	} }
}, async (ctx) => {
	const token = ctx.body.token;
	if ((await ctx.context.internalAdapter.findSession(token))?.session.userId === ctx.context.session.user.id) try {
		await ctx.context.internalAdapter.deleteSession(token);
	} catch (error) {
		ctx.context.logger.error(error && typeof error === "object" && "name" in error ? error.name : "", error);
		throw APIError.from("INTERNAL_SERVER_ERROR", {
			message: "Internal Server Error",
			code: "INTERNAL_SERVER_ERROR"
		});
	}
	return ctx.json({ status: true });
});
/**
* revoke all user sessions
*/
var revokeSessions = createAuthEndpoint("/revoke-sessions", {
	method: "POST",
	use: [sensitiveSessionMiddleware],
	requireHeaders: true,
	metadata: { openapi: {
		description: "Revoke all sessions for the user",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { status: {
					type: "boolean",
					description: "Indicates if all sessions were revoked successfully"
				} },
				required: ["status"]
			} } }
		} }
	} }
}, async (ctx) => {
	try {
		await ctx.context.internalAdapter.deleteUserSessions(ctx.context.session.user.id);
	} catch (error) {
		ctx.context.logger.error(error && typeof error === "object" && "name" in error ? error.name : "", error);
		throw APIError.from("INTERNAL_SERVER_ERROR", {
			message: "Internal Server Error",
			code: "INTERNAL_SERVER_ERROR"
		});
	}
	return ctx.json({ status: true });
});
var revokeOtherSessions = createAuthEndpoint("/revoke-other-sessions", {
	method: "POST",
	requireHeaders: true,
	use: [sensitiveSessionMiddleware],
	metadata: { openapi: {
		description: "Revoke all other sessions for the user except the current one",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { status: {
					type: "boolean",
					description: "Indicates if all other sessions were revoked successfully"
				} },
				required: ["status"]
			} } }
		} }
	} }
}, async (ctx) => {
	const session = ctx.context.session;
	if (!session.user) throw APIError.from("UNAUTHORIZED", {
		message: "Unauthorized",
		code: "UNAUTHORIZED"
	});
	const otherSessions = (await ctx.context.internalAdapter.listSessions(session.user.id)).filter((session) => {
		return session.expiresAt > /* @__PURE__ */ new Date();
	}).filter((session) => session.token !== ctx.context.session.session.token);
	await Promise.all(otherSessions.map((session) => ctx.context.internalAdapter.deleteSession(session.token)));
	return ctx.json({ status: true });
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/verification-token-storage.mjs
var defaultKeyHasher = async (identifier) => {
	const hash = await createHash$1("SHA-256").digest(new TextEncoder().encode(identifier));
	return base64Url.encode(new Uint8Array(hash), { padding: false });
};
async function processIdentifier(identifier, option) {
	if (!option || option === "plain") return identifier;
	if (option === "hashed") return defaultKeyHasher(identifier);
	if (typeof option === "object" && "hash" in option) return option.hash(identifier);
	return identifier;
}
function getStorageOption(identifier, config) {
	if (!config) return;
	if (typeof config === "object" && "default" in config) {
		if (config.overrides) {
			for (const [prefix, option] of Object.entries(config.overrides)) if (identifier.startsWith(prefix)) return option;
		}
		return config.default;
	}
	return config;
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/instrumentation/attributes.mjs
/** Operation identifier (e.g. getSession, signUpWithEmailAndPassword). Uses endpoint operationId when set, otherwise the endpoint key. */
var ATTR_OPERATION_ID = "better_auth.operation_id";
/** Hook type (e.g. before, after, create.before). */
var ATTR_HOOK_TYPE = "better_auth.hook.type";
/** Execution context (e.g. user, plugin:id). */
var ATTR_CONTEXT = "better_auth.context";
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/with-hooks.mjs
function getWithHooks(adapter, ctx) {
	const hooksEntries = ctx.hooks;
	async function createWithHooks(data, model, customCreateFn) {
		const context = await getCurrentAuthContext().catch(() => null);
		let actualData = data;
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.create?.before;
			if (toRun) {
				const result = await withSpan(`db create.before ${model}`, {
					[ATTR_HOOK_TYPE]: "create.before",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(actualData, context));
				if (result === false) return null;
				if (typeof result === "object" && "data" in result) actualData = {
					...actualData,
					...result.data
				};
			}
		}
		let created = null;
		if (!customCreateFn || customCreateFn.executeMainFn) created = await (await getCurrentAdapter(adapter)).create({
			model,
			data: actualData,
			forceAllowId: true
		});
		if (customCreateFn?.fn) created = await customCreateFn.fn(created ?? actualData);
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.create?.after;
			if (toRun) await queueAfterTransactionHook(async () => {
				await withSpan(`db create.after ${model}`, {
					[ATTR_HOOK_TYPE]: "create.after",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(created, context));
			});
		}
		return created;
	}
	async function updateWithHooks(data, where, model, customUpdateFn) {
		const context = await getCurrentAuthContext().catch(() => null);
		let actualData = data;
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.before;
			if (toRun) {
				const result = await withSpan(`db update.before ${model}`, {
					[ATTR_HOOK_TYPE]: "update.before",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(data, context));
				if (result === false) return null;
				if (typeof result === "object" && "data" in result) actualData = {
					...actualData,
					...result.data
				};
			}
		}
		const customUpdated = customUpdateFn ? await customUpdateFn.fn(actualData) : null;
		const updated = !customUpdateFn || customUpdateFn.executeMainFn ? await (await getCurrentAdapter(adapter)).update({
			model,
			update: actualData,
			where
		}) : customUpdated;
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.after;
			if (toRun) await queueAfterTransactionHook(async () => {
				await withSpan(`db update.after ${model}`, {
					[ATTR_HOOK_TYPE]: "update.after",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(updated, context));
			});
		}
		return updated;
	}
	async function updateManyWithHooks(data, where, model, customUpdateFn) {
		const context = await getCurrentAuthContext().catch(() => null);
		let actualData = data;
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.before;
			if (toRun) {
				const result = await withSpan(`db updateMany.before ${model}`, {
					[ATTR_HOOK_TYPE]: "updateMany.before",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(data, context));
				if (result === false) return null;
				if (typeof result === "object" && "data" in result) actualData = {
					...actualData,
					...result.data
				};
			}
		}
		const customUpdated = customUpdateFn ? await customUpdateFn.fn(actualData) : null;
		const updated = !customUpdateFn || customUpdateFn.executeMainFn ? await (await getCurrentAdapter(adapter)).updateMany({
			model,
			update: actualData,
			where
		}) : customUpdated;
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.after;
			if (toRun) await queueAfterTransactionHook(async () => {
				await withSpan(`db updateMany.after ${model}`, {
					[ATTR_HOOK_TYPE]: "updateMany.after",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(updated, context));
			});
		}
		return updated;
	}
	async function deleteWithHooks(where, model, customDeleteFn) {
		const context = await getCurrentAuthContext().catch(() => null);
		let entityToDelete = null;
		try {
			entityToDelete = (await (await getCurrentAdapter(adapter)).findMany({
				model,
				where,
				limit: 1
			}))[0] || null;
		} catch {}
		if (entityToDelete) for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.delete?.before;
			if (toRun) {
				if (await withSpan(`db delete.before ${model}`, {
					["better_auth.hook.type"]: "delete.before",
					["db.collection.name"]: model,
					["better_auth.context"]: source
				}, () => toRun(entityToDelete, context)) === false) return null;
			}
		}
		const customDeleted = customDeleteFn ? await customDeleteFn.fn(where) : null;
		const deleted = (!customDeleteFn || customDeleteFn.executeMainFn) && entityToDelete ? await (await getCurrentAdapter(adapter)).delete({
			model,
			where
		}) : customDeleted;
		if (entityToDelete) for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.delete?.after;
			if (toRun) await queueAfterTransactionHook(async () => {
				await withSpan(`db delete.after ${model}`, {
					[ATTR_HOOK_TYPE]: "delete.after",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(entityToDelete, context));
			});
		}
		return deleted;
	}
	async function deleteManyWithHooks(where, model, customDeleteFn) {
		const context = await getCurrentAuthContext().catch(() => null);
		let entitiesToDelete = [];
		try {
			entitiesToDelete = await (await getCurrentAdapter(adapter)).findMany({
				model,
				where
			});
		} catch {}
		for (const entity of entitiesToDelete) for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.delete?.before;
			if (toRun) {
				if (await withSpan(`db delete.before ${model}`, {
					["better_auth.hook.type"]: "delete.before",
					["db.collection.name"]: model,
					["better_auth.context"]: source
				}, () => toRun(entity, context)) === false) return null;
			}
		}
		const customDeleted = customDeleteFn ? await customDeleteFn.fn(where) : null;
		const deleted = !customDeleteFn || customDeleteFn.executeMainFn ? await (await getCurrentAdapter(adapter)).deleteMany({
			model,
			where
		}) : customDeleted;
		for (const entity of entitiesToDelete) for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.delete?.after;
			if (toRun) await queueAfterTransactionHook(async () => {
				await withSpan(`db delete.after ${model}`, {
					[ATTR_HOOK_TYPE]: "delete.after",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(entity, context));
			});
		}
		return deleted;
	}
	/**
	* Wraps an atomic consume operation in the plugin `delete.before` and
	* `delete.after` hook lifecycle. The caller supplies a `consumeFn` that
	* performs the actual single-row delete-and-return (typically the
	* adapter's `consumeOne`). The first concurrent caller wins, subsequent
	* racers resolve to `null` without firing `delete.after` hooks.
	*
	* `preSnapshot` lets the caller hand in a row it already fetched so
	* `delete.before` hooks don't trigger a second read. Without it, the
	* helper falls back to a best-effort `findMany` against `hookWhere`.
	* The snapshot only feeds `delete.before`; the `consumeFn` return value
	* is the race gate.
	*
	* Returning `false` from a `delete.before` hook aborts the consume and
	* the helper resolves to `null` (no `consumeFn` call, no after hooks).
	*/
	async function consumeOneWithHooks(model, hookWhere, consumeFn, preSnapshot) {
		const context = await getCurrentAuthContext().catch(() => null);
		const beforeHooks = hooksEntries.flatMap(({ source, hooks }) => {
			const fn = hooks[model]?.delete?.before;
			return fn ? [{
				source,
				fn
			}] : [];
		});
		let snapshot = preSnapshot ?? null;
		if (beforeHooks.length) {
			if (!snapshot) try {
				snapshot = (await (await getCurrentAdapter(adapter)).findMany({
					model,
					where: hookWhere,
					limit: 1
				}))[0] || null;
			} catch {}
			if (snapshot) {
				for (const { source, fn } of beforeHooks) if (await withSpan(`db delete.before ${model}`, {
					["better_auth.hook.type"]: "delete.before",
					["db.collection.name"]: model,
					["better_auth.context"]: source
				}, () => fn(snapshot, context)) === false) return null;
			}
		}
		const consumed = await consumeFn();
		if (!consumed) return null;
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.delete?.after;
			if (toRun) await queueAfterTransactionHook(async () => {
				await withSpan(`db delete.after ${model}`, {
					[ATTR_HOOK_TYPE]: "delete.after",
					[ATTR_DB_COLLECTION_NAME]: model,
					[ATTR_CONTEXT]: source
				}, () => toRun(consumed, context));
			});
		}
		return consumed;
	}
	return {
		createWithHooks,
		updateWithHooks,
		updateManyWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
		consumeOneWithHooks
	};
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/internal-adapter.mjs
function getTTLSeconds(expiresAt, now = Date.now()) {
	const expiresMs = typeof expiresAt === "number" ? expiresAt : expiresAt.getTime();
	return Math.max(Math.floor((expiresMs - now) / 1e3), 0);
}
var createInternalAdapter = (adapter, ctx) => {
	const logger = ctx.logger;
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const verificationConsumeLocks = /* @__PURE__ */ new Map();
	let warnedNonAtomicConsume = false;
	const sessionExpiration = options.session?.expiresIn || 3600 * 24 * 7;
	const { createWithHooks, updateWithHooks, updateManyWithHooks, deleteWithHooks, deleteManyWithHooks, consumeOneWithHooks } = getWithHooks(adapter, ctx);
	async function refreshUserSessions(user) {
		if (!secondaryStorage) return;
		const listRaw = await secondaryStorage.get(`active-sessions-${user.id}`);
		if (!listRaw) return;
		const now = Date.now();
		const validSessions = (safeJSONParse(listRaw) || []).filter((s) => s.expiresAt > now);
		await Promise.all(validSessions.map(async ({ token }) => {
			const cached = await secondaryStorage.get(token);
			if (!cached) return;
			const parsed = safeJSONParse(cached);
			if (!parsed) return;
			const sessionTTL = getTTLSeconds(parsed.session.expiresAt, now);
			await secondaryStorage.set(token, JSON.stringify({
				session: parsed.session,
				user
			}), Math.floor(sessionTTL));
		}));
	}
	async function withVerificationConsumeLock(key, fn) {
		const previous = verificationConsumeLocks.get(key) ?? Promise.resolve();
		let release;
		const current = new Promise((resolve) => {
			release = resolve;
		});
		const next = previous.catch(() => {}).then(() => current);
		verificationConsumeLocks.set(key, next);
		await previous.catch(() => {});
		try {
			return await fn();
		} finally {
			release();
			if (verificationConsumeLocks.get(key) === next) verificationConsumeLocks.delete(key);
		}
	}
	return {
		createOAuthUser: async (user, account) => {
			return runWithTransaction(adapter, async () => {
				const createdUser = await createWithHooks({
					createdAt: /* @__PURE__ */ new Date(),
					updatedAt: /* @__PURE__ */ new Date(),
					...user,
					email: user.email?.toLowerCase()
				}, "user", void 0);
				return {
					user: createdUser,
					account: await createWithHooks({
						...account,
						userId: createdUser.id,
						createdAt: /* @__PURE__ */ new Date(),
						updatedAt: /* @__PURE__ */ new Date()
					}, "account", void 0)
				};
			});
		},
		createUser: async (user) => {
			return await createWithHooks({
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date(),
				...user,
				email: user.email?.toLowerCase()
			}, "user", void 0);
		},
		createAccount: async (account) => {
			return await createWithHooks({
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date(),
				...account
			}, "account", void 0);
		},
		listSessions: async (userId, options) => {
			if (secondaryStorage) {
				const currentList = await secondaryStorage.get(`active-sessions-${userId}`);
				if (!currentList) return [];
				const list = safeJSONParse(currentList) || [];
				const now = Date.now();
				const seenTokens = /* @__PURE__ */ new Set();
				const sessions = [];
				for (const { token, expiresAt } of list) {
					if (expiresAt <= now || seenTokens.has(token)) continue;
					seenTokens.add(token);
					const data = await secondaryStorage.get(token);
					if (!data) continue;
					try {
						const parsed = typeof data === "string" ? JSON.parse(data) : data;
						if (!parsed?.session) continue;
						sessions.push(parseSessionOutput(ctx.options, {
							...parsed.session,
							expiresAt: new Date(parsed.session.expiresAt)
						}));
					} catch {
						continue;
					}
				}
				return sessions;
			}
			return await (await getCurrentAdapter(adapter)).findMany({
				model: "session",
				where: [{
					field: "userId",
					value: userId
				}, ...options?.onlyActiveSessions ? [{
					field: "expiresAt",
					value: /* @__PURE__ */ new Date(),
					operator: "gt"
				}] : []]
			});
		},
		listUsers: async (limit, offset, sortBy, where) => {
			return await (await getCurrentAdapter(adapter)).findMany({
				model: "user",
				limit,
				offset,
				sortBy,
				where
			});
		},
		countTotalUsers: async (where) => {
			const total = await (await getCurrentAdapter(adapter)).count({
				model: "user",
				where
			});
			if (typeof total === "string") return parseInt(total);
			return total;
		},
		deleteUser: async (userId) => {
			if (!secondaryStorage || options.session?.storeSessionInDatabase) await deleteManyWithHooks([{
				field: "userId",
				value: userId
			}], "session", void 0);
			await deleteManyWithHooks([{
				field: "userId",
				value: userId
			}], "account", void 0);
			await deleteWithHooks([{
				field: "id",
				value: userId
			}], "user", void 0);
		},
		createSession: async (userId, dontRememberMe, override, overrideAll) => {
			const headers = await (async () => {
				const ctx = await getCurrentAuthContext().catch(() => null);
				return ctx?.headers || ctx?.request?.headers;
			})();
			const storeInDb = options.session?.storeSessionInDatabase;
			const { id: _, ...rest } = override || {};
			let sessionId;
			if (secondaryStorage && !storeInDb) {
				const generatedId = ctx.generateId({ model: "session" });
				sessionId = generatedId !== false ? generatedId : generateId$1();
			}
			const defaultAdditionalFields = getSessionDefaultFields(options);
			const data = {
				...sessionId ? { id: sessionId } : {},
				ipAddress: headers ? getIp(headers, options) || "" : "",
				userAgent: headers?.get("user-agent") || "",
				...rest,
				expiresAt: dontRememberMe ? getDate(3600 * 24, "sec") : getDate(sessionExpiration, "sec"),
				userId,
				token: generateId$1(32),
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date(),
				...defaultAdditionalFields,
				...overrideAll ? rest : {}
			};
			return await createWithHooks(data, "session", secondaryStorage ? {
				fn: async (sessionData) => {
					/**
					* store the session token for the user
					* so we can retrieve it later for listing sessions
					*/
					const currentList = await secondaryStorage.get(`active-sessions-${userId}`);
					let list = [];
					const now = Date.now();
					if (currentList) {
						list = safeJSONParse(currentList) || [];
						list = list.filter((session) => session.expiresAt > now && session.token !== data.token);
					}
					const sorted = [...list, {
						token: data.token,
						expiresAt: data.expiresAt.getTime()
					}].sort((a, b) => a.expiresAt - b.expiresAt);
					const furthestSessionTTL = getTTLSeconds(sorted.at(-1)?.expiresAt ?? data.expiresAt.getTime(), now);
					if (furthestSessionTTL > 0) await secondaryStorage.set(`active-sessions-${userId}`, JSON.stringify(sorted), furthestSessionTTL);
					const user = await (await getCurrentAdapter(adapter)).findOne({
						model: "user",
						where: [{
							field: "id",
							value: userId
						}]
					});
					const sessionTTL = getTTLSeconds(data.expiresAt, now);
					if (sessionTTL > 0) await secondaryStorage.set(data.token, JSON.stringify({
						session: sessionData,
						user
					}), sessionTTL);
					return sessionData;
				},
				executeMainFn: storeInDb
			} : void 0);
		},
		findSession: async (token) => {
			if (secondaryStorage) {
				const sessionStringified = await secondaryStorage.get(token);
				if (!sessionStringified && (!options.session?.storeSessionInDatabase || ctx.options.session?.preserveSessionInDatabase)) return null;
				if (sessionStringified) {
					const s = safeJSONParse(sessionStringified);
					if (!s) return null;
					return {
						session: parseSessionOutput(ctx.options, {
							...s.session,
							expiresAt: new Date(s.session.expiresAt),
							createdAt: new Date(s.session.createdAt),
							updatedAt: new Date(s.session.updatedAt)
						}),
						user: parseUserOutput(ctx.options, {
							...s.user,
							createdAt: new Date(s.user.createdAt),
							updatedAt: new Date(s.user.updatedAt)
						})
					};
				}
			}
			const result = await (await getCurrentAdapter(adapter)).findOne({
				model: "session",
				where: [{
					value: token,
					field: "token"
				}],
				join: { user: true }
			});
			if (!result) return null;
			const { user, ...session } = result;
			if (!user) return null;
			return {
				session: parseSessionOutput(ctx.options, session),
				user: parseUserOutput(ctx.options, user)
			};
		},
		findSessions: async (sessionTokens, options) => {
			if (secondaryStorage) {
				const sessions = [];
				for (const sessionToken of sessionTokens) {
					const sessionStringified = await secondaryStorage.get(sessionToken);
					if (sessionStringified) try {
						const s = typeof sessionStringified === "string" ? JSON.parse(sessionStringified) : sessionStringified;
						if (!s) return [];
						const expiresAt = new Date(s.session.expiresAt);
						if (options?.onlyActiveSessions && expiresAt <= /* @__PURE__ */ new Date()) continue;
						const session = {
							session: {
								...s.session,
								expiresAt: new Date(s.session.expiresAt)
							},
							user: {
								...s.user,
								createdAt: new Date(s.user.createdAt),
								updatedAt: new Date(s.user.updatedAt)
							}
						};
						sessions.push(session);
					} catch {
						continue;
					}
				}
				return sessions;
			}
			const sessions = await (await getCurrentAdapter(adapter)).findMany({
				model: "session",
				where: [{
					field: "token",
					value: sessionTokens,
					operator: "in"
				}, ...options?.onlyActiveSessions ? [{
					field: "expiresAt",
					value: /* @__PURE__ */ new Date(),
					operator: "gt"
				}] : []],
				join: { user: true }
			});
			if (!sessions.length) return [];
			if (sessions.some((session) => !session.user)) return [];
			return sessions.map((_session) => {
				const { user, ...session } = _session;
				return {
					session,
					user
				};
			});
		},
		updateSession: async (sessionToken, session) => {
			return await updateWithHooks(session, [{
				field: "token",
				value: sessionToken
			}], "session", secondaryStorage ? {
				async fn(data) {
					const currentSession = await secondaryStorage.get(sessionToken);
					if (!currentSession) return null;
					const parsedSession = safeJSONParse(currentSession);
					if (!parsedSession) return null;
					const mergedSession = {
						...parsedSession.session,
						...data,
						expiresAt: new Date(data.expiresAt ?? parsedSession.session.expiresAt),
						createdAt: new Date(parsedSession.session.createdAt),
						updatedAt: new Date(data.updatedAt ?? parsedSession.session.updatedAt)
					};
					const updatedSession = parseSessionOutput(ctx.options, mergedSession);
					const now = Date.now();
					const expiresMs = new Date(updatedSession.expiresAt).getTime();
					const sessionTTL = getTTLSeconds(expiresMs, now);
					if (sessionTTL > 0) {
						await secondaryStorage.set(sessionToken, JSON.stringify({
							session: updatedSession,
							user: parsedSession.user
						}), sessionTTL);
						const listKey = `active-sessions-${updatedSession.userId}`;
						const listRaw = await secondaryStorage.get(listKey);
						const sorted = (listRaw ? safeJSONParse(listRaw) || [] : []).filter((s) => s.token !== sessionToken && s.expiresAt > now).concat([{
							token: sessionToken,
							expiresAt: expiresMs
						}]).sort((a, b) => a.expiresAt - b.expiresAt);
						const furthestSessionExp = sorted.at(-1)?.expiresAt;
						if (furthestSessionExp && furthestSessionExp > now) await secondaryStorage.set(listKey, JSON.stringify(sorted), getTTLSeconds(furthestSessionExp, now));
						else await secondaryStorage.delete(listKey);
					}
					return updatedSession;
				},
				executeMainFn: options.session?.storeSessionInDatabase
			} : void 0);
		},
		deleteSession: async (token) => {
			if (secondaryStorage) {
				const data = await secondaryStorage.get(token);
				if (data) {
					const { session } = safeJSONParse(data) ?? {};
					if (!session) {
						logger.error("Session not found in secondary storage");
						return;
					}
					const userId = session.userId;
					const currentList = await secondaryStorage.get(`active-sessions-${userId}`);
					if (currentList) {
						const list = safeJSONParse(currentList) || [];
						const now = Date.now();
						const filtered = list.filter((session) => session.expiresAt > now && session.token !== token);
						const furthestSessionExp = filtered.sort((a, b) => a.expiresAt - b.expiresAt).at(-1)?.expiresAt;
						if (filtered.length > 0 && furthestSessionExp && furthestSessionExp > Date.now()) await secondaryStorage.set(`active-sessions-${userId}`, JSON.stringify(filtered), getTTLSeconds(furthestSessionExp, now));
						else await secondaryStorage.delete(`active-sessions-${userId}`);
					} else logger.error("Active sessions list not found in secondary storage");
				}
				await secondaryStorage.delete(token);
				if (!options.session?.storeSessionInDatabase || ctx.options.session?.preserveSessionInDatabase) return;
			}
			await deleteWithHooks([{
				field: "token",
				value: token
			}], "session", void 0);
		},
		deleteAccounts: async (userId) => {
			await deleteManyWithHooks([{
				field: "userId",
				value: userId
			}], "account", void 0);
		},
		deleteAccount: async (id) => {
			await deleteWithHooks([{
				field: "id",
				value: id
			}], "account", void 0);
		},
		deleteUserSessions: async (userId) => {
			if (secondaryStorage) {
				const activeSession = await secondaryStorage.get(`active-sessions-${userId}`);
				const sessions = activeSession ? safeJSONParse(activeSession) : [];
				if (!sessions) return;
				for (const session of sessions) await secondaryStorage.delete(session.token);
				await secondaryStorage.delete(`active-sessions-${userId}`);
				if (!options.session?.storeSessionInDatabase || ctx.options.session?.preserveSessionInDatabase) return;
			}
			await deleteManyWithHooks([{
				field: "userId",
				value: userId
			}], "session", void 0);
		},
		deleteSessions: async (sessionTokens) => {
			if (secondaryStorage) {
				for (const sessionToken of sessionTokens) if (await secondaryStorage.get(sessionToken)) await secondaryStorage.delete(sessionToken);
				if (!options.session?.storeSessionInDatabase || ctx.options.session?.preserveSessionInDatabase) return;
			}
			await deleteManyWithHooks([{
				field: "token",
				value: sessionTokens,
				operator: "in"
			}], "session", void 0);
		},
		findOAuthUser: async (email, accountId, providerId) => {
			const account = await (await getCurrentAdapter(adapter)).findOne({
				model: "account",
				where: [{
					value: accountId,
					field: "accountId"
				}, {
					value: providerId,
					field: "providerId"
				}],
				join: { user: true }
			});
			if (account) if (account.user) return {
				user: account.user,
				linkedAccount: account,
				accounts: [account]
			};
			else {
				const user = await (await getCurrentAdapter(adapter)).findOne({
					model: "user",
					where: [{
						value: email.toLowerCase(),
						field: "email"
					}]
				});
				if (user) return {
					user,
					linkedAccount: account,
					accounts: [account]
				};
				return null;
			}
			else {
				const user = await (await getCurrentAdapter(adapter)).findOne({
					model: "user",
					where: [{
						value: email.toLowerCase(),
						field: "email"
					}]
				});
				if (user) return {
					user,
					linkedAccount: null,
					accounts: await (await getCurrentAdapter(adapter)).findMany({
						model: "account",
						where: [{
							value: user.id,
							field: "userId"
						}]
					}) || []
				};
				else return null;
			}
		},
		findUserByEmail: async (email, options) => {
			const result = await (await getCurrentAdapter(adapter)).findOne({
				model: "user",
				where: [{
					value: email.toLowerCase(),
					field: "email"
				}],
				join: { ...options?.includeAccounts ? { account: true } : {} }
			});
			if (!result) return null;
			const { account: accounts, ...user } = result;
			return {
				user,
				accounts: accounts ?? []
			};
		},
		findUserById: async (userId) => {
			if (!userId) return null;
			return await (await getCurrentAdapter(adapter)).findOne({
				model: "user",
				where: [{
					field: "id",
					value: userId
				}]
			});
		},
		linkAccount: async (account) => {
			return await createWithHooks({
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date(),
				...account
			}, "account", void 0);
		},
		updateUser: async (userId, data) => {
			const user = await updateWithHooks({
				...data,
				...data.email ? { email: data.email.toLowerCase() } : {}
			}, [{
				field: "id",
				value: userId
			}], "user", void 0);
			await refreshUserSessions(user);
			return user;
		},
		updateUserByEmail: async (email, data) => {
			const user = await updateWithHooks({
				...data,
				...data.email ? { email: data.email.toLowerCase() } : {}
			}, [{
				field: "email",
				value: email.toLowerCase()
			}], "user", void 0);
			await refreshUserSessions(user);
			return user;
		},
		updatePassword: async (userId, password) => {
			await updateManyWithHooks({ password }, [{
				field: "userId",
				value: userId
			}, {
				field: "providerId",
				value: "credential"
			}], "account", void 0);
		},
		findAccounts: async (userId) => {
			return await (await getCurrentAdapter(adapter)).findMany({
				model: "account",
				where: [{
					field: "userId",
					value: userId
				}]
			});
		},
		findAccountByProviderId: async (accountId, providerId) => {
			return await (await getCurrentAdapter(adapter)).findOne({
				model: "account",
				where: [{
					field: "accountId",
					value: accountId
				}, {
					field: "providerId",
					value: providerId
				}]
			});
		},
		findAccountByUserId: async (userId) => {
			return await (await getCurrentAdapter(adapter)).findMany({
				model: "account",
				where: [{
					field: "userId",
					value: userId
				}]
			});
		},
		updateAccount: async (id, data) => {
			return await updateWithHooks(data, [{
				field: "id",
				value: id
			}], "account", void 0);
		},
		createVerificationValue: async (data) => {
			const storageOption = getStorageOption(data.identifier, options.verification?.storeIdentifier);
			const storedIdentifier = await processIdentifier(data.identifier, storageOption);
			return await createWithHooks({
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date(),
				...data,
				identifier: storedIdentifier
			}, "verification", secondaryStorage ? {
				async fn(verificationData) {
					const ttl = getTTLSeconds(verificationData.expiresAt);
					if (ttl > 0) await secondaryStorage.set(`verification:${storedIdentifier}`, JSON.stringify(verificationData), ttl);
					return verificationData;
				},
				executeMainFn: options.verification?.storeInDatabase
			} : void 0);
		},
		findVerificationValue: async (identifier) => {
			const storageOption = getStorageOption(identifier, options.verification?.storeIdentifier);
			const storedIdentifier = await processIdentifier(identifier, storageOption);
			if (secondaryStorage) {
				const cached = await secondaryStorage.get(`verification:${storedIdentifier}`);
				if (cached) {
					const parsed = safeJSONParse(cached);
					if (parsed) return parsed;
				}
				if (storageOption && storageOption !== "plain") {
					const plainCached = await secondaryStorage.get(`verification:${identifier}`);
					if (plainCached) {
						const parsed = safeJSONParse(plainCached);
						if (parsed) return parsed;
					}
				}
				if (!options.verification?.storeInDatabase) return null;
			}
			const currentAdapter = await getCurrentAdapter(adapter);
			async function findByIdentifier(id) {
				return currentAdapter.findMany({
					model: "verification",
					where: [{
						field: "identifier",
						value: id
					}],
					sortBy: {
						field: "createdAt",
						direction: "desc"
					},
					limit: 1
				});
			}
			let verification = await findByIdentifier(storedIdentifier);
			if (!verification.length && storageOption && storageOption !== "plain") verification = await findByIdentifier(identifier);
			if (!options.verification?.disableCleanup) await deleteManyWithHooks([{
				field: "expiresAt",
				value: /* @__PURE__ */ new Date(),
				operator: "lt"
			}], "verification", void 0);
			return verification[0] || null;
		},
		deleteVerificationByIdentifier: async (identifier) => {
			const storedIdentifier = await processIdentifier(identifier, getStorageOption(identifier, options.verification?.storeIdentifier));
			if (secondaryStorage) await secondaryStorage.delete(`verification:${storedIdentifier}`);
			if (!secondaryStorage || options.verification?.storeInDatabase) await deleteWithHooks([{
				field: "identifier",
				value: storedIdentifier
			}], "verification", void 0);
		},
		consumeVerificationValue: async (identifier) => {
			const storageOption = getStorageOption(identifier, options.verification?.storeIdentifier);
			const storedIdentifier = await processIdentifier(identifier, storageOption);
			const identifiersToTry = storageOption && storageOption !== "plain" ? [storedIdentifier, identifier] : [storedIdentifier];
			const hydrateCachedVerification = (raw) => {
				if (!raw) return null;
				const candidate = typeof raw === "string" ? safeJSONParse(raw) : typeof raw === "object" ? raw : null;
				if (!candidate) return null;
				const expiresAt = new Date(candidate.expiresAt);
				if (!Number.isFinite(expiresAt.getTime())) return null;
				return {
					...candidate,
					expiresAt
				};
			};
			let consumed = null;
			if (secondaryStorage && !options.verification?.storeInDatabase) {
				const consumeCacheKey = async (key) => {
					if (secondaryStorage.getAndDelete) return hydrateCachedVerification(await secondaryStorage.getAndDelete(key));
					if (!warnedNonAtomicConsume) {
						warnedNonAtomicConsume = true;
						logger.warn("Secondary storage does not implement `getAndDelete`, so single-use verification values cannot be consumed atomically across processes. Implement `getAndDelete` or use database-backed verification storage to guarantee single use.");
					}
					return withVerificationConsumeLock(key, async () => {
						const parsed = hydrateCachedVerification(await secondaryStorage.get(key));
						if (!parsed) return null;
						await secondaryStorage.delete(key);
						return parsed;
					});
				};
				for (const stored of identifiersToTry) {
					const cached = await consumeCacheKey(`verification:${stored}`);
					if (!cached) continue;
					await Promise.all(identifiersToTry.filter((candidate) => candidate !== stored).map((candidate) => secondaryStorage.delete(`verification:${candidate}`)));
					consumed = cached;
					break;
				}
			} else {
				const consumeByIdentifier = async (id) => withVerificationConsumeLock(`verification:${id}`, () => runWithTransaction(adapter, async () => {
					const txAdapter = await getCurrentAdapter(adapter);
					const where = [{
						field: "identifier",
						value: id
					}];
					const latest = (await txAdapter.findMany({
						model: "verification",
						where,
						sortBy: {
							field: "createdAt",
							direction: "desc"
						},
						limit: 1
					}))[0] ?? null;
					if (!latest) return null;
					return consumeOneWithHooks("verification", [{
						field: "id",
						value: latest.id
					}], async () => {
						const row = await txAdapter.consumeOne({
							model: "verification",
							where: [{
								field: "id",
								value: latest.id
							}]
						});
						if (!row) return null;
						await txAdapter.deleteMany({
							model: "verification",
							where
						});
						return row;
					}, latest);
				}));
				for (const stored of identifiersToTry) {
					consumed = await consumeByIdentifier(stored);
					if (consumed) break;
				}
				if (consumed && secondaryStorage) await Promise.all(identifiersToTry.map((stored) => secondaryStorage.delete(`verification:${stored}`)));
			}
			if (!consumed || consumed.expiresAt < /* @__PURE__ */ new Date()) return null;
			return consumed;
		},
		reserveVerificationValue: async (data) => {
			const reservationId = base64Url.encode(new Uint8Array(await createHash$1("SHA-256").digest(new TextEncoder().encode("reserve:" + data.identifier))), { padding: false });
			const storageOption = getStorageOption(data.identifier, options.verification?.storeIdentifier);
			const storedIdentifier = await processIdentifier(data.identifier, storageOption);
			if (secondaryStorage && !options.verification?.storeInDatabase) {
				const cacheKey = `verification:${storedIdentifier}`;
				if (await secondaryStorage.get(cacheKey)) return false;
				await secondaryStorage.set(cacheKey, JSON.stringify({
					id: reservationId,
					identifier: storedIdentifier,
					value: data.value,
					expiresAt: data.expiresAt
				}), getTTLSeconds(data.expiresAt));
				return true;
			}
			try {
				await adapter.create({
					model: "verification",
					data: {
						id: reservationId,
						identifier: storedIdentifier,
						value: data.value,
						expiresAt: data.expiresAt,
						createdAt: /* @__PURE__ */ new Date(),
						updatedAt: /* @__PURE__ */ new Date()
					},
					forceAllowId: true
				});
			} catch (error) {
				if (await adapter.findOne({
					model: "verification",
					where: [{
						field: "id",
						value: reservationId
					}]
				})) return false;
				throw error;
			}
			if (secondaryStorage) {
				const ttl = getTTLSeconds(data.expiresAt);
				if (ttl > 0) await secondaryStorage.set(`verification:${storedIdentifier}`, JSON.stringify({
					id: reservationId,
					identifier: storedIdentifier,
					value: data.value,
					expiresAt: data.expiresAt
				}), ttl);
			}
			return true;
		},
		updateVerificationByIdentifier: async (identifier, data) => {
			const storedIdentifier = await processIdentifier(identifier, getStorageOption(identifier, options.verification?.storeIdentifier));
			if (secondaryStorage) {
				const cached = await secondaryStorage.get(`verification:${storedIdentifier}`);
				if (cached) {
					const parsed = safeJSONParse(cached);
					if (parsed) {
						const updated = {
							...parsed,
							...data
						};
						const expiresAt = updated.expiresAt ?? parsed.expiresAt;
						const ttl = getTTLSeconds(expiresAt instanceof Date ? expiresAt : new Date(expiresAt));
						if (ttl > 0) await secondaryStorage.set(`verification:${storedIdentifier}`, JSON.stringify(updated), ttl);
						if (!options.verification?.storeInDatabase) return updated;
					}
				}
			}
			if (!secondaryStorage || options.verification?.storeInDatabase) return await updateWithHooks(data, [{
				field: "identifier",
				value: storedIdentifier
			}], "verification", void 0);
			return data;
		},
		refreshUserSessions
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/utils/host.mjs
/**
* Cloud provider instance metadata service FQDNs. These resolve to link-local
* IPs (usually `169.254.169.254`) inside their respective clouds and are
* prime SSRF targets.
*
* The IPs themselves are already caught by the `linkLocal` kind; this set
* only exists for the FQDN form that a naive server-side fetch might resolve
* via its own resolver.
*/
var CLOUD_METADATA_HOSTS = /* @__PURE__ */ new Set([
	"metadata.google.internal",
	"metadata.goog",
	"metadata",
	"instance-data",
	"instance-data.ec2.internal"
]);
/** Strip `[...]` if the entire input is bracketed (IPv6 literal form). */
function stripBrackets(host) {
	if (host.length >= 2 && host.startsWith("[") && host.endsWith("]")) return host.slice(1, -1);
	return host;
}
/**
* Strip trailing `:port` from host-with-port strings.
*
* - Bracketed IPv6 with port: `[::1]:8080` → `[::1]`
* - IPv4/FQDN with port: `127.0.0.1:3000` / `example.com:443` → base form
* - Bare IPv6: `::1` / `fe80::1` → unchanged (multiple colons means no port)
*/
function stripPort(host) {
	if (host.startsWith("[")) {
		const end = host.indexOf("]");
		if (end === -1) return host;
		return host.slice(0, end + 1);
	}
	const firstColon = host.indexOf(":");
	if (firstColon === -1) return host;
	if (host.indexOf(":", firstColon + 1) !== -1) return host;
	return host.slice(0, firstColon);
}
/** Strip IPv6 zone identifier: `fe80::1%eth0` → `fe80::1`. */
function stripZoneId(host) {
	const zone = host.indexOf("%");
	if (zone === -1) return host;
	return host.slice(0, zone);
}
/**
* Strip trailing dots (RFC 1034 absolute DNS form): `localhost.` → `localhost`.
* Without this, `metadata.google.internal.` would fall through to `public` and
* bypass the cloud-metadata / `.localhost` checks, since WHATWG URL parsing
* preserves the trailing dot in `url.hostname`.
*/
function stripTrailingDot(host) {
	return host.replace(/\.+$/, "");
}
/** Fast dotted-decimal shape check. Does NOT validate octet bounds. */
function looksLikeIPv4(host) {
	return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
/** Pack a validated dotted-decimal IPv4 into a 32-bit unsigned integer. */
function ipv4ToUint32(ip) {
	const parts = ip.split(".");
	return (Number(parts[0]) << 24 | Number(parts[1]) << 16 | Number(parts[2]) << 8 | Number(parts[3])) >>> 0;
}
/** Check whether a 32-bit value matches `prefix/length` (both unsigned). */
function inIPv4Range(value, prefix, length) {
	if (length === 0) return true;
	const mask = length === 32 ? 4294967295 : -1 << 32 - length >>> 0;
	return (value & mask) === (prefix & mask);
}
function classifyIPv4(ip) {
	if (ip === "0.0.0.0") return "unspecified";
	if (ip === "255.255.255.255") return "broadcast";
	const n = ipv4ToUint32(ip);
	if (inIPv4Range(n, ipv4ToUint32("127.0.0.0"), 8)) return "loopback";
	if (inIPv4Range(n, ipv4ToUint32("10.0.0.0"), 8)) return "private";
	if (inIPv4Range(n, ipv4ToUint32("172.16.0.0"), 12)) return "private";
	if (inIPv4Range(n, ipv4ToUint32("192.168.0.0"), 16)) return "private";
	if (inIPv4Range(n, ipv4ToUint32("169.254.0.0"), 16)) return "linkLocal";
	if (inIPv4Range(n, ipv4ToUint32("100.64.0.0"), 10)) return "sharedAddressSpace";
	if (inIPv4Range(n, ipv4ToUint32("192.0.2.0"), 24)) return "documentation";
	if (inIPv4Range(n, ipv4ToUint32("198.51.100.0"), 24)) return "documentation";
	if (inIPv4Range(n, ipv4ToUint32("203.0.113.0"), 24)) return "documentation";
	if (inIPv4Range(n, ipv4ToUint32("198.18.0.0"), 15)) return "benchmarking";
	if (inIPv4Range(n, ipv4ToUint32("224.0.0.0"), 4)) return "multicast";
	if (inIPv4Range(n, ipv4ToUint32("0.0.0.0"), 8)) return "reserved";
	if (inIPv4Range(n, ipv4ToUint32("192.0.0.0"), 24)) return "reserved";
	if (inIPv4Range(n, ipv4ToUint32("240.0.0.0"), 4)) return "reserved";
	return "public";
}
/**
* Extract an IPv4 address embedded in an expanded IPv6 literal.
*
* Used to recurse into tunnel/translation forms (6to4, NAT64, Teredo) so a
* private destination cannot be smuggled behind a syntactically-public IPv6
* literal. `startGroup` is the index of the first of two 16-bit groups in the
* expanded form (`0000:0000:...`). With `xor: true`, the 32-bit value is XORed
* with `0xffffffff` before decoding (Teredo obfuscates the client IPv4 this
* way).
*/
function extractEmbeddedIPv4(expanded, startGroup, options = {}) {
	const offset = startGroup * 5;
	const g1 = Number.parseInt(expanded.slice(offset, offset + 4), 16);
	const g2 = Number.parseInt(expanded.slice(offset + 5, offset + 9), 16);
	if (!Number.isFinite(g1) || !Number.isFinite(g2)) return null;
	let combined = (g1 << 16 | g2) >>> 0;
	if (options.xor) combined = (combined ^ 4294967295) >>> 0;
	return `${combined >>> 24 & 255}.${combined >>> 16 & 255}.${combined >>> 8 & 255}.${combined & 255}`;
}
/**
* Classify an expanded, full-form, lowercase IPv6 address (no IPv4-mapped
* input — those are unmapped to IPv4 before reaching here).
*
* 6to4 (`2002::/16`), NAT64 (`64:ff9b::/96`) and Teredo (`2001:0000::/32`)
* embed an IPv4 that can route to private/loopback space. If the embedded
* IPv4 classifies as non-`public`, return `reserved` — blocks SSRF without
* advertising the address as a loopback literal for RFC 8252 §7.3 matching.
*/
function classifyIPv6(expanded) {
	if (expanded === "0000:0000:0000:0000:0000:0000:0000:0000") return "unspecified";
	if (expanded === "0000:0000:0000:0000:0000:0000:0000:0001") return "loopback";
	const firstByte = Number.parseInt(expanded.slice(0, 2), 16);
	const secondByte = Number.parseInt(expanded.slice(2, 4), 16);
	if (firstByte === 255) return "multicast";
	if (firstByte === 254 && (secondByte & 192) === 128) return "linkLocal";
	if ((firstByte & 254) === 252) return "private";
	if (expanded.startsWith("2001:0db8:")) return "documentation";
	if (expanded.startsWith("2001:0002:0000:")) return "benchmarking";
	if (expanded.startsWith("2002:")) {
		const embedded = extractEmbeddedIPv4(expanded, 1);
		if (embedded && classifyIPv4(embedded) !== "public") return "reserved";
		return "public";
	}
	if (expanded.startsWith("0064:ff9b:0000:0000:0000:0000:")) {
		const embedded = extractEmbeddedIPv4(expanded, 6);
		if (embedded && classifyIPv4(embedded) !== "public") return "reserved";
		return "reserved";
	}
	if (expanded.startsWith("0064:ff9b:0001:")) return "reserved";
	if (expanded.startsWith("2001:0000:")) {
		const embedded = extractEmbeddedIPv4(expanded, 6, { xor: true });
		if (embedded && classifyIPv4(embedded) !== "public") return "reserved";
		return "reserved";
	}
	if (expanded.startsWith("0100:0000:0000:0000:")) return "reserved";
	if (expanded.startsWith("3fff:0")) return "documentation";
	if (expanded.startsWith("5f00:")) return "reserved";
	return "public";
}
/**
* Classify a host string according to RFC 6890 / RFC 6761.
*
* Accepts inputs in any of these shapes and normalizes before classifying:
*
*   - Bare IPv4: `127.0.0.1`
*   - Bare IPv6: `::1`, `fe80::1%eth0`
*   - Bracketed IPv6: `[::1]`
*   - Host with port: `localhost:3000`, `127.0.0.1:443`, `[::1]:8080`
*   - FQDN: `example.com`, `tenant.localhost`
*   - IPv4-mapped IPv6: `::ffff:192.0.2.1` (reported as `literal: "ipv4"`)
*
* Invalid or non-resolvable FQDNs are returned as `{ kind: "public", literal: "fqdn" }`
* — this function never throws. Callers that need structural validation must
* combine this with a URL/hostname validator upstream.
*
* @example
* classifyHost("127.0.0.1")
* // { kind: "loopback", literal: "ipv4", canonical: "127.0.0.1" }
*
* @example
* classifyHost("[::1]:8080")
* // { kind: "loopback", literal: "ipv6", canonical: "0000:0000:...:0001" }
*
* @example
* classifyHost("::ffff:192.0.2.1")
* // { kind: "documentation", literal: "ipv4", canonical: "192.0.2.1" }
*
* @example
* classifyHost("tenant-a.localhost")
* // { kind: "localhost", literal: "fqdn", canonical: "tenant-a.localhost" }
*/
function classifyHost(host) {
	const lowered = stripTrailingDot(stripZoneId(stripBrackets(stripPort(host.trim())))).toLowerCase();
	if (lowered === "") return {
		kind: "reserved",
		literal: "fqdn",
		canonical: ""
	};
	if (!isValidIP(lowered)) {
		if (lowered === "localhost" || lowered.endsWith(".localhost")) return {
			kind: "localhost",
			literal: "fqdn",
			canonical: lowered
		};
		if (CLOUD_METADATA_HOSTS.has(lowered)) return {
			kind: "cloudMetadata",
			literal: "fqdn",
			canonical: lowered
		};
		return {
			kind: "public",
			literal: "fqdn",
			canonical: lowered
		};
	}
	if (looksLikeIPv4(lowered)) return {
		kind: classifyIPv4(lowered),
		literal: "ipv4",
		canonical: lowered
	};
	const canonical = normalizeIP(lowered, { ipv6Subnet: 128 });
	if (looksLikeIPv4(canonical)) return {
		kind: classifyIPv4(canonical),
		literal: "ipv4",
		canonical
	};
	return {
		kind: classifyIPv6(canonical),
		literal: "ipv6",
		canonical
	};
}
/**
* Permissive loopback check for developer-ergonomics code paths.
*
* Returns true for IPv4 `127.0.0.0/8`, IPv6 `::1`, the literal name `localhost`,
* and any RFC 6761 `.localhost` subdomain (`tenant.localhost`, `app.localhost`).
*
* Use this for things like: allowing HTTP for dev servers, skipping Secure
* cookie requirements, browser-trust heuristics. Do NOT use this for OAuth
* redirect URI matching — use {@link isLoopbackIP} there.
*
* @example
* isLoopbackHost("localhost")         // true
* isLoopbackHost("tenant.localhost")  // true  (RFC 6761)
* isLoopbackHost("127.0.0.1")         // true
* isLoopbackHost("0.0.0.0")           // false (unspecified, NOT loopback)
*/
function isLoopbackHost(host) {
	const kind = classifyHost(host).kind;
	return kind === "loopback" || kind === "localhost";
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/context/helpers.mjs
async function runPluginInit(context) {
	let options = context.options;
	const plugins = options.plugins || [];
	const pluginTrustedOrigins = [];
	const dbHooks = [];
	for (const plugin of plugins) if (plugin.init) {
		const initPromise = plugin.init(context);
		let result;
		if (isPromise(initPromise)) result = await initPromise;
		else result = initPromise;
		if (typeof result === "object") {
			if (result.options) {
				const { databaseHooks, trustedOrigins, ...restOpts } = result.options;
				if (databaseHooks) dbHooks.push({
					source: `plugin:${plugin.id}`,
					hooks: databaseHooks
				});
				if (trustedOrigins) pluginTrustedOrigins.push(trustedOrigins);
				options = defu(options, restOpts);
			}
			if (result.context) Object.assign(context, result.context);
		}
	}
	if (pluginTrustedOrigins.length > 0) {
		const allSources = [...options.trustedOrigins ? [options.trustedOrigins] : [], ...pluginTrustedOrigins];
		const staticOrigins = allSources.filter(Array.isArray).flat();
		const dynamicOrigins = allSources.filter((s) => typeof s === "function");
		if (dynamicOrigins.length > 0) options.trustedOrigins = async (request) => {
			const resolved = await Promise.all(dynamicOrigins.map((fn) => fn(request)));
			return [...staticOrigins, ...resolved.flat()].filter((v) => typeof v === "string" && v !== "");
		};
		else options.trustedOrigins = staticOrigins;
	}
	if (options.databaseHooks) dbHooks.push({
		source: "user",
		hooks: options.databaseHooks
	});
	context.internalAdapter = createInternalAdapter(context.adapter, {
		options,
		logger: context.logger,
		hooks: dbHooks,
		generateId: context.generateId
	});
	context.options = options;
}
function getInternalPlugins(options) {
	const plugins = [];
	if (options.advanced?.crossSubDomainCookies?.enabled) {}
	return plugins;
}
async function getTrustedOrigins(options, request) {
	const trustedOrigins = [];
	if (isDynamicBaseURLConfig(options.baseURL)) {
		const allowedHosts = options.baseURL.allowedHosts;
		const proto = options.baseURL.protocol;
		for (const host of allowedHosts) if (!host.includes("://")) {
			if (!proto || proto === "https" || proto === "auto") trustedOrigins.push(`https://${host}`);
			if (proto === "http" || proto === "auto" || isLoopbackHost(host)) trustedOrigins.push(`http://${host}`);
		} else trustedOrigins.push(host);
		if (options.baseURL.fallback) try {
			trustedOrigins.push(new URL(options.baseURL.fallback).origin);
		} catch {}
	} else {
		const baseURL = getBaseURL(typeof options.baseURL === "string" ? options.baseURL : void 0, options.basePath, request);
		if (baseURL) trustedOrigins.push(new URL(baseURL).origin);
	}
	if (options.trustedOrigins) {
		if (Array.isArray(options.trustedOrigins)) trustedOrigins.push(...options.trustedOrigins);
		if (typeof options.trustedOrigins === "function") {
			const validOrigins = await options.trustedOrigins(request);
			trustedOrigins.push(...validOrigins);
		}
	}
	const envTrustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS;
	if (envTrustedOrigins) trustedOrigins.push(...envTrustedOrigins.split(","));
	return trustedOrigins.filter((v) => Boolean(v));
}
/**
* Picks a `Request`-like or `Headers` value from a direct `auth.api` call.
* Headers are only accepted when they carry a host: without one, host
* resolution would fall back to `null` and the caller should use `fallback`
* or pass a `Request` instead.
*/
function pickSource(input) {
	if (isRequestLike(input?.request)) return input.request;
	if (!input?.headers) return void 0;
	const headers = input.headers instanceof Headers ? input.headers : new Headers(input.headers);
	if (!headers.has("host") && !headers.has("x-forwarded-host")) return;
	return headers;
}
/**
* Returns the effective `trustedProxyHeaders` value for dynamic `baseURL`
* resolution. When the user hasn't set `advanced.trustedProxyHeaders`,
* proxy headers (`x-forwarded-host` / `x-forwarded-proto`) are trusted by
* default so deployments behind a reverse proxy work without extra config.
*/
function resolveDynamicTrustedProxyHeaders(options) {
	return options.advanced?.trustedProxyHeaders ?? true;
}
/**
* Per-request clone with `baseURL`, `trustedOrigins`, `trustedProviders`
* and cookies rehydrated for the resolved host. Throws `BetterAuthError`
* when the URL cannot be resolved; callers on the direct-API path convert
* this to `APIError`.
*/
async function resolveRequestContext(ctx, source, trustedProxyHeaders) {
	const dynamicBaseURLConfig = ctx.options.baseURL;
	const baseURL = resolveBaseURL(dynamicBaseURLConfig, ctx.options.basePath || "/api/auth", source, void 0, trustedProxyHeaders);
	if (!baseURL) throw new BetterAuthError("Could not resolve base URL from request. Check your allowedHosts config.");
	const resolved = Object.create(Object.getPrototypeOf(ctx), Object.getOwnPropertyDescriptors(ctx));
	resolved.baseURL = baseURL;
	resolved.options = {
		...ctx.options,
		baseURL: getOrigin(baseURL) || void 0
	};
	const trustedOriginOptions = {
		...resolved.options,
		baseURL: dynamicBaseURLConfig
	};
	const needsRequest = typeof ctx.options.trustedOrigins === "function" || typeof ctx.options.account?.accountLinking?.trustedProviders === "function";
	let callbackRequest;
	if (needsRequest) if (isRequestLike(source)) callbackRequest = source;
	else if (source) callbackRequest = new Request(baseURL, { headers: source });
	else callbackRequest = void 0;
	else callbackRequest = void 0;
	resolved.trustedOrigins = await getTrustedOrigins(trustedOriginOptions, callbackRequest);
	resolved.trustedProviders = await getTrustedProviders(resolved.options, callbackRequest);
	if (ctx.options.advanced?.crossSubDomainCookies?.enabled) {
		resolved.authCookies = getCookies(resolved.options);
		resolved.createAuthCookie = createCookieGetter(resolved.options);
	}
	return resolved;
}
async function getAwaitableValue(arr, item) {
	if (!arr) return void 0;
	for (const val of arr) {
		const value = typeof val === "function" ? await val() : val;
		if (value[item.field ?? "id"] === item.value) return value;
	}
}
async function getTrustedProviders(options, request) {
	const trustedProviders = options.account?.accountLinking?.trustedProviders;
	if (!trustedProviders) return [];
	if (Array.isArray(trustedProviders)) return trustedProviders.filter((v) => Boolean(v));
	return (await trustedProviders(request) ?? []).filter((v) => Boolean(v));
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/oauth2/utils.mjs
/**
* Check if a string looks like encrypted data
*/
function isLikelyEncrypted(token) {
	if (token.startsWith("$ba$")) return true;
	return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token);
}
function decryptOAuthToken(token, ctx) {
	if (!token) return token;
	if (ctx.options.account?.encryptOAuthTokens) {
		if (!isLikelyEncrypted(token)) return token;
		return symmetricDecrypt({
			key: ctx.secretConfig,
			data: token
		});
	}
	return token;
}
function setTokenUtil(token, ctx) {
	if (ctx.options.account?.encryptOAuthTokens && token) return symmetricEncrypt({
		key: ctx.secretConfig,
		data: token
	});
	return token;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/email-verification.mjs
async function createEmailVerificationToken(secret, email, updateTo, expiresIn = 3600, extraPayload) {
	return await signJWT({
		email: email.toLowerCase(),
		updateTo: updateTo?.toLowerCase(),
		...extraPayload
	}, secret, expiresIn);
}
/**
* A function to send a verification email to the user
*/
async function sendVerificationEmailFn(ctx, user) {
	if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
		ctx.context.logger.error("Verification email isn't enabled.");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.VERIFICATION_EMAIL_NOT_ENABLED);
	}
	const token = await createEmailVerificationToken(ctx.context.secret, user.email, void 0, ctx.context.options.emailVerification?.expiresIn);
	const callbackURL = ctx.body.callbackURL ? encodeURIComponent(ctx.body.callbackURL) : encodeURIComponent("/");
	const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
	await ctx.context.options.emailVerification.sendVerificationEmail({
		user,
		url,
		token
	}, ctx.request);
}
var sendVerificationEmail = createAuthEndpoint("/send-verification-email", {
	method: "POST",
	operationId: "sendVerificationEmail",
	cloneRequest: true,
	body: z$1.object({
		email: z$1.email().meta({ description: "The email to send the verification email to" }),
		callbackURL: z$1.string().meta({ description: "The URL to use for email verification callback" }).optional()
	}),
	metadata: { openapi: {
		operationId: "sendVerificationEmail",
		description: "Send a verification email to the user",
		requestBody: { content: { "application/json": { schema: {
			type: "object",
			properties: {
				email: {
					type: "string",
					description: "The email to send the verification email to",
					example: "user@example.com"
				},
				callbackURL: {
					type: "string",
					description: "The URL to use for email verification callback",
					example: "https://example.com/callback",
					nullable: true
				}
			},
			required: ["email"]
		} } } },
		responses: {
			"200": {
				description: "Success",
				content: { "application/json": { schema: {
					type: "object",
					properties: { status: {
						type: "boolean",
						description: "Indicates if the email was sent successfully",
						example: true
					} }
				} } }
			},
			"400": {
				description: "Bad Request",
				content: { "application/json": { schema: {
					type: "object",
					properties: { message: {
						type: "string",
						description: "Error message",
						example: "Verification email isn't enabled"
					} }
				} } }
			}
		}
	} }
}, async (ctx) => {
	if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
		ctx.context.logger.error("Verification email isn't enabled.");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.VERIFICATION_EMAIL_NOT_ENABLED);
	}
	const { email } = ctx.body;
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		/**
		* Enforce a constant-time floor so an attacker cannot distinguish
		* "email not found / already verified" (fast local JWT sign) from
		* "email found and unverified" (slow external email-send) by
		* comparing response times.
		*/
		const MINIMUM_MS = 500;
		const start = Date.now();
		const user = await ctx.context.internalAdapter.findUserByEmail(email);
		let error;
		if (!user || user.user.emailVerified) await createEmailVerificationToken(ctx.context.secret, email, void 0, ctx.context.options.emailVerification?.expiresIn);
		else try {
			await sendVerificationEmailFn(ctx, user.user);
		} catch (e) {
			error = e;
		}
		const remaining = MINIMUM_MS - (Date.now() - start);
		if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
		if (error) throw error;
		return ctx.json({ status: true });
	}
	if (session?.user.email.toLowerCase() !== email.toLowerCase()) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.EMAIL_MISMATCH);
	if (session?.user.emailVerified) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.EMAIL_ALREADY_VERIFIED);
	await sendVerificationEmailFn(ctx, session.user);
	return ctx.json({ status: true });
});
var verifyEmail = createAuthEndpoint("/verify-email", {
	method: "GET",
	operationId: "verifyEmail",
	query: z$1.object({
		token: z$1.string().meta({ description: "The token to verify the email" }),
		callbackURL: z$1.string().meta({ description: "The URL to redirect to after email verification" }).optional()
	}),
	use: [originCheck((ctx) => ctx.query.callbackURL)],
	metadata: { openapi: {
		description: "Verify the email of the user",
		parameters: [{
			name: "token",
			in: "query",
			description: "The token to verify the email",
			required: true,
			schema: { type: "string" }
		}, {
			name: "callbackURL",
			in: "query",
			description: "The URL to redirect to after email verification",
			required: false,
			schema: { type: "string" }
		}],
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					user: {
						type: "object",
						$ref: "#/components/schemas/User"
					},
					status: {
						type: "boolean",
						description: "Indicates if the email was verified successfully"
					}
				},
				required: ["user", "status"]
			} } }
		} }
	} }
}, async (ctx) => {
	function redirectOnError(error) {
		if (ctx.query.callbackURL) {
			if (ctx.query.callbackURL.includes("?")) throw ctx.redirect(`${ctx.query.callbackURL}&error=${error.code}`);
			throw ctx.redirect(`${ctx.query.callbackURL}?error=${error.code}`);
		}
		throw APIError.from("UNAUTHORIZED", error);
	}
	const { token } = ctx.query;
	let jwt;
	try {
		jwt = await jwtVerify(token, new TextEncoder().encode(ctx.context.secret), { algorithms: ["HS256"] });
	} catch (e) {
		if (e instanceof JWTExpired) return redirectOnError(BASE_ERROR_CODES.TOKEN_EXPIRED);
		return redirectOnError(BASE_ERROR_CODES.INVALID_TOKEN);
	}
	const parsed = z$1.object({
		email: z$1.email(),
		updateTo: z$1.string().optional(),
		requestType: z$1.string().optional()
	}).parse(jwt.payload);
	const user = await ctx.context.internalAdapter.findUserByEmail(parsed.email);
	if (!user) return redirectOnError(BASE_ERROR_CODES.USER_NOT_FOUND);
	if (parsed.updateTo) {
		const session = await getSessionFromCtx(ctx);
		if (session && session.user.email !== parsed.email) return redirectOnError(BASE_ERROR_CODES.INVALID_USER);
		switch (parsed.requestType) {
			case "change-email-confirmation": {
				const newToken = await createEmailVerificationToken(ctx.context.secret, parsed.email, parsed.updateTo, ctx.context.options.emailVerification?.expiresIn, { requestType: "change-email-verification" });
				const updateCallbackURL = ctx.query.callbackURL ? encodeURIComponent(ctx.query.callbackURL) : encodeURIComponent("/");
				const url = `${ctx.context.baseURL}/verify-email?token=${newToken}&callbackURL=${updateCallbackURL}`;
				if (ctx.context.options.emailVerification?.sendVerificationEmail) await ctx.context.runInBackgroundOrAwait(ctx.context.options.emailVerification.sendVerificationEmail({
					user: {
						...user.user,
						email: parsed.updateTo
					},
					url,
					token: newToken
				}, ctx.request?.clone()));
				if (ctx.query.callbackURL) throw ctx.redirect(ctx.query.callbackURL);
				return ctx.json({ status: true });
			}
			case "change-email-verification": {
				let activeSession = session;
				if (!activeSession) {
					const newSession = await ctx.context.internalAdapter.createSession(user.user.id);
					if (!newSession) throw APIError.from("INTERNAL_SERVER_ERROR", BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION);
					activeSession = {
						session: newSession,
						user: user.user
					};
				}
				const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(parsed.email, {
					email: parsed.updateTo,
					emailVerified: true
				});
				if (ctx.context.options.emailVerification?.afterEmailVerification) await ctx.context.options.emailVerification.afterEmailVerification(updatedUser, ctx.request);
				await setSessionCookie(ctx, {
					session: activeSession.session,
					user: {
						...activeSession.user,
						email: parsed.updateTo,
						emailVerified: true
					}
				});
				if (ctx.query.callbackURL) throw ctx.redirect(ctx.query.callbackURL);
				return ctx.json({
					status: true,
					user: parseUserOutput(ctx.context.options, updatedUser)
				});
			}
			default: {
				let activeSession = session;
				if (!activeSession) {
					const newSession = await ctx.context.internalAdapter.createSession(user.user.id);
					if (!newSession) throw APIError.from("INTERNAL_SERVER_ERROR", BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION);
					activeSession = {
						session: newSession,
						user: user.user
					};
				}
				const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(parsed.email, {
					email: parsed.updateTo,
					emailVerified: false
				});
				const newToken = await createEmailVerificationToken(ctx.context.secret, parsed.updateTo);
				const updateCallbackURL = ctx.query.callbackURL ? encodeURIComponent(ctx.query.callbackURL) : encodeURIComponent("/");
				if (ctx.context.options.emailVerification?.sendVerificationEmail) await ctx.context.runInBackgroundOrAwait(ctx.context.options.emailVerification.sendVerificationEmail({
					user: updatedUser,
					url: `${ctx.context.baseURL}/verify-email?token=${newToken}&callbackURL=${updateCallbackURL}`,
					token: newToken
				}, ctx.request?.clone()));
				await setSessionCookie(ctx, {
					session: activeSession.session,
					user: {
						...activeSession.user,
						email: parsed.updateTo,
						emailVerified: false
					}
				});
				if (ctx.query.callbackURL) throw ctx.redirect(ctx.query.callbackURL);
				return ctx.json({
					status: true,
					user: parseUserOutput(ctx.context.options, updatedUser)
				});
			}
		}
	}
	if (user.user.emailVerified) {
		if (ctx.query.callbackURL) throw ctx.redirect(ctx.query.callbackURL);
		return ctx.json({
			status: true,
			user: null
		});
	}
	if (ctx.context.options.emailVerification?.beforeEmailVerification) await ctx.context.options.emailVerification.beforeEmailVerification(user.user, ctx.request);
	const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(parsed.email, { emailVerified: true });
	if (ctx.context.options.emailVerification?.afterEmailVerification) await ctx.context.options.emailVerification.afterEmailVerification(updatedUser, ctx.request);
	if (ctx.context.options.emailVerification?.autoSignInAfterVerification) {
		const currentSession = await getSessionFromCtx(ctx);
		if (!currentSession || currentSession.user.email !== parsed.email) {
			const session = await ctx.context.internalAdapter.createSession(user.user.id);
			if (!session) throw APIError.from("INTERNAL_SERVER_ERROR", BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION);
			await setSessionCookie(ctx, {
				session,
				user: {
					...user.user,
					emailVerified: true
				}
			});
		} else await setSessionCookie(ctx, {
			session: currentSession.session,
			user: {
				...currentSession.user,
				emailVerified: true
			}
		});
	}
	if (ctx.query.callbackURL) throw ctx.redirect(ctx.query.callbackURL);
	return ctx.json({
		status: true,
		user: null
	});
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/oauth2/link-account.mjs
async function handleOAuthUserInfo(c, opts) {
	const { userInfo, account, callbackURL, disableSignUp, overrideUserInfo } = opts;
	const dbUser = await c.context.internalAdapter.findOAuthUser(userInfo.email.toLowerCase(), account.accountId, account.providerId).catch((e) => {
		c.context.logger.error("Better auth was unable to query your database.\nError: ", e);
		redirectOnError(c, c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`, "internal_server_error");
	});
	let user = dbUser?.user;
	const isRegister = !user;
	if (dbUser) {
		const linkedAccount = dbUser.linkedAccount ?? dbUser.accounts.find((acc) => acc.providerId === account.providerId && acc.accountId === account.accountId);
		if (!linkedAccount) {
			const accountLinking = c.context.options.account?.accountLinking;
			const isTrustedProvider = opts.isTrustedProvider || opts.trustProviderByName !== false && c.context.trustedProviders.includes(account.providerId);
			const requireLocalEmailVerified = accountLinking?.requireLocalEmailVerified ?? true;
			if (!isTrustedProvider && !userInfo.emailVerified || requireLocalEmailVerified && !dbUser.user.emailVerified || accountLinking?.enabled === false || accountLinking?.disableImplicitLinking === true) {
				if (isDevelopment()) c.context.logger.warn(`User already exist but account isn't linked to ${account.providerId}. To read more about how account linking works in Better Auth see https://www.better-auth.com/docs/concepts/users-accounts#account-linking.`);
				return {
					error: "account not linked",
					data: null
				};
			}
			try {
				await c.context.internalAdapter.linkAccount({
					providerId: account.providerId,
					accountId: userInfo.id.toString(),
					userId: dbUser.user.id,
					accessToken: await setTokenUtil(account.accessToken, c.context),
					refreshToken: await setTokenUtil(account.refreshToken, c.context),
					idToken: account.idToken,
					accessTokenExpiresAt: account.accessTokenExpiresAt,
					refreshTokenExpiresAt: account.refreshTokenExpiresAt,
					scope: account.scope
				});
			} catch (e) {
				c.context.logger.error("Unable to link account", e);
				return {
					error: "unable to link account",
					data: null
				};
			}
			if (userInfo.emailVerified && !dbUser.user.emailVerified && userInfo.email.toLowerCase() === dbUser.user.email) await c.context.internalAdapter.updateUser(dbUser.user.id, { emailVerified: true });
			user = await applyUpdateUserInfoOnLink(c, dbUser.user.id, userInfo) ?? user;
		} else {
			const freshTokens = c.context.options.account?.updateAccountOnSignIn !== false ? Object.fromEntries(Object.entries({
				idToken: account.idToken,
				accessToken: await setTokenUtil(account.accessToken, c.context),
				refreshToken: await setTokenUtil(account.refreshToken, c.context),
				accessTokenExpiresAt: account.accessTokenExpiresAt,
				refreshTokenExpiresAt: account.refreshTokenExpiresAt,
				scope: account.scope
			}).filter(([_, value]) => value !== void 0)) : {};
			if (c.context.options.account?.storeAccountCookie) await setAccountCookie(c, {
				...linkedAccount,
				...freshTokens
			});
			if (Object.keys(freshTokens).length > 0) await c.context.internalAdapter.updateAccount(linkedAccount.id, freshTokens);
			if (userInfo.emailVerified && !dbUser.user.emailVerified && userInfo.email.toLowerCase() === dbUser.user.email) await c.context.internalAdapter.updateUser(dbUser.user.id, { emailVerified: true });
		}
		if (overrideUserInfo) {
			const { id: _id, email: _email, emailVerified: _emailVerified, name, image, ...providerProfile } = userInfo;
			const additionalUserFields = parseAdditionalUserInputFromProviderProfile(c.context.options, providerProfile, "update");
			user = await c.context.internalAdapter.updateUser(dbUser.user.id, {
				name,
				image,
				...additionalUserFields,
				email: userInfo.email.toLowerCase(),
				emailVerified: userInfo.email.toLowerCase() === dbUser.user.email ? dbUser.user.emailVerified || userInfo.emailVerified : userInfo.emailVerified
			});
		}
	} else {
		if (disableSignUp) return {
			error: "signup disabled",
			data: null,
			isRegister: false
		};
		try {
			const { id: _id, email: _email, emailVerified: _emailVerified, name, image, ...providerProfile } = userInfo;
			const additionalUserFields = parseAdditionalUserInputFromProviderProfile(c.context.options, providerProfile, "create");
			const accountData = {
				accessToken: await setTokenUtil(account.accessToken, c.context),
				refreshToken: await setTokenUtil(account.refreshToken, c.context),
				idToken: account.idToken,
				accessTokenExpiresAt: account.accessTokenExpiresAt,
				refreshTokenExpiresAt: account.refreshTokenExpiresAt,
				scope: account.scope,
				providerId: account.providerId,
				accountId: userInfo.id.toString()
			};
			const { user: createdUser, account: createdAccount } = await c.context.internalAdapter.createOAuthUser({
				name,
				image,
				...additionalUserFields,
				email: userInfo.email.toLowerCase(),
				emailVerified: userInfo.emailVerified
			}, accountData);
			user = createdUser;
			if (c.context.options.account?.storeAccountCookie) await setAccountCookie(c, createdAccount);
			if (!userInfo.emailVerified && user && c.context.options.emailVerification?.sendOnSignUp && c.context.options.emailVerification?.sendVerificationEmail) {
				const token = await createEmailVerificationToken(c.context.secret, user.email, void 0, c.context.options.emailVerification?.expiresIn);
				const url = `${c.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(callbackURL || "/")}`;
				await c.context.runInBackgroundOrAwait(c.context.options.emailVerification.sendVerificationEmail({
					user,
					url,
					token
				}, c.request));
			}
		} catch (e) {
			c.context.logger.error(e);
			if (isAPIError(e)) return {
				error: e.message,
				data: null,
				isRegister: false
			};
			return {
				error: "unable to create user",
				data: null,
				isRegister: false
			};
		}
	}
	if (!user) return {
		error: "unable to create user",
		data: null,
		isRegister: false
	};
	const session = await c.context.internalAdapter.createSession(user.id);
	if (!session) return {
		error: "unable to create session",
		data: null,
		isRegister: false
	};
	return {
		data: {
			session,
			user
		},
		error: null,
		isRegister
	};
}
/**
* Apply the `account.accountLinking.updateUserInfoOnLink` policy: when enabled,
* copy the freshly linked provider's profile onto the local user, matching the
* field set persisted on sign-up. The local `email` and `emailVerified` are
* never changed, so a link can't rebind the account's identity, and
* `updateUser` drops `undefined` fields, so a provider that omits one leaves
* the existing column intact.
*
* Returns the updated user so a caller that issues a session can seed the
* cookie cache with the fresh row. Returns `undefined` when the policy is
* disabled or the update fails: a failed profile sync must not abort the link.
*/
async function applyUpdateUserInfoOnLink(c, userId, userInfo) {
	if (c.context.options.account?.accountLinking?.updateUserInfoOnLink !== true) return;
	try {
		const { id: _id, email: _email, emailVerified: _emailVerified, name, image, ...providerProfile } = userInfo;
		const additionalUserFields = parseAdditionalUserInputFromProviderProfile(c.context.options, providerProfile, "update");
		return await c.context.internalAdapter.updateUser(userId, {
			name,
			image,
			...additionalUserFields
		});
	} catch (e) {
		c.context.logger.warn("Could not update user info on account link", e);
		return;
	}
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/oauth2/utils.mjs
function getOAuth2Tokens(data) {
	const getDate = (seconds) => {
		return new Date((/* @__PURE__ */ new Date()).getTime() + seconds * 1e3);
	};
	return {
		tokenType: data.token_type,
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		accessTokenExpiresAt: data.expires_in ? getDate(data.expires_in) : void 0,
		refreshTokenExpiresAt: data.refresh_token_expires_in ? getDate(data.refresh_token_expires_in) : void 0,
		scopes: data?.scope ? typeof data.scope === "string" ? data.scope.split(" ") : data.scope : [],
		idToken: data.id_token,
		raw: data
	};
}
/**
* Return the provider's primary Client ID: the single string, or the entry at
* array index 0 for the cross-platform form used by ID token audience
* verification. Index 0 is the designated primary and pairs with
* `clientSecret` for the authorization code flow; later array entries are
* only used as additional accepted audiences. Returns `undefined` when the
* primary value is missing or an empty string.
*/
function getPrimaryClientId(clientId) {
	const value = Array.isArray(clientId) ? clientId[0] : clientId;
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
async function generateCodeChallenge(codeVerifier) {
	const data = new TextEncoder().encode(codeVerifier);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return base64Url.encode(new Uint8Array(hash), { padding: false });
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/oauth2/create-authorization-url.mjs
async function createAuthorizationURL({ id, options, authorizationEndpoint, state, codeVerifier, scopes, claims, redirectURI, duration, prompt, accessType, responseType, display, loginHint, hd, responseMode, additionalParams, scopeJoiner }) {
	options = typeof options === "function" ? await options() : options;
	const url = new URL(options.authorizationEndpoint || authorizationEndpoint);
	url.searchParams.set("response_type", responseType || "code");
	const primaryClientId = Array.isArray(options.clientId) ? options.clientId[0] : options.clientId;
	url.searchParams.set("client_id", primaryClientId);
	url.searchParams.set("state", state);
	if (scopes) url.searchParams.set("scope", scopes.join(scopeJoiner || " "));
	url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);
	duration && url.searchParams.set("duration", duration);
	display && url.searchParams.set("display", display);
	loginHint && url.searchParams.set("login_hint", loginHint);
	prompt && url.searchParams.set("prompt", prompt);
	hd && url.searchParams.set("hd", hd);
	accessType && url.searchParams.set("access_type", accessType);
	responseMode && url.searchParams.set("response_mode", responseMode);
	if (codeVerifier) {
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("code_challenge", codeChallenge);
	}
	if (claims) {
		const claimsObj = claims.reduce((acc, claim) => {
			acc[claim] = null;
			return acc;
		}, {});
		url.searchParams.set("claims", JSON.stringify({ id_token: {
			email: null,
			email_verified: null,
			...claimsObj
		} }));
	}
	if (additionalParams) Object.entries(additionalParams).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/oauth2/reject-redirects.mjs
var HTTP_REDIRECT_STATUSES = /* @__PURE__ */ new Set([
	301,
	302,
	303,
	307,
	308
]);
/**
* Whether a response from a `redirect: "manual"` fetch is a redirect.
*
* Node/undici exposes the real 3xx status. Spec-compliant runtimes (Cloudflare
* Workers, Deno, browsers) return an opaque-redirect filtered response with
* status 0 and type `"opaqueredirect"`, so the status alone is not enough.
*/
function isRedirectResponse(response) {
	return response.type === "opaqueredirect" || HTTP_REDIRECT_STATUSES.has(response.status);
}
function redirectRefused(endpoint) {
	return new BetterAuthError(`The OAuth endpoint "${endpoint}" returned an HTTP redirect. Server-side OAuth fetches refuse redirects to prevent SSRF; configure the final endpoint URL.`);
}
/**
* Fetch option that refuses HTTP redirects portably.
*
* Cloudflare Workers (workerd) rejects `redirect: "error"`, so manual mode is
* used and the resolved response is checked with {@link assertResponseNotRedirect}
* (or, for betterFetch, with {@link fetchRefusingRedirects}).
*/
var NO_FOLLOW_REDIRECT = { redirect: "manual" };
/**
* betterFetch that refuses HTTP redirects on a server-side OAuth fetch.
*
* Returns the betterFetch result and throws if the endpoint redirected, on both
* undici (real 3xx status) and spec-compliant runtimes (opaque redirect, where
* the error status is 0). The redirect is never followed on any runtime.
*/
async function fetchRefusingRedirects(url, options) {
	let redirected = false;
	const result = await betterFetch(url, {
		...options,
		...NO_FOLLOW_REDIRECT,
		onError(context) {
			if (isRedirectResponse(context.response)) redirected = true;
		}
	});
	if (redirected) throw redirectRefused(url);
	return result;
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/oauth2/refresh-access-token.mjs
/**
* @deprecated use async'd refreshAccessTokenRequest instead
*/
function createRefreshAccessTokenRequest({ refreshToken, options, authentication, extraParams, resource }) {
	const body = new URLSearchParams();
	const headers = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json"
	};
	body.set("grant_type", "refresh_token");
	body.set("refresh_token", refreshToken);
	if (authentication === "basic") {
		const primaryClientId = Array.isArray(options.clientId) ? options.clientId[0] : options.clientId;
		if (primaryClientId) headers["authorization"] = "Basic " + base64.encode(`${primaryClientId}:${options.clientSecret ?? ""}`);
		else headers["authorization"] = "Basic " + base64.encode(`:${options.clientSecret ?? ""}`);
	} else {
		const primaryClientId = Array.isArray(options.clientId) ? options.clientId[0] : options.clientId;
		body.set("client_id", primaryClientId);
		if (options.clientSecret) body.set("client_secret", options.clientSecret);
	}
	if (resource) if (typeof resource === "string") body.append("resource", resource);
	else for (const _resource of resource) body.append("resource", _resource);
	if (extraParams) for (const [key, value] of Object.entries(extraParams)) body.set(key, value);
	return {
		body,
		headers
	};
}
async function refreshAccessToken({ refreshToken, options, tokenEndpoint, authentication, extraParams }) {
	const { body, headers } = await createRefreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		extraParams
	});
	const { data, error } = await fetchRefusingRedirects(tokenEndpoint, {
		method: "POST",
		body,
		headers
	});
	if (error) throw error;
	const tokens = {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		tokenType: data.token_type,
		scopes: data.scope?.split(" "),
		idToken: data.id_token
	};
	if (data.expires_in) tokens.accessTokenExpiresAt = new Date((/* @__PURE__ */ new Date()).getTime() + data.expires_in * 1e3);
	if (data.refresh_token_expires_in) tokens.refreshTokenExpiresAt = new Date((/* @__PURE__ */ new Date()).getTime() + data.refresh_token_expires_in * 1e3);
	return tokens;
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/oauth2/validate-authorization-code.mjs
async function authorizationCodeRequest({ code, codeVerifier, redirectURI, options, authentication, deviceId, headers, additionalParams = {}, resource }) {
	options = typeof options === "function" ? await options() : options;
	return createAuthorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		authentication,
		deviceId,
		headers,
		additionalParams,
		resource
	});
}
/**
* @deprecated use async'd authorizationCodeRequest instead
*/
function createAuthorizationCodeRequest({ code, codeVerifier, redirectURI, options, authentication, deviceId, headers, additionalParams = {}, resource }) {
	const body = new URLSearchParams();
	const requestHeaders = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
		...headers
	};
	body.set("grant_type", "authorization_code");
	body.set("code", code);
	codeVerifier && body.set("code_verifier", codeVerifier);
	options.clientKey && body.set("client_key", options.clientKey);
	deviceId && body.set("device_id", deviceId);
	body.set("redirect_uri", options.redirectURI || redirectURI);
	if (resource) if (typeof resource === "string") body.append("resource", resource);
	else for (const _resource of resource) body.append("resource", _resource);
	if (authentication === "basic") {
		const primaryClientId = Array.isArray(options.clientId) ? options.clientId[0] : options.clientId;
		requestHeaders["authorization"] = `Basic ${base64.encode(`${primaryClientId}:${options.clientSecret ?? ""}`)}`;
	} else {
		const primaryClientId = Array.isArray(options.clientId) ? options.clientId[0] : options.clientId;
		body.set("client_id", primaryClientId);
		if (options.clientSecret) body.set("client_secret", options.clientSecret);
	}
	for (const [key, value] of Object.entries(additionalParams)) if (!body.has(key)) body.append(key, value);
	return {
		body,
		headers: requestHeaders
	};
}
async function validateAuthorizationCode({ code, codeVerifier, redirectURI, options, tokenEndpoint, authentication, deviceId, headers, additionalParams = {}, resource }) {
	const { body, headers: requestHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		authentication,
		deviceId,
		headers,
		additionalParams,
		resource
	});
	const { data, error } = await fetchRefusingRedirects(tokenEndpoint, {
		method: "POST",
		body,
		headers: requestHeaders
	});
	if (error) throw error;
	return getOAuth2Tokens(data);
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/apple.mjs
async function sha256Hex$1(value) {
	const data = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function nonceMatches(jwtNonce, nonce) {
	if (typeof jwtNonce !== "string") return false;
	if (jwtNonce === nonce) return true;
	return jwtNonce === await sha256Hex$1(nonce);
}
var apple = (options) => {
	const tokenEndpoint = "https://appleid.apple.com/auth/token";
	return {
		id: "apple",
		name: "Apple",
		async createAuthorizationURL({ state, scopes, redirectURI }) {
			if (!getPrimaryClientId(options.clientId) || !options.clientSecret) {
				logger.error("Client ID and client secret are required for Apple. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			const _scope = options.disableDefaultScope ? [] : ["email", "name"];
			if (options.scope) _scope.push(...options.scope);
			if (scopes) _scope.push(...scopes);
			return await createAuthorizationURL({
				id: "apple",
				options,
				authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
				scopes: _scope,
				state,
				redirectURI,
				responseMode: "form_post",
				responseType: "code id_token"
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) return options.verifyIdToken(token, nonce);
			try {
				const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
				if (!kid || !jwtAlg) return false;
				const { payload: jwtClaims } = await jwtVerify(token, await getApplePublicKey(kid), {
					algorithms: [jwtAlg],
					issuer: "https://appleid.apple.com",
					audience: options.audience && options.audience.length ? options.audience : options.appBundleIdentifier ? options.appBundleIdentifier : options.clientId,
					maxTokenAge: "1h"
				});
				["email_verified", "is_private_email"].forEach((field) => {
					if (jwtClaims[field] !== void 0) jwtClaims[field] = Boolean(jwtClaims[field]);
				});
				if (nonce && !await nonceMatches(jwtClaims.nonce, nonce)) return false;
				return !!jwtClaims;
			} catch {
				return false;
			}
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options,
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (!token.idToken) return null;
			const profile = decodeJwt(token.idToken);
			if (!profile) return null;
			let name;
			if (token.user?.name) name = `${token.user.name.firstName || ""} ${token.user.name.lastName || ""}`.trim();
			else name = profile.name || "";
			const emailVerified = typeof profile.email_verified === "boolean" ? profile.email_verified : profile.email_verified === "true";
			const enrichedProfile = {
				...profile,
				name
			};
			const userMap = await options.mapProfileToUser?.(enrichedProfile);
			return {
				user: {
					id: profile.sub,
					name: enrichedProfile.name,
					emailVerified,
					email: profile.email,
					...userMap
				},
				data: enrichedProfile
			};
		},
		options
	};
};
var getApplePublicKey = async (kid) => {
	const { data } = await betterFetch(`https://appleid.apple.com/auth/keys`);
	if (!data?.keys) throw new APIError("BAD_REQUEST", { message: "Keys not found" });
	const jwk = data.keys.find((key) => key.kid === kid);
	if (!jwk) throw new Error(`JWK with kid ${kid} not found`);
	return await importJWK(jwk, jwk.alg);
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/atlassian.mjs
var atlassian = (options) => {
	const tokenEndpoint = "https://auth.atlassian.com/oauth/token";
	return {
		id: "atlassian",
		name: "Atlassian",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error("Client Id and Secret are required for Atlassian");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) throw new BetterAuthError("codeVerifier is required for Atlassian");
			const _scopes = options.disableDefaultScope ? [] : ["read:jira-user", "offline_access"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "atlassian",
				options,
				authorizationEndpoint: "https://auth.atlassian.com/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				additionalParams: { audience: "api.atlassian.com" },
				prompt: options.prompt
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (!token.accessToken) return null;
			try {
				const { data: profile } = await betterFetch("https://api.atlassian.com/me", { headers: { Authorization: `Bearer ${token.accessToken}` } });
				if (!profile) return null;
				const userMap = await options.mapProfileToUser?.(profile);
				return {
					user: {
						id: profile.account_id,
						name: profile.name,
						email: profile.email,
						image: profile.picture,
						emailVerified: false,
						...userMap
					},
					data: profile
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Figma:", error);
				return null;
			}
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/cognito.mjs
var cognito = (options) => {
	if (!options.domain || !options.region || !options.userPoolId) {
		logger.error("Domain, region and userPoolId are required for Amazon Cognito. Make sure to provide them in the options.");
		throw new BetterAuthError("DOMAIN_AND_REGION_REQUIRED");
	}
	const cleanDomain = options.domain.replace(/^https?:\/\//, "");
	const authorizationEndpoint = `https://${cleanDomain}/oauth2/authorize`;
	const tokenEndpoint = `https://${cleanDomain}/oauth2/token`;
	const userInfoEndpoint = `https://${cleanDomain}/oauth2/userinfo`;
	return {
		id: "cognito",
		name: "Cognito",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!getPrimaryClientId(options.clientId)) {
				logger.error("ClientId is required for Amazon Cognito. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (options.requireClientSecret && !options.clientSecret) {
				logger.error("Client Secret is required when requireClientSecret is true. Make sure to provide it in the options.");
				throw new BetterAuthError("CLIENT_SECRET_REQUIRED");
			}
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"profile",
				"email"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const url = await createAuthorizationURL({
				id: "cognito",
				options: { ...options },
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt
			});
			const scopeValue = url.searchParams.get("scope");
			if (scopeValue) {
				url.searchParams.delete("scope");
				const encodedScope = encodeURIComponent(scopeValue);
				const urlString = url.toString();
				const separator = urlString.includes("?") ? "&" : "?";
				return new URL(`${urlString}${separator}scope=${encodedScope}`);
			}
			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) return options.verifyIdToken(token, nonce);
			try {
				const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
				if (!kid || !jwtAlg) return false;
				const publicKey = await getCognitoPublicKey(kid, options.region, options.userPoolId);
				const expectedIssuer = `https://cognito-idp.${options.region}.amazonaws.com/${options.userPoolId}`;
				const { payload: jwtClaims } = await jwtVerify(token, publicKey, {
					algorithms: [jwtAlg],
					issuer: expectedIssuer,
					audience: options.clientId,
					maxTokenAge: "1h"
				});
				if (nonce && jwtClaims.nonce !== nonce) return false;
				return true;
			} catch (error) {
				logger.error("Failed to verify ID token:", error);
				return false;
			}
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (token.idToken) try {
				const profile = decodeJwt(token.idToken);
				if (!profile) return null;
				const name = profile.name || profile.given_name || profile.username || "";
				const enrichedProfile = {
					...profile,
					name
				};
				const userMap = await options.mapProfileToUser?.(enrichedProfile);
				return {
					user: {
						id: profile.sub,
						name: enrichedProfile.name,
						email: profile.email,
						image: profile.picture,
						emailVerified: profile.email_verified,
						...userMap
					},
					data: enrichedProfile
				};
			} catch (error) {
				logger.error("Failed to decode ID token:", error);
			}
			if (token.accessToken) try {
				const { data: userInfo } = await betterFetch(userInfoEndpoint, { headers: { Authorization: `Bearer ${token.accessToken}` } });
				if (userInfo) {
					const userMap = await options.mapProfileToUser?.(userInfo);
					return {
						user: {
							id: userInfo.sub,
							name: userInfo.name || userInfo.given_name || userInfo.username || "",
							email: userInfo.email,
							image: userInfo.picture,
							emailVerified: userInfo.email_verified,
							...userMap
						},
						data: userInfo
					};
				}
			} catch (error) {
				logger.error("Failed to fetch user info from Cognito:", error);
			}
			return null;
		},
		options
	};
};
var getCognitoPublicKey = async (kid, region, userPoolId) => {
	const COGNITO_JWKS_URI = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
	try {
		const { data } = await betterFetch(COGNITO_JWKS_URI);
		if (!data?.keys) throw new APIError("BAD_REQUEST", { message: "Keys not found" });
		const jwk = data.keys.find((key) => key.kid === kid);
		if (!jwk) throw new Error(`JWK with kid ${kid} not found`);
		return await importJWK(jwk, jwk.alg);
	} catch (error) {
		logger.error("Failed to fetch Cognito public key:", error);
		throw error;
	}
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/discord.mjs
var discord = (options) => {
	const tokenEndpoint = "https://discord.com/api/oauth2/token";
	return {
		id: "discord",
		name: "Discord",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["identify", "email"];
			if (scopes) _scopes.push(...scopes);
			if (options.scope) _scopes.push(...options.scope);
			const permissionsParam = _scopes.includes("bot") && options.permissions !== void 0 ? `&permissions=${options.permissions}` : "";
			return new URL(`https://discord.com/api/oauth2/authorize?scope=${_scopes.join("+")}&response_type=code&client_id=${options.clientId}&redirect_uri=${encodeURIComponent(options.redirectURI || redirectURI)}&state=${state}&prompt=${options.prompt || "none"}${permissionsParam}`);
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${token.accessToken}` } });
			if (error) return null;
			if (profile.avatar === null) profile.image_url = `https://cdn.discordapp.com/embed/avatars/${profile.discriminator === "0" ? Number(BigInt(profile.id) >> BigInt(22)) % 6 : parseInt(profile.discriminator) % 5}.png`;
			else {
				const format = profile.avatar.startsWith("a_") ? "gif" : "png";
				profile.image_url = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.global_name || profile.username || "",
					email: profile.email,
					emailVerified: profile.verified,
					image: profile.image_url,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/dropbox.mjs
var dropbox = (options) => {
	const tokenEndpoint = "https://api.dropboxapi.com/oauth2/token";
	return {
		id: "dropbox",
		name: "Dropbox",
		createAuthorizationURL: async ({ state, scopes, codeVerifier, redirectURI }) => {
			const _scopes = options.disableDefaultScope ? [] : ["account_info.read"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const additionalParams = {};
			if (options.accessType) additionalParams.token_access_type = options.accessType;
			return await createAuthorizationURL({
				id: "dropbox",
				options,
				authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
				additionalParams
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return await validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.dropboxapi.com/2/users/get_current_account", {
				method: "POST",
				headers: { Authorization: `Bearer ${token.accessToken}` }
			});
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.account_id,
					name: profile.name?.display_name,
					email: profile.email,
					emailVerified: profile.email_verified || false,
					image: profile.profile_photo_url,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/facebook.mjs
/**
* Validate an opaque Facebook access token against the configured app.
*
* Facebook access tokens are not audience-bound at the Graph `/me` endpoint: a
* token minted for any Facebook app returns that app's profile. Without this
* check, a token issued to an unrelated app could be presented to this
* app's direct sign-in path and accepted as proof of identity. We call the
* `debug_token` endpoint and require the token to be valid, bound to one of the
* configured client ids, and tied to a user.
*
* @see https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging
*
* @returns the inspected token's `user_id` when the token is valid and bound to
* the configured app, otherwise `null`.
*/
async function verifyFacebookAccessToken(accessToken, options) {
	const primaryClientId = getPrimaryClientId(options.clientId);
	if (!primaryClientId || !options.clientSecret) return null;
	const clientIds = Array.isArray(options.clientId) ? options.clientId : [options.clientId];
	const { data, error } = await betterFetch("https://graph.facebook.com/debug_token", { query: {
		input_token: accessToken,
		access_token: `${primaryClientId}|${options.clientSecret}`
	} });
	if (error || !data?.data) return null;
	const { is_valid, app_id, user_id } = data.data;
	if (is_valid !== true || !app_id || !clientIds.includes(app_id) || !user_id) return null;
	return user_id;
}
var facebook = (options) => {
	return {
		id: "facebook",
		name: "Facebook",
		async createAuthorizationURL({ state, scopes, redirectURI, loginHint }) {
			if (!getPrimaryClientId(options.clientId) || !options.clientSecret) {
				logger.error("Client ID and client secret are required for Facebook. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			const _scopes = options.disableDefaultScope ? [] : ["email", "public_profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "facebook",
				options,
				authorizationEndpoint: "https://www.facebook.com/v24.0/dialog/oauth",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				additionalParams: options.configId ? { config_id: options.configId } : {}
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://graph.facebook.com/v24.0/oauth/access_token"
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) return options.verifyIdToken(token, nonce);
			if (token.split(".").length === 3) try {
				const { payload: jwtClaims } = await jwtVerify(token, createRemoteJWKSet(new URL("https://limited.facebook.com/.well-known/oauth/openid/jwks/")), {
					algorithms: ["RS256"],
					audience: options.clientId,
					issuer: "https://www.facebook.com"
				});
				if (nonce && jwtClaims.nonce !== nonce) return false;
				return !!jwtClaims;
			} catch {
				return false;
			}
			return await verifyFacebookAccessToken(token, options) !== null;
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint: "https://graph.facebook.com/v24.0/oauth/access_token"
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (token.idToken && token.idToken.split(".").length === 3) {
				const profile = decodeJwt(token.idToken);
				const user = {
					id: profile.sub,
					name: profile.name,
					email: profile.email,
					picture: { data: {
						url: profile.picture,
						height: 100,
						width: 100,
						is_silhouette: false
					} }
				};
				const userMap = await options.mapProfileToUser?.({
					...user,
					email_verified: false
				});
				return {
					user: {
						...user,
						emailVerified: false,
						...userMap
					},
					data: profile
				};
			}
			const accessToken = token.accessToken;
			if (!accessToken) return null;
			const tokenUserId = await verifyFacebookAccessToken(accessToken, options);
			if (!tokenUserId) return null;
			const { data: profile, error } = await betterFetch("https://graph.facebook.com/me?fields=" + [
				"id",
				"name",
				"email",
				"picture",
				...options?.fields || []
			].join(","), { auth: {
				type: "Bearer",
				token: accessToken
			} });
			if (error) return null;
			if (profile.id !== tokenUserId) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name,
					email: profile.email,
					image: profile.picture.data.url,
					emailVerified: profile.email_verified ?? false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/figma.mjs
var figma = (options) => {
	const tokenEndpoint = "https://api.figma.com/v1/oauth/token";
	return {
		id: "figma",
		name: "Figma",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error("Client Id and Client Secret are required for Figma. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) throw new BetterAuthError("codeVerifier is required for Figma");
			const _scopes = options.disableDefaultScope ? [] : ["current_user:read"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "figma",
				options,
				authorizationEndpoint: "https://www.figma.com/oauth",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
				authentication: "basic"
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint,
				authentication: "basic"
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			try {
				const { data: profile } = await betterFetch("https://api.figma.com/v1/me", { headers: { Authorization: `Bearer ${token.accessToken}` } });
				if (!profile) {
					logger.error("Failed to fetch user from Figma");
					return null;
				}
				const userMap = await options.mapProfileToUser?.(profile);
				return {
					user: {
						id: profile.id,
						name: profile.handle,
						email: profile.email,
						image: profile.img_url,
						emailVerified: false,
						...userMap
					},
					data: profile
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Figma:", error);
				return null;
			}
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/github.mjs
var github = (options) => {
	const tokenEndpoint = "https://github.com/login/oauth/access_token";
	return {
		id: "github",
		name: "GitHub",
		createAuthorizationURL({ state, scopes, loginHint, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["read:user", "user:email"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "github",
				options,
				authorizationEndpoint: "https://github.com/login/oauth/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				loginHint,
				prompt: options.prompt
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			const { body, headers: requestHeaders } = createAuthorizationCodeRequest({
				code,
				codeVerifier,
				redirectURI,
				options
			});
			const { data, error } = await betterFetch(tokenEndpoint, {
				method: "POST",
				body,
				headers: requestHeaders
			});
			if (error) {
				logger.error("GitHub OAuth token exchange failed:", error);
				return null;
			}
			if ("error" in data) {
				logger.error("GitHub OAuth token exchange failed:", data);
				return null;
			}
			return getOAuth2Tokens(data);
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.github.com/user", { headers: {
				"User-Agent": "better-auth",
				authorization: `Bearer ${token.accessToken}`
			} });
			if (error) return null;
			const { data: emails } = await betterFetch("https://api.github.com/user/emails", { headers: {
				Authorization: `Bearer ${token.accessToken}`,
				"User-Agent": "better-auth"
			} });
			if (!profile.email && emails) profile.email = (emails.find((e) => e.primary) ?? emails[0])?.email;
			const emailVerified = emails?.find((e) => e.email === profile.email)?.verified ?? false;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name || profile.login || "",
					email: profile.email,
					image: profile.avatar_url,
					emailVerified,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/gitlab.mjs
var cleanDoubleSlashes = (input = "") => {
	return input.split("://").map((str) => str.replace(/\/{2,}/g, "/")).join("://");
};
var issuerToEndpoints = (issuer) => {
	const baseUrl = issuer || "https://gitlab.com";
	return {
		authorizationEndpoint: cleanDoubleSlashes(`${baseUrl}/oauth/authorize`),
		tokenEndpoint: cleanDoubleSlashes(`${baseUrl}/oauth/token`),
		userinfoEndpoint: cleanDoubleSlashes(`${baseUrl}/api/v4/user`)
	};
};
var gitlab = (options) => {
	const { authorizationEndpoint, tokenEndpoint, userinfoEndpoint } = issuerToEndpoints(options.issuer);
	const issuerId = "gitlab";
	return {
		id: issuerId,
		name: "Gitlab",
		createAuthorizationURL: async ({ state, scopes, codeVerifier, loginHint, redirectURI }) => {
			const _scopes = options.disableDefaultScope ? [] : ["read_user"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: issuerId,
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
				loginHint
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI, codeVerifier }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				codeVerifier,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch(userinfoEndpoint, { headers: { authorization: `Bearer ${token.accessToken}` } });
			if (error || profile.state !== "active" || profile.locked) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name ?? profile.username ?? "",
					email: profile.email,
					image: profile.avatar_url,
					emailVerified: profile.email_verified ?? false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/google.mjs
var GOOGLE_ID_TOKEN_MAX_AGE = "1h";
/**
* Verifies a Google ID token against Google's issuer, audience, signature,
* expiry, and maximum token age.
*/
var verifyGoogleIdToken = async ({ token, audience, nonce }) => {
	try {
		const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
		if (!kid || !jwtAlg) return null;
		const { payload: jwtClaims } = await jwtVerify(token, await getGooglePublicKey(kid), {
			algorithms: [jwtAlg],
			issuer: ["https://accounts.google.com", "accounts.google.com"],
			audience,
			maxTokenAge: GOOGLE_ID_TOKEN_MAX_AGE
		});
		if (nonce && jwtClaims.nonce !== nonce) return null;
		return jwtClaims;
	} catch {
		return null;
	}
};
/**
* Checks whether Google's verified `hd` claim satisfies the configured hosted
* domain restriction. `hd: "*"` accepts any Google Workspace hosted domain.
*/
var isGoogleHostedDomainAllowed = (configuredHostedDomain, tokenHostedDomain) => {
	if (!configuredHostedDomain) return true;
	if (typeof tokenHostedDomain !== "string" || !tokenHostedDomain) return false;
	if (configuredHostedDomain === "*") return true;
	return tokenHostedDomain === configuredHostedDomain;
};
var google = (options) => {
	return {
		id: "google",
		name: "Google",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI, loginHint, display }) {
			if (!getPrimaryClientId(options.clientId) || !options.clientSecret) {
				logger.error("Client Id and Client Secret is required for Google. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) throw new BetterAuthError("codeVerifier is required for Google");
			const _scopes = options.disableDefaultScope ? [] : [
				"email",
				"profile",
				"openid"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "google",
				options,
				authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
				accessType: options.accessType,
				display: display || options.display,
				loginHint,
				hd: options.hd,
				additionalParams: { include_granted_scopes: "true" }
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://oauth2.googleapis.com/token"
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint: "https://oauth2.googleapis.com/token"
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) return options.verifyIdToken(token, nonce);
			const jwtClaims = await verifyGoogleIdToken({
				token,
				audience: options.clientId,
				nonce
			});
			if (!jwtClaims) return false;
			return isGoogleHostedDomainAllowed(options.hd, jwtClaims.hd);
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (!token.idToken) return null;
			const user = decodeJwt(token.idToken);
			if (!isGoogleHostedDomainAllowed(options.hd, user.hd)) {
				logger.error(`Google sign-in rejected: id token hosted domain (hd) "${user.hd ?? "<missing>"}" does not satisfy the configured "hd" option "${options.hd}".`);
				return null;
			}
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified,
					...userMap
				},
				data: user
			};
		},
		options
	};
};
var getGooglePublicKey = async (kid) => {
	const { data } = await betterFetch("https://www.googleapis.com/oauth2/v3/certs");
	if (!data?.keys) throw new APIError("BAD_REQUEST", { message: "Keys not found" });
	const jwk = data.keys.find((key) => key.kid === kid);
	if (!jwk) throw new Error(`JWK with kid ${kid} not found`);
	return await importJWK(jwk, jwk.alg);
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/huggingface.mjs
var huggingface = (options) => {
	const tokenEndpoint = "https://huggingface.co/oauth/token";
	return {
		id: "huggingface",
		name: "Hugging Face",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"profile",
				"email"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "huggingface",
				options,
				authorizationEndpoint: "https://huggingface.co/oauth/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://huggingface.co/oauth/userinfo", {
				method: "GET",
				headers: { Authorization: `Bearer ${token.accessToken}` }
			});
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name || profile.preferred_username || "",
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified ?? false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/kakao.mjs
var kakao = (options) => {
	const tokenEndpoint = "https://kauth.kakao.com/oauth/token";
	return {
		id: "kakao",
		name: "Kakao",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : [
				"account_email",
				"profile_image",
				"profile_nickname"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "kakao",
				options,
				authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${token.accessToken}` } });
			if (error || !profile) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			const account = profile.kakao_account || {};
			const kakaoProfile = account.profile || {};
			return {
				user: {
					id: String(profile.id),
					name: kakaoProfile.nickname || account.name || "",
					email: account.email,
					image: kakaoProfile.profile_image_url || kakaoProfile.thumbnail_image_url,
					emailVerified: !!account.is_email_valid && !!account.is_email_verified,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/kick.mjs
var kick = (options) => {
	return {
		id: "kick",
		name: "Kick",
		createAuthorizationURL({ state, scopes, redirectURI, codeVerifier }) {
			const _scopes = options.disableDefaultScope ? [] : ["user:read"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "kick",
				redirectURI,
				options,
				authorizationEndpoint: "https://id.kick.com/oauth/authorize",
				scopes: _scopes,
				codeVerifier,
				state
			});
		},
		async validateAuthorizationCode({ code, redirectURI, codeVerifier }) {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://id.kick.com/oauth/token",
				codeVerifier
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientSecret: options.clientSecret
				},
				tokenEndpoint: "https://id.kick.com/oauth/token"
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data, error } = await betterFetch("https://api.kick.com/public/v1/users", {
				method: "GET",
				headers: { Authorization: `Bearer ${token.accessToken}` }
			});
			if (error) return null;
			const profile = data.data[0];
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.user_id,
					name: profile.name,
					email: profile.email,
					image: profile.profile_picture,
					emailVerified: false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/line.mjs
/**
* LINE Login v2.1
* - Authorization endpoint: https://access.line.me/oauth2/v2.1/authorize
* - Token endpoint: https://api.line.me/oauth2/v2.1/token
* - UserInfo endpoint: https://api.line.me/oauth2/v2.1/userinfo
* - Verify ID token: https://api.line.me/oauth2/v2.1/verify
*
* Docs: https://developers.line.biz/en/reference/line-login/#issue-access-token
*/
var line = (options) => {
	const authorizationEndpoint = "https://access.line.me/oauth2/v2.1/authorize";
	const tokenEndpoint = "https://api.line.me/oauth2/v2.1/token";
	const userInfoEndpoint = "https://api.line.me/oauth2/v2.1/userinfo";
	const verifyIdTokenEndpoint = "https://api.line.me/oauth2/v2.1/verify";
	return {
		id: "line",
		name: "LINE",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI, loginHint }) {
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"profile",
				"email"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "line",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				loginHint
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) return options.verifyIdToken(token, nonce);
			const body = new URLSearchParams();
			body.set("id_token", token);
			body.set("client_id", options.clientId);
			if (nonce) body.set("nonce", nonce);
			const { data, error } = await betterFetch(verifyIdTokenEndpoint, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body
			});
			if (error || !data) return false;
			if (data.aud !== options.clientId) return false;
			if (data.nonce && data.nonce !== nonce) return false;
			return true;
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			let profile = null;
			if (token.idToken) try {
				profile = decodeJwt(token.idToken);
			} catch {}
			if (!profile) {
				const { data } = await betterFetch(userInfoEndpoint, { headers: { authorization: `Bearer ${token.accessToken}` } });
				profile = data || null;
			}
			if (!profile) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			const id = profile.sub || profile.userId;
			const name = profile.name || profile.displayName || "";
			const image = profile.picture || profile.pictureUrl || void 0;
			return {
				user: {
					id,
					name,
					email: profile.email,
					image,
					emailVerified: false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/linear.mjs
var linear = (options) => {
	const tokenEndpoint = "https://api.linear.app/oauth/token";
	return {
		id: "linear",
		name: "Linear",
		createAuthorizationURL({ state, scopes, loginHint, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["read"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "linear",
				options,
				authorizationEndpoint: "https://linear.app/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.linear.app/graphql", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token.accessToken}`
				},
				body: JSON.stringify({ query: `
							query {
								viewer {
									id
									name
									email
									avatarUrl
									active
									createdAt
									updatedAt
								}
							}
						` })
			});
			if (error || !profile?.data?.viewer) return null;
			const userData = profile.data.viewer;
			const userMap = await options.mapProfileToUser?.(userData);
			return {
				user: {
					id: profile.data.viewer.id,
					name: profile.data.viewer.name,
					email: profile.data.viewer.email,
					image: profile.data.viewer.avatarUrl,
					emailVerified: false,
					...userMap
				},
				data: userData
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/linkedin.mjs
var linkedin = (options) => {
	const authorizationEndpoint = "https://www.linkedin.com/oauth/v2/authorization";
	const tokenEndpoint = "https://www.linkedin.com/oauth/v2/accessToken";
	return {
		id: "linkedin",
		name: "Linkedin",
		createAuthorizationURL: async ({ state, scopes, redirectURI, loginHint }) => {
			const _scopes = options.disableDefaultScope ? [] : [
				"profile",
				"email",
				"openid"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "linkedin",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				loginHint,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return await validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.linkedin.com/v2/userinfo", {
				method: "GET",
				headers: { Authorization: `Bearer ${token.accessToken}` }
			});
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name,
					email: profile.email,
					emailVerified: profile.email_verified ?? false,
					image: profile.picture,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/microsoft-entra-id.mjs
/**
* Microsoft's fixed tenant id for personal (consumer) Microsoft accounts. Every
* personal-account token carries it as the `tid` claim, so it distinguishes the
* consumer account class from work/school tenants.
* @see https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
*/
var MICROSOFT_CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
var microsoft = (options) => {
	const tenant = options.tenantId || "common";
	let authority = options.authority || "https://login.microsoftonline.com";
	while (authority.endsWith("/")) authority = authority.slice(0, -1);
	const authorizationEndpoint = `${authority}/${tenant}/oauth2/v2.0/authorize`;
	const tokenEndpoint = `${authority}/${tenant}/oauth2/v2.0/token`;
	return {
		id: "microsoft",
		name: "Microsoft EntraID",
		createAuthorizationURL(data) {
			if (!getPrimaryClientId(options.clientId)) {
				logger.error("Client Id is required for Microsoft Entra ID. Make sure to provide it in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			const scopes = options.disableDefaultScope ? [] : [
				"openid",
				"profile",
				"email",
				"User.Read",
				"offline_access"
			];
			if (options.scope) scopes.push(...options.scope);
			if (data.scopes) scopes.push(...data.scopes);
			return createAuthorizationURL({
				id: "microsoft",
				options,
				authorizationEndpoint,
				state: data.state,
				codeVerifier: data.codeVerifier,
				scopes,
				redirectURI: data.redirectURI,
				prompt: options.prompt,
				loginHint: data.loginHint
			});
		},
		validateAuthorizationCode({ code, codeVerifier, redirectURI }) {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) return options.verifyIdToken(token, nonce);
			try {
				const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
				if (!kid || !jwtAlg) return false;
				const publicKey = await getMicrosoftPublicKey(kid, tenant, authority);
				const verifyOptions = {
					algorithms: [jwtAlg],
					audience: options.clientId,
					maxTokenAge: "1h"
				};
				/**
				* Issuer varies per user's tenant for multi-tenant endpoints, so only validate for specific tenants.
				* @see https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols#endpoints
				*/
				if (tenant !== "common" && tenant !== "organizations" && tenant !== "consumers") verifyOptions.issuer = `${authority}/${tenant}/v2.0`;
				const { payload: jwtClaims } = await jwtVerify(token, publicKey, verifyOptions);
				if (nonce && jwtClaims.nonce !== nonce) return false;
				const tid = jwtClaims.tid;
				if (typeof tid !== "string" || jwtClaims.iss !== `${authority}/${tid}/v2.0`) return false;
				if (tenant === "organizations" && tid === MICROSOFT_CONSUMER_TENANT_ID) return false;
				if (tenant === "consumers" && tid !== MICROSOFT_CONSUMER_TENANT_ID) return false;
				return true;
			} catch (error) {
				logger.error("Failed to verify ID token:", error);
				return false;
			}
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (!token.idToken) return null;
			const user = decodeJwt(token.idToken);
			const profilePhotoSize = options.profilePhotoSize || 48;
			await betterFetch(`https://graph.microsoft.com/v1.0/me/photos/${profilePhotoSize}x${profilePhotoSize}/$value`, {
				headers: { Authorization: `Bearer ${token.accessToken}` },
				async onResponse(context) {
					if (options.disableProfilePhoto || !context.response.ok) return;
					try {
						const pictureBuffer = await context.response.clone().arrayBuffer();
						user.picture = `data:image/jpeg;base64, ${base64.encode(pictureBuffer)}`;
					} catch (e) {
						logger.error(e && typeof e === "object" && "name" in e ? e.name : "", e);
					}
				}
			});
			const userMap = await options.mapProfileToUser?.(user);
			const emailVerified = user.email_verified !== void 0 ? user.email_verified : user.email && (user.verified_primary_email?.includes(user.email) || user.verified_secondary_email?.includes(user.email)) ? true : false;
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified,
					...userMap
				},
				data: user
			};
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			const scopes = options.disableDefaultScope ? [] : [
				"openid",
				"profile",
				"email",
				"User.Read",
				"offline_access"
			];
			if (options.scope) scopes.push(...options.scope);
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientSecret: options.clientSecret
				},
				extraParams: { scope: scopes.join(" ") },
				tokenEndpoint
			});
		},
		options
	};
};
var getMicrosoftPublicKey = async (kid, tenant, authority) => {
	const { data } = await betterFetch(`${authority}/${tenant}/discovery/v2.0/keys`);
	if (!data?.keys) throw new APIError("BAD_REQUEST", { message: "Keys not found" });
	const jwk = data.keys.find((key) => key.kid === kid);
	if (!jwk) throw new Error(`JWK with kid ${kid} not found`);
	return await importJWK(jwk, jwk.alg);
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/naver.mjs
var naver = (options) => {
	const tokenEndpoint = "https://nid.naver.com/oauth2.0/token";
	return {
		id: "naver",
		name: "Naver",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["profile", "email"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "naver",
				options,
				authorizationEndpoint: "https://nid.naver.com/oauth2.0/authorize",
				scopes: _scopes,
				state,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://openapi.naver.com/v1/nid/me", { headers: { Authorization: `Bearer ${token.accessToken}` } });
			if (error || !profile || profile.resultcode !== "00") return null;
			const userMap = await options.mapProfileToUser?.(profile);
			const res = profile.response || {};
			return {
				user: {
					id: res.id,
					name: res.name || res.nickname || "",
					email: res.email,
					image: res.profile_image,
					emailVerified: false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/notion.mjs
var notion = (options) => {
	const tokenEndpoint = "https://api.notion.com/v1/oauth/token";
	return {
		id: "notion",
		name: "Notion",
		createAuthorizationURL({ state, scopes, loginHint, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : [];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "notion",
				options,
				authorizationEndpoint: "https://api.notion.com/v1/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				additionalParams: { owner: "user" }
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint,
				authentication: "basic"
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.notion.com/v1/users/me", { headers: {
				Authorization: `Bearer ${token.accessToken}`,
				"Notion-Version": "2022-06-28"
			} });
			if (error || !profile) return null;
			const userProfile = profile.bot?.owner?.user;
			if (!userProfile) return null;
			const userMap = await options.mapProfileToUser?.(userProfile);
			return {
				user: {
					id: userProfile.id,
					name: userProfile.name || "",
					email: userProfile.person?.email || null,
					image: userProfile.avatar_url,
					emailVerified: false,
					...userMap
				},
				data: userProfile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/paybin.mjs
var paybin = (options) => {
	const issuer = options.issuer || "https://idp.paybin.io";
	const authorizationEndpoint = `${issuer}/oauth2/authorize`;
	const tokenEndpoint = `${issuer}/oauth2/token`;
	return {
		id: "paybin",
		name: "Paybin",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI, loginHint }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error("Client Id and Client Secret is required for Paybin. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) throw new BetterAuthError("codeVerifier is required for Paybin");
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"email",
				"profile"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "paybin",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
				loginHint
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (!token.idToken) return null;
			const user = decodeJwt(token.idToken);
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.sub,
					name: user.name || user.preferred_username || "",
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified || false,
					...userMap
				},
				data: user
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/paypal.mjs
/**
* ID token signing algorithms advertised by PayPal's OpenID configuration.
* Anything outside this allowlist is rejected so each token is only ever
* verified with the algorithm it was issued for.
*
* @see https://www.paypal.com/.well-known/openid-configuration
*/
var PAYPAL_ID_TOKEN_ALGORITHMS = ["RS256", "HS256"];
var paypal = (options) => {
	const isSandbox = (options.environment || "sandbox") === "sandbox";
	const authorizationEndpoint = isSandbox ? "https://www.sandbox.paypal.com/signin/authorize" : "https://www.paypal.com/signin/authorize";
	const tokenEndpoint = isSandbox ? "https://api-m.sandbox.paypal.com/v1/oauth2/token" : "https://api-m.paypal.com/v1/oauth2/token";
	const userInfoEndpoint = isSandbox ? "https://api-m.sandbox.paypal.com/v1/identity/oauth2/userinfo" : "https://api-m.paypal.com/v1/identity/oauth2/userinfo";
	/**
	* Issuer and JWKS endpoints used to cryptographically verify ID tokens.
	*
	* @see https://www.paypal.com/.well-known/openid-configuration
	*/
	const issuer = isSandbox ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
	const jwksEndpoint = isSandbox ? "https://api.sandbox.paypal.com/v1/oauth2/certs" : "https://api.paypal.com/v1/oauth2/certs";
	return {
		id: "paypal",
		name: "PayPal",
		async createAuthorizationURL({ state, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error("Client Id and Client Secret is required for PayPal. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			return await createAuthorizationURL({
				id: "paypal",
				options,
				authorizationEndpoint,
				scopes: [],
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			/**
			* PayPal requires Basic Auth for token exchange
			**/
			const credentials = base64.encode(`${options.clientId}:${options.clientSecret}`);
			try {
				const response = await betterFetch(tokenEndpoint, {
					method: "POST",
					headers: {
						Authorization: `Basic ${credentials}`,
						Accept: "application/json",
						"Accept-Language": "en_US",
						"Content-Type": "application/x-www-form-urlencoded"
					},
					body: new URLSearchParams({
						grant_type: "authorization_code",
						code,
						redirect_uri: redirectURI
					}).toString()
				});
				if (!response.data) throw new BetterAuthError("FAILED_TO_GET_ACCESS_TOKEN");
				const data = response.data;
				return {
					accessToken: data.access_token,
					refreshToken: data.refresh_token,
					accessTokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1e3) : void 0,
					idToken: data.id_token
				};
			} catch (error) {
				logger.error("PayPal token exchange failed:", error);
				throw new BetterAuthError("FAILED_TO_GET_ACCESS_TOKEN");
			}
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			const credentials = base64.encode(`${options.clientId}:${options.clientSecret}`);
			try {
				const response = await betterFetch(tokenEndpoint, {
					method: "POST",
					headers: {
						Authorization: `Basic ${credentials}`,
						Accept: "application/json",
						"Accept-Language": "en_US",
						"Content-Type": "application/x-www-form-urlencoded"
					},
					body: new URLSearchParams({
						grant_type: "refresh_token",
						refresh_token: refreshToken
					}).toString()
				});
				if (!response.data) throw new BetterAuthError("FAILED_TO_REFRESH_ACCESS_TOKEN");
				const data = response.data;
				return {
					accessToken: data.access_token,
					refreshToken: data.refresh_token,
					accessTokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1e3) : void 0
				};
			} catch (error) {
				logger.error("PayPal token refresh failed:", error);
				throw new BetterAuthError("FAILED_TO_REFRESH_ACCESS_TOKEN");
			}
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) return options.verifyIdToken(token, nonce);
			try {
				const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
				if (!jwtAlg) return false;
				if (!PAYPAL_ID_TOKEN_ALGORITHMS.includes(jwtAlg)) return false;
				const key = jwtAlg === "HS256" ? new TextEncoder().encode(options.clientSecret) : kid ? await getPayPalPublicKey(kid, jwksEndpoint) : void 0;
				if (!key) return false;
				const { payload: jwtClaims } = await jwtVerify(token, key, {
					algorithms: [jwtAlg],
					issuer,
					audience: options.clientId,
					maxTokenAge: "1h"
				});
				if (nonce && jwtClaims.nonce !== nonce) return false;
				return true;
			} catch (error) {
				logger.error("Failed to verify PayPal ID token:", error);
				return false;
			}
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			if (!token.accessToken) {
				logger.error("Access token is required to fetch PayPal user info");
				return null;
			}
			try {
				const response = await betterFetch(`${userInfoEndpoint}?schema=paypalv1.1`, { headers: {
					Authorization: `Bearer ${token.accessToken}`,
					Accept: "application/json"
				} });
				if (!response.data) {
					logger.error("Failed to fetch user info from PayPal");
					return null;
				}
				const userInfo = response.data;
				if (token.idToken) {
					let idTokenSubject;
					try {
						idTokenSubject = decodeJwt(token.idToken).sub;
					} catch (error) {
						logger.error("Failed to decode PayPal ID token:", error);
						return null;
					}
					const userInfoSubject = userInfo.sub ?? userInfo.user_id;
					if (!idTokenSubject || userInfoSubject !== idTokenSubject) {
						logger.error("PayPal user info subject does not match ID token subject");
						return null;
					}
				}
				const userMap = await options.mapProfileToUser?.(userInfo);
				return {
					user: {
						id: userInfo.user_id,
						name: userInfo.name,
						email: userInfo.email,
						image: userInfo.picture,
						emailVerified: userInfo.email_verified,
						...userMap
					},
					data: userInfo
				};
			} catch (error) {
				logger.error("Failed to fetch user info from PayPal:", error);
				return null;
			}
		},
		options
	};
};
var getPayPalPublicKey = async (kid, jwksUri) => {
	const { data } = await betterFetch(jwksUri);
	if (!data?.keys) throw new APIError("BAD_REQUEST", { message: "Keys not found" });
	const jwk = data.keys.find((key) => key.kid === kid);
	if (!jwk) throw new Error(`JWK with kid ${kid} not found`);
	return await importJWK(jwk, jwk.alg);
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/polar.mjs
var polar = (options) => {
	const tokenEndpoint = "https://api.polar.sh/v1/oauth2/token";
	return {
		id: "polar",
		name: "Polar",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"profile",
				"email"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "polar",
				options,
				authorizationEndpoint: "https://polar.sh/oauth2/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.polar.sh/v1/oauth2/userinfo", { headers: { Authorization: `Bearer ${token.accessToken}` } });
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.public_name || profile.username || "",
					email: profile.email,
					image: profile.avatar_url,
					emailVerified: profile.email_verified ?? false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/railway.mjs
var authorizationEndpoint = "https://backboard.railway.com/oauth/auth";
var tokenEndpoint = "https://backboard.railway.com/oauth/token";
var userinfoEndpoint = "https://backboard.railway.com/oauth/me";
var railway = (options) => {
	return {
		id: "railway",
		name: "Railway",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"email",
				"profile"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "railway",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
				authentication: "basic"
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint,
				authentication: "basic"
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch(userinfoEndpoint, { headers: { authorization: `Bearer ${token.accessToken}` } });
			if (error || !profile) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name,
					email: profile.email,
					image: profile.picture,
					emailVerified: false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/reddit.mjs
var reddit = (options) => {
	return {
		id: "reddit",
		name: "Reddit",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["identity"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "reddit",
				options,
				authorizationEndpoint: "https://www.reddit.com/api/v1/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				duration: options.duration
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			const body = new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: options.redirectURI || redirectURI
			});
			const { data, error } = await betterFetch("https://www.reddit.com/api/v1/access_token", {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					accept: "text/plain",
					"user-agent": "better-auth",
					Authorization: `Basic ${base64.encode(`${options.clientId}:${options.clientSecret}`)}`
				},
				body: body.toString()
			});
			if (error) throw error;
			return getOAuth2Tokens(data);
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				authentication: "basic",
				tokenEndpoint: "https://www.reddit.com/api/v1/access_token"
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://oauth.reddit.com/api/v1/me", { headers: {
				Authorization: `Bearer ${token.accessToken}`,
				"User-Agent": "better-auth"
			} });
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			const email = userMap?.email || `${profile.id}@reddit.invalid`;
			return {
				user: {
					id: profile.id,
					name: profile.name,
					image: profile.icon_img?.split("?")[0],
					...userMap,
					email,
					emailVerified: userMap?.emailVerified ?? false
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/roblox.mjs
var roblox = (options) => {
	const tokenEndpoint = "https://apis.roblox.com/oauth/v1/token";
	return {
		id: "roblox",
		name: "Roblox",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["openid", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return new URL(`https://apis.roblox.com/oauth/v1/authorize?scope=${_scopes.join("+")}&response_type=code&client_id=${options.clientId}&redirect_uri=${encodeURIComponent(options.redirectURI || redirectURI)}&state=${state}&prompt=${options.prompt || "select_account consent"}`);
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint,
				authentication: "post"
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://apis.roblox.com/oauth/v1/userinfo", { headers: { authorization: `Bearer ${token.accessToken}` } });
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.nickname || profile.preferred_username || "",
					image: profile.picture,
					email: profile.preferred_username || null,
					emailVerified: false,
					...userMap
				},
				data: { ...profile }
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/salesforce.mjs
var salesforce = (options) => {
	const isSandbox = (options.environment ?? "production") === "sandbox";
	const authorizationEndpoint = options.loginUrl ? `https://${options.loginUrl}/services/oauth2/authorize` : isSandbox ? "https://test.salesforce.com/services/oauth2/authorize" : "https://login.salesforce.com/services/oauth2/authorize";
	const tokenEndpoint = options.loginUrl ? `https://${options.loginUrl}/services/oauth2/token` : isSandbox ? "https://test.salesforce.com/services/oauth2/token" : "https://login.salesforce.com/services/oauth2/token";
	const userInfoEndpoint = options.loginUrl ? `https://${options.loginUrl}/services/oauth2/userinfo` : isSandbox ? "https://test.salesforce.com/services/oauth2/userinfo" : "https://login.salesforce.com/services/oauth2/userinfo";
	return {
		id: "salesforce",
		name: "Salesforce",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error("Client Id and Client Secret are required for Salesforce. Make sure to provide them in the options.");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) throw new BetterAuthError("codeVerifier is required for Salesforce");
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"email",
				"profile"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "salesforce",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			try {
				const { data: user } = await betterFetch(userInfoEndpoint, { headers: { Authorization: `Bearer ${token.accessToken}` } });
				if (!user) {
					logger.error("Failed to fetch user info from Salesforce");
					return null;
				}
				const userMap = await options.mapProfileToUser?.(user);
				return {
					user: {
						id: user.user_id,
						name: user.name,
						email: user.email,
						image: user.photos?.picture || user.photos?.thumbnail,
						emailVerified: user.email_verified ?? false,
						...userMap
					},
					data: user
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Salesforce:", error);
				return null;
			}
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/slack.mjs
var slack = (options) => {
	const tokenEndpoint = "https://slack.com/api/openid.connect.token";
	return {
		id: "slack",
		name: "Slack",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : [
				"openid",
				"profile",
				"email"
			];
			if (scopes) _scopes.push(...scopes);
			if (options.scope) _scopes.push(...options.scope);
			const url = new URL("https://slack.com/openid/connect/authorize");
			url.searchParams.set("scope", _scopes.join(" "));
			url.searchParams.set("response_type", "code");
			url.searchParams.set("client_id", options.clientId);
			url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);
			url.searchParams.set("state", state);
			return url;
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://slack.com/api/openid.connect.userInfo", { headers: { authorization: `Bearer ${token.accessToken}` } });
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile["https://slack.com/user_id"],
					name: profile.name || "",
					email: profile.email,
					emailVerified: profile.email_verified,
					image: profile.picture || profile["https://slack.com/user_image_512"],
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/spotify.mjs
var spotify = (options) => {
	const tokenEndpoint = "https://accounts.spotify.com/api/token";
	return {
		id: "spotify",
		name: "Spotify",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["user-read-email"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "spotify",
				options,
				authorizationEndpoint: "https://accounts.spotify.com/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.spotify.com/v1/me", {
				method: "GET",
				headers: { Authorization: `Bearer ${token.accessToken}` }
			});
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.display_name,
					email: profile.email,
					image: profile.images[0]?.url,
					emailVerified: false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/tiktok.mjs
var tiktok = (options) => {
	const tokenEndpoint = "https://open.tiktokapis.com/v2/oauth/token/";
	return {
		id: "tiktok",
		name: "TikTok",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["user.info.profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return new URL(`https://www.tiktok.com/v2/auth/authorize?scope=${_scopes.join(",")}&response_type=code&client_key=${options.clientKey}&redirect_uri=${encodeURIComponent(options.redirectURI || redirectURI)}&state=${state}`);
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options: {
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: { clientSecret: options.clientSecret },
				tokenEndpoint,
				authentication: "post",
				extraParams: { client_key: options.clientKey }
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch(`https://open.tiktokapis.com/v2/user/info/?fields=${[
				"open_id",
				"avatar_large_url",
				"display_name",
				"username"
			].join(",")}`, { headers: { authorization: `Bearer ${token.accessToken}` } });
			if (error) return null;
			return {
				user: {
					email: profile.data.user.email || profile.data.user.username,
					id: profile.data.user.open_id,
					name: profile.data.user.display_name || profile.data.user.username || "",
					image: profile.data.user.avatar_large_url,
					emailVerified: false
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/twitch.mjs
var twitch = (options) => {
	const tokenEndpoint = "https://id.twitch.tv/oauth2/token";
	return {
		id: "twitch",
		name: "Twitch",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["user:read:email", "openid"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "twitch",
				redirectURI,
				options,
				authorizationEndpoint: "https://id.twitch.tv/oauth2/authorize",
				scopes: _scopes,
				state,
				claims: options.claims || [
					"email",
					"email_verified",
					"preferred_username",
					"picture"
				]
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const idToken = token.idToken;
			if (!idToken) {
				logger.error("No idToken found in token");
				return null;
			}
			const profile = decodeJwt(idToken);
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.preferred_username,
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/twitter.mjs
var twitter = (options) => {
	const tokenEndpoint = "https://api.x.com/2/oauth2/token";
	return {
		id: "twitter",
		name: "Twitter",
		createAuthorizationURL(data) {
			const _scopes = options.disableDefaultScope ? [] : [
				"users.read",
				"tweet.read",
				"offline.access",
				"users.email"
			];
			if (options.scope) _scopes.push(...options.scope);
			if (data.scopes) _scopes.push(...data.scopes);
			return createAuthorizationURL({
				id: "twitter",
				options,
				authorizationEndpoint: "https://x.com/i/oauth2/authorize",
				scopes: _scopes,
				state: data.state,
				codeVerifier: data.codeVerifier,
				redirectURI: data.redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				authentication: "basic",
				redirectURI,
				options,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				authentication: "basic",
				tokenEndpoint
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error: profileError } = await betterFetch("https://api.x.com/2/users/me?user.fields=profile_image_url", {
				method: "GET",
				headers: { Authorization: `Bearer ${token.accessToken}` }
			});
			if (profileError) return null;
			const { data: emailData, error: emailError } = await betterFetch("https://api.x.com/2/users/me?user.fields=confirmed_email", {
				method: "GET",
				headers: { Authorization: `Bearer ${token.accessToken}` }
			});
			let emailVerified = false;
			if (!emailError && emailData?.data?.confirmed_email) {
				profile.data.email = emailData.data.confirmed_email;
				emailVerified = true;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.data.id,
					name: profile.data.name,
					email: profile.data.email || profile.data.username || null,
					image: profile.data.profile_image_url,
					emailVerified,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/vercel.mjs
var vercel = (options) => {
	return {
		id: "vercel",
		name: "Vercel",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!codeVerifier) throw new BetterAuthError("codeVerifier is required for Vercel");
			let _scopes = void 0;
			if (options.scope !== void 0 || scopes !== void 0) {
				_scopes = [];
				if (options.scope) _scopes.push(...options.scope);
				if (scopes) _scopes.push(...scopes);
			}
			return createAuthorizationURL({
				id: "vercel",
				options,
				authorizationEndpoint: "https://vercel.com/oauth/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://api.vercel.com/login/oauth/token"
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.vercel.com/login/oauth/userinfo", { headers: { Authorization: `Bearer ${token.accessToken}` } });
			if (error || !profile) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name ?? profile.preferred_username ?? "",
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified ?? false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/vk.mjs
var vk = (options) => {
	const tokenEndpoint = "https://id.vk.com/oauth2/auth";
	return {
		id: "vk",
		name: "VK",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["email", "phone"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "vk",
				options,
				authorizationEndpoint: "https://id.vk.com/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI, deviceId }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
				options,
				deviceId,
				tokenEndpoint
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			return refreshAccessToken({
				refreshToken,
				options: {
					clientId: options.clientId,
					clientKey: options.clientKey,
					clientSecret: options.clientSecret
				},
				tokenEndpoint
			});
		},
		async getUserInfo(data) {
			if (options.getUserInfo) return options.getUserInfo(data);
			if (!data.accessToken) return null;
			const { data: profile, error } = await betterFetch("https://id.vk.com/oauth2/user_info", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					access_token: data.accessToken,
					client_id: options.clientId
				}).toString()
			});
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			if (!profile.user.email && !userMap?.email) return null;
			return {
				user: {
					id: profile.user.user_id,
					first_name: profile.user.first_name,
					last_name: profile.user.last_name,
					email: profile.user.email,
					image: profile.user.avatar,
					emailVerified: false,
					birthday: profile.user.birthday,
					sex: profile.user.sex,
					name: `${profile.user.first_name} ${profile.user.last_name}`,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/wechat.mjs
var wechat = (options) => {
	return {
		id: "wechat",
		name: "WeChat",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["snsapi_login"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
			url.searchParams.set("scope", _scopes.join(","));
			url.searchParams.set("response_type", "code");
			url.searchParams.set("appid", options.clientId);
			url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);
			url.searchParams.set("state", state);
			url.searchParams.set("lang", options.lang || "cn");
			url.hash = "wechat_redirect";
			return url;
		},
		validateAuthorizationCode: async ({ code }) => {
			const { data: tokenData, error } = await betterFetch("https://api.weixin.qq.com/sns/oauth2/access_token?" + new URLSearchParams({
				appid: options.clientId,
				secret: options.clientSecret,
				code,
				grant_type: "authorization_code"
			}).toString(), { method: "GET" });
			if (error || !tokenData || tokenData.errcode) throw new Error(`Failed to validate authorization code: ${tokenData?.errmsg || error?.message || "Unknown error"}`);
			return {
				tokenType: "Bearer",
				accessToken: tokenData.access_token,
				refreshToken: tokenData.refresh_token,
				accessTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1e3),
				scopes: tokenData.scope.split(","),
				openid: tokenData.openid,
				unionid: tokenData.unionid
			};
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => {
			const { data: tokenData, error } = await betterFetch("https://api.weixin.qq.com/sns/oauth2/refresh_token?" + new URLSearchParams({
				appid: options.clientId,
				grant_type: "refresh_token",
				refresh_token: refreshToken
			}).toString(), { method: "GET" });
			if (error || !tokenData || tokenData.errcode) throw new Error(`Failed to refresh access token: ${tokenData?.errmsg || error?.message || "Unknown error"}`);
			return {
				tokenType: "Bearer",
				accessToken: tokenData.access_token,
				refreshToken: tokenData.refresh_token,
				accessTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1e3),
				scopes: tokenData.scope.split(",")
			};
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const openid = token.openid;
			if (!openid) return null;
			const { data: profile, error } = await betterFetch("https://api.weixin.qq.com/sns/userinfo?" + new URLSearchParams({
				access_token: token.accessToken || "",
				openid,
				lang: "zh_CN"
			}).toString(), { method: "GET" });
			if (error || !profile || profile.errcode) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.unionid || profile.openid || openid,
					name: profile.nickname,
					email: profile.email || `${profile.unionid || profile.openid || openid}@wechat.invalid`,
					image: profile.headimgurl,
					emailVerified: false,
					...userMap
				},
				data: profile
			};
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/zoom.mjs
var zoom = (userOptions) => {
	const options = {
		pkce: true,
		...userOptions
	};
	return {
		id: "zoom",
		name: "Zoom",
		createAuthorizationURL: async ({ state, redirectURI, codeVerifier }) => {
			const params = new URLSearchParams({
				response_type: "code",
				redirect_uri: options.redirectURI ? options.redirectURI : redirectURI,
				client_id: options.clientId,
				state
			});
			if (options.pkce) {
				const codeChallenge = await generateCodeChallenge(codeVerifier);
				params.set("code_challenge_method", "S256");
				params.set("code_challenge", codeChallenge);
			}
			const url = new URL("https://zoom.us/oauth/authorize");
			url.search = params.toString();
			return url;
		},
		validateAuthorizationCode: async ({ code, redirectURI, codeVerifier }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				codeVerifier,
				options,
				tokenEndpoint: "https://zoom.us/oauth/token",
				authentication: "post"
			});
		},
		refreshAccessToken: options.refreshAccessToken ? options.refreshAccessToken : async (refreshToken) => refreshAccessToken({
			refreshToken,
			options: {
				clientId: options.clientId,
				clientKey: options.clientKey,
				clientSecret: options.clientSecret
			},
			tokenEndpoint: "https://zoom.us/oauth/token"
		}),
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch("https://api.zoom.us/v2/users/me", { headers: { authorization: `Bearer ${token.accessToken}` } });
			if (error) return null;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.display_name,
					image: profile.pic_url,
					email: profile.email,
					emailVerified: Boolean(profile.verified),
					...userMap
				},
				data: { ...profile }
			};
		}
	};
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+core@1.6.23+39b691393fbf5a26/node_modules/@better-auth/core/dist/social-providers/index.mjs
var socialProviders = {
	apple,
	atlassian,
	cognito,
	discord,
	facebook,
	figma,
	github,
	microsoft,
	google,
	huggingface,
	slack,
	spotify,
	twitch,
	twitter,
	dropbox,
	kick,
	linear,
	linkedin,
	gitlab,
	tiktok,
	reddit,
	roblox,
	salesforce,
	vk,
	zoom,
	notion,
	kakao,
	naver,
	line,
	paybin,
	paypal,
	polar,
	railway,
	vercel,
	wechat
};
var socialProviderList = Object.keys(socialProviders);
var SocialProviderListEnum = z$1.enum(socialProviderList).or(z$1.string());
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/account.mjs
var listUserAccounts = createAuthEndpoint("/list-accounts", {
	method: "GET",
	use: [sessionMiddleware],
	metadata: { openapi: {
		operationId: "listUserAccounts",
		description: "List all accounts linked to the user",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						providerId: { type: "string" },
						createdAt: {
							type: "string",
							format: "date-time"
						},
						updatedAt: {
							type: "string",
							format: "date-time"
						},
						accountId: { type: "string" },
						userId: { type: "string" },
						scopes: {
							type: "array",
							items: { type: "string" }
						}
					},
					required: [
						"id",
						"providerId",
						"createdAt",
						"updatedAt",
						"accountId",
						"userId",
						"scopes"
					]
				}
			} } }
		} }
	} }
}, async (c) => {
	const session = c.context.session;
	const accounts = await c.context.internalAdapter.findAccounts(session.user.id);
	return c.json(accounts.map((a) => {
		const { scope, ...parsed } = parseAccountOutput(c.context.options, a);
		return {
			...parsed,
			scopes: scope?.split(",") || []
		};
	}));
});
var linkSocialAccount = createAuthEndpoint("/link-social", {
	method: "POST",
	requireHeaders: true,
	body: z$1.object({
		callbackURL: z$1.string().meta({ description: "The URL to redirect to after the user has signed in" }).optional(),
		provider: SocialProviderListEnum,
		idToken: z$1.object({
			token: z$1.string(),
			nonce: z$1.string().optional(),
			accessToken: z$1.string().optional(),
			refreshToken: z$1.string().optional(),
			scopes: z$1.array(z$1.string()).optional()
		}).optional(),
		requestSignUp: z$1.boolean().optional(),
		scopes: z$1.array(z$1.string()).meta({ description: "Additional scopes to request from the provider" }).optional(),
		errorCallbackURL: z$1.string().meta({ description: "The URL to redirect to if there is an error during the link process" }).optional(),
		disableRedirect: z$1.boolean().meta({ description: "Disable automatic redirection to the provider. Useful for handling the redirection yourself" }).optional(),
		additionalData: z$1.record(z$1.string(), z$1.any()).optional()
	}),
	use: [sessionMiddleware],
	metadata: { openapi: {
		description: "Link a social account to the user",
		operationId: "linkSocialAccount",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					url: {
						type: "string",
						description: "The authorization URL to redirect the user to"
					},
					redirect: {
						type: "boolean",
						description: "Indicates if the user should be redirected to the authorization URL"
					},
					status: { type: "boolean" }
				},
				required: ["redirect"]
			} } }
		} }
	} }
}, async (c) => {
	const session = c.context.session;
	const provider = await getAwaitableValue(c.context.socialProviders, { value: c.body.provider });
	if (!provider) {
		c.context.logger.error("Provider not found. Make sure to add the provider in your auth config", { provider: c.body.provider });
		throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.PROVIDER_NOT_FOUND);
	}
	if (c.body.idToken) {
		if (!provider.verifyIdToken) {
			c.context.logger.error("Provider does not support id token verification", { provider: c.body.provider });
			throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.ID_TOKEN_NOT_SUPPORTED);
		}
		const { token, nonce } = c.body.idToken;
		if (!await provider.verifyIdToken(token, nonce)) {
			c.context.logger.warn("Invalid id token", { provider: c.body.provider });
			throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_TOKEN);
		}
		const linkingUserInfo = await provider.getUserInfo({
			idToken: token,
			accessToken: c.body.idToken.accessToken,
			refreshToken: c.body.idToken.refreshToken
		});
		if (!linkingUserInfo || !linkingUserInfo?.user) {
			c.context.logger.error("Failed to get user info", { provider: c.body.provider });
			throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO);
		}
		const linkingUserId = String(linkingUserInfo.user.id);
		if (!linkingUserInfo.user.email) {
			c.context.logger.error(missingEmailLogMessage(c.body.provider, { source: "id_token" }), { provider: c.body.provider });
			throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND);
		}
		if ((await c.context.internalAdapter.findAccounts(session.user.id)).find((a) => a.providerId === provider.id && a.accountId === linkingUserId)) return c.json({
			url: "",
			status: true,
			redirect: false
		});
		if (!c.context.trustedProviders.includes(provider.id) && !linkingUserInfo.user.emailVerified || c.context.options.account?.accountLinking?.enabled === false) throw APIError.from("UNAUTHORIZED", {
			message: "Account not linked - linking not allowed",
			code: "LINKING_NOT_ALLOWED"
		});
		if (linkingUserInfo.user.email?.toLowerCase() !== session.user.email.toLowerCase() && c.context.options.account?.accountLinking?.allowDifferentEmails !== true) throw APIError.from("UNAUTHORIZED", {
			message: "Account not linked - different emails not allowed",
			code: "LINKING_DIFFERENT_EMAILS_NOT_ALLOWED"
		});
		try {
			await c.context.internalAdapter.createAccount({
				userId: session.user.id,
				providerId: provider.id,
				accountId: linkingUserId,
				accessToken: c.body.idToken.accessToken,
				idToken: token,
				refreshToken: c.body.idToken.refreshToken,
				scope: c.body.idToken.scopes?.join(",")
			});
		} catch (_e) {
			throw APIError.from("EXPECTATION_FAILED", {
				message: "Account not linked - unable to create account",
				code: "LINKING_FAILED"
			});
		}
		await applyUpdateUserInfoOnLink(c, session.user.id, linkingUserInfo.user);
		return c.json({
			url: "",
			status: true,
			redirect: false
		});
	}
	const state = await generateState(c, {
		userId: session.user.id,
		email: session.user.email
	}, c.body.additionalData);
	const url = await provider.createAuthorizationURL({
		state: state.state,
		codeVerifier: state.codeVerifier,
		redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
		scopes: c.body.scopes
	});
	if (!c.body.disableRedirect) c.setHeader("Location", url.toString());
	return c.json({
		url: url.toString(),
		redirect: !c.body.disableRedirect
	});
});
var unlinkAccount = createAuthEndpoint("/unlink-account", {
	method: "POST",
	body: z$1.object({
		providerId: z$1.string(),
		accountId: z$1.string().optional()
	}),
	use: [freshSessionMiddleware],
	metadata: { openapi: {
		description: "Unlink an account",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { status: { type: "boolean" } }
			} } }
		} }
	} }
}, async (ctx) => {
	const { providerId, accountId } = ctx.body;
	const accounts = await ctx.context.internalAdapter.findAccounts(ctx.context.session.user.id);
	if (accounts.length === 1 && !ctx.context.options.account?.accountLinking?.allowUnlinkingAll) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT);
	const accountExist = accounts.find((account) => accountId ? account.accountId === accountId && account.providerId === providerId : account.providerId === providerId);
	if (!accountExist) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
	await ctx.context.internalAdapter.deleteAccount(accountExist.id);
	return ctx.json({ status: true });
});
/**
* Resolves the user id an account-token operation should act on.
*
* A caller reaching the server over HTTP (a request or session headers are
* present) must have a valid session, and that session's user always wins.
* A trusted server-side `auth.api` caller with no session may instead name a
* `userId` directly. Throws `UNAUTHORIZED` when an HTTP caller is
* unauthenticated, and `USER_ID_OR_SESSION_REQUIRED` when neither a session
* nor a `userId` is available.
*
* When a durable store is authoritative, bypasses the cookie cache: these
* routes mint or refresh provider access tokens, so a server-side session
* revocation must take effect immediately rather than waiting for the cached
* cookie to expire. DB-less deployments keep the session in the cookie itself,
* so the cache is left in place for them.
*/
async function resolveUserId(ctx, userId) {
	const session = await getSessionFromCtx(ctx, { disableCookieCache: isStateful(ctx) });
	if (!session && (ctx.request || ctx.headers)) throw ctx.error("UNAUTHORIZED");
	const resolvedUserId = session?.user?.id || userId;
	if (!resolvedUserId) throw APIError.from("BAD_REQUEST", {
		message: "Either userId or session is required",
		code: "USER_ID_OR_SESSION_REQUIRED"
	});
	return resolvedUserId;
}
function matchesAccountSelection(ctx, account, { resolvedUserId, providerId, accountId }) {
	return (!shouldBindAccountCookieToSessionUser(ctx.context.options) || account.userId === resolvedUserId) && (!providerId || providerId === account.providerId) && (!accountId || account.accountId === accountId);
}
/**
* Fetches a currently-valid access token for a user's provider account,
* refreshing and persisting it when it is within five seconds of expiry.
* Shared by the `/get-access-token` endpoint and `/account-info` so both
* resolve and refresh tokens through one path.
*/
async function getValidAccessToken(ctx, { resolvedUserId, providerId, accountId, account: resolvedAccount }) {
	const provider = await getAwaitableValue(ctx.context.socialProviders, { value: providerId });
	if (!provider) throw APIError.from("BAD_REQUEST", {
		message: `Provider ${providerId} is not supported.`,
		code: "PROVIDER_NOT_SUPPORTED"
	});
	let account = resolvedAccount;
	if (!account) {
		const accountData = await getAccountCookie(ctx);
		if (accountData && matchesAccountSelection(ctx, accountData, {
			resolvedUserId,
			providerId,
			accountId
		})) account = accountData;
		else account = (await ctx.context.internalAdapter.findAccounts(resolvedUserId)).find((acc) => accountId ? acc.accountId === accountId && acc.providerId === providerId : acc.providerId === providerId);
	}
	if (!account) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
	try {
		let newTokens = null;
		const accessTokenExpired = account.accessTokenExpiresAt && new Date(account.accessTokenExpiresAt).getTime() - Date.now() < 5e3;
		if (account.refreshToken && accessTokenExpired && provider.refreshAccessToken) {
			const refreshToken = await decryptOAuthToken(account.refreshToken, ctx.context);
			newTokens = await provider.refreshAccessToken(refreshToken);
			const updatedData = {
				accessToken: await setTokenUtil(newTokens?.accessToken, ctx.context),
				accessTokenExpiresAt: newTokens?.accessTokenExpiresAt,
				refreshToken: newTokens?.refreshToken ? await setTokenUtil(newTokens.refreshToken, ctx.context) : account.refreshToken,
				refreshTokenExpiresAt: newTokens?.refreshTokenExpiresAt ?? account.refreshTokenExpiresAt,
				idToken: newTokens?.idToken || account.idToken
			};
			let updatedAccount = null;
			if (account.id) updatedAccount = await ctx.context.internalAdapter.updateAccount(account.id, updatedData);
			if (ctx.context.options.account?.storeAccountCookie) await setAccountCookie(ctx, {
				...account,
				...updatedAccount ?? updatedData
			});
		}
		const accessTokenExpiresAt = (() => {
			if (newTokens?.accessTokenExpiresAt) {
				if (typeof newTokens.accessTokenExpiresAt === "string") return new Date(newTokens.accessTokenExpiresAt);
				return newTokens.accessTokenExpiresAt;
			}
			if (account.accessTokenExpiresAt) {
				if (typeof account.accessTokenExpiresAt === "string") return new Date(account.accessTokenExpiresAt);
				return account.accessTokenExpiresAt;
			}
		})();
		return {
			accessToken: newTokens?.accessToken ?? await decryptOAuthToken(account.accessToken ?? "", ctx.context),
			accessTokenExpiresAt,
			scopes: account.scope?.split(",") ?? [],
			idToken: newTokens?.idToken ?? account.idToken ?? void 0
		};
	} catch (_error) {
		throw APIError.from("BAD_REQUEST", {
			message: "Failed to get a valid access token",
			code: "FAILED_TO_GET_ACCESS_TOKEN"
		});
	}
}
var getAccessToken = createAuthEndpoint("/get-access-token", {
	method: "POST",
	body: z$1.object({
		providerId: z$1.string().meta({ description: "The provider ID for the OAuth provider" }),
		accountId: z$1.string().meta({ description: "The account ID associated with the refresh token" }).optional(),
		userId: z$1.string().meta({ description: "The user ID associated with the account" }).optional()
	}),
	metadata: { openapi: {
		description: "Get a valid access token, doing a refresh if needed",
		responses: {
			200: {
				description: "A Valid access token",
				content: { "application/json": { schema: {
					type: "object",
					properties: {
						tokenType: { type: "string" },
						idToken: { type: "string" },
						accessToken: { type: "string" },
						accessTokenExpiresAt: {
							type: "string",
							format: "date-time"
						}
					}
				} } }
			},
			400: { description: "Invalid refresh token or provider configuration" }
		}
	} }
}, async (ctx) => {
	const { providerId, accountId, userId } = ctx.body || {};
	const tokens = await getValidAccessToken(ctx, {
		resolvedUserId: await resolveUserId(ctx, userId),
		providerId,
		accountId
	});
	return ctx.json(tokens);
});
var refreshToken = createAuthEndpoint("/refresh-token", {
	method: "POST",
	body: z$1.object({
		providerId: z$1.string().meta({ description: "The provider ID for the OAuth provider" }),
		accountId: z$1.string().meta({ description: "The account ID associated with the refresh token" }).optional(),
		userId: z$1.string().meta({ description: "The user ID associated with the account" }).optional()
	}),
	metadata: { openapi: {
		description: "Refresh the access token using a refresh token",
		responses: {
			200: {
				description: "Access token refreshed successfully",
				content: { "application/json": { schema: {
					type: "object",
					properties: {
						tokenType: { type: "string" },
						idToken: { type: "string" },
						accessToken: { type: "string" },
						refreshToken: { type: "string" },
						accessTokenExpiresAt: {
							type: "string",
							format: "date-time"
						},
						refreshTokenExpiresAt: {
							type: "string",
							format: "date-time"
						}
					}
				} } }
			},
			400: { description: "Invalid refresh token or provider configuration" }
		}
	} }
}, async (ctx) => {
	const { providerId, accountId, userId } = ctx.body;
	const resolvedUserId = await resolveUserId(ctx, userId);
	const provider = await getAwaitableValue(ctx.context.socialProviders, { value: providerId });
	if (!provider) throw APIError.from("BAD_REQUEST", {
		message: `Provider ${providerId} is not supported.`,
		code: "PROVIDER_NOT_SUPPORTED"
	});
	if (!provider.refreshAccessToken) throw APIError.from("BAD_REQUEST", {
		message: `Provider ${providerId} does not support token refreshing.`,
		code: "TOKEN_REFRESH_NOT_SUPPORTED"
	});
	let account = void 0;
	const accountData = await getAccountCookie(ctx);
	const usedAccountCookie = !!accountData && matchesAccountSelection(ctx, accountData, {
		resolvedUserId,
		providerId,
		accountId
	});
	if (usedAccountCookie) account = accountData;
	else account = (await ctx.context.internalAdapter.findAccounts(resolvedUserId)).find((acc) => accountId ? acc.accountId === accountId && acc.providerId === providerId : acc.providerId === providerId);
	if (!account) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
	const refreshToken = account.refreshToken ?? void 0;
	if (!refreshToken) throw APIError.from("BAD_REQUEST", {
		message: "Refresh token not found",
		code: "REFRESH_TOKEN_NOT_FOUND"
	});
	try {
		const decryptedRefreshToken = await decryptOAuthToken(refreshToken, ctx.context);
		const tokens = await provider.refreshAccessToken(decryptedRefreshToken);
		const resolvedRefreshToken = tokens.refreshToken ? await setTokenUtil(tokens.refreshToken, ctx.context) : refreshToken;
		const resolvedRefreshTokenExpiresAt = tokens.refreshTokenExpiresAt ?? account.refreshTokenExpiresAt;
		if (account.id) {
			const updateData = {
				...account || {},
				accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
				refreshToken: resolvedRefreshToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshTokenExpiresAt: resolvedRefreshTokenExpiresAt,
				scope: tokens.scopes?.join(",") || account.scope,
				idToken: tokens.idToken || account.idToken
			};
			await ctx.context.internalAdapter.updateAccount(account.id, updateData);
		}
		if (usedAccountCookie && ctx.context.options.account?.storeAccountCookie) await setAccountCookie(ctx, {
			...accountData,
			accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
			refreshToken: resolvedRefreshToken,
			accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			refreshTokenExpiresAt: resolvedRefreshTokenExpiresAt,
			scope: tokens.scopes?.join(",") || accountData.scope,
			idToken: tokens.idToken || accountData.idToken
		});
		return ctx.json({
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken ?? decryptedRefreshToken,
			accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			refreshTokenExpiresAt: resolvedRefreshTokenExpiresAt,
			scope: tokens.scopes?.join(",") || account.scope,
			idToken: tokens.idToken || account.idToken,
			providerId: account.providerId,
			accountId: account.accountId
		});
	} catch (_error) {
		throw APIError.from("BAD_REQUEST", {
			message: "Failed to refresh access token",
			code: "FAILED_TO_REFRESH_ACCESS_TOKEN"
		});
	}
});
var accountInfo = createAuthEndpoint("/account-info", {
	method: "GET",
	metadata: { openapi: {
		description: "Get the account info provided by the provider",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					user: {
						type: "object",
						properties: {
							id: { type: "string" },
							name: { type: "string" },
							email: { type: "string" },
							image: { type: "string" },
							emailVerified: { type: "boolean" }
						},
						required: ["id", "emailVerified"]
					},
					data: {
						type: "object",
						properties: {},
						additionalProperties: true
					}
				},
				required: ["user", "data"],
				additionalProperties: false
			} } }
		} }
	} },
	query: z$1.optional(z$1.object({
		accountId: z$1.string().meta({ description: "The provider given account id for which to get the account info" }).optional(),
		providerId: z$1.string().meta({ description: "The provider ID to disambiguate provider-issued account IDs" }).optional(),
		userId: z$1.string().meta({ description: "The user ID associated with the account" }).optional()
	}))
}, async (ctx) => {
	const { accountId: providedAccountId, providerId: providedProviderId, userId } = ctx.query || {};
	const resolvedUserId = await resolveUserId(ctx, userId);
	let account = void 0;
	if (!providedAccountId) {
		if (ctx.context.options.account?.storeAccountCookie) {
			const accountData = await getAccountCookie(ctx);
			if (accountData && matchesAccountSelection(ctx, accountData, {
				resolvedUserId,
				providerId: providedProviderId
			})) account = accountData;
		}
	} else {
		const matchingAccounts = (await ctx.context.internalAdapter.findAccounts(resolvedUserId)).filter((acc) => acc.accountId === providedAccountId && (!providedProviderId || acc.providerId === providedProviderId));
		if (matchingAccounts.length > 1) throw APIError.from("BAD_REQUEST", {
			message: "Multiple accounts share this account ID. Pass a providerId to disambiguate.",
			code: "AMBIGUOUS_ACCOUNT"
		});
		account = matchingAccounts[0];
	}
	if (!account || !matchesAccountSelection(ctx, account, { resolvedUserId })) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.ACCOUNT_NOT_FOUND);
	const provider = await getAwaitableValue(ctx.context.socialProviders, { value: account.providerId });
	if (!provider) throw APIError.from("BAD_REQUEST", {
		message: "Account is not associated with a configured social provider.",
		code: "PROVIDER_NOT_CONFIGURED"
	});
	const tokens = await getValidAccessToken(ctx, {
		resolvedUserId,
		providerId: account.providerId,
		accountId: account.accountId,
		account
	});
	if (!tokens.accessToken) throw APIError.from("BAD_REQUEST", {
		message: "Access token not found",
		code: "ACCESS_TOKEN_NOT_FOUND"
	});
	const info = await provider.getUserInfo({
		...tokens,
		accessToken: tokens.accessToken
	});
	return ctx.json(info);
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/callback.mjs
var schema$2 = z$1.object({
	code: z$1.string().optional(),
	error: z$1.string().optional(),
	device_id: z$1.string().optional(),
	error_description: z$1.string().optional(),
	state: z$1.string().optional(),
	user: z$1.string().optional()
});
var callbackOAuth = createAuthEndpoint("/callback/:id", {
	method: ["GET", "POST"],
	operationId: "handleOAuthCallback",
	body: schema$2.optional(),
	query: schema$2.optional(),
	metadata: {
		...HIDE_METADATA,
		allowedMediaTypes: ["application/x-www-form-urlencoded", "application/json"]
	}
}, async (c) => {
	let queryOrBody;
	const defaultErrorURL = c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
	if (c.method === "POST") {
		const postData = c.body ? schema$2.parse(c.body) : {};
		const queryData = c.query ? schema$2.parse(c.query) : {};
		const mergedData = schema$2.parse({
			...postData,
			...queryData
		});
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(mergedData)) if (value !== void 0 && value !== null) params.set(key, String(value));
		const redirectURL = `${c.context.baseURL}/callback/${c.params.id}?${params.toString()}`;
		throw c.redirect(redirectURL);
	}
	try {
		if (c.method === "GET") queryOrBody = schema$2.parse(c.query);
		else if (c.method === "POST") queryOrBody = schema$2.parse(c.body);
		else throw new Error("Unsupported method");
	} catch (e) {
		c.context.logger.error("INVALID_CALLBACK_REQUEST", e);
		redirectOnError(c, defaultErrorURL, "invalid_callback_request");
	}
	const { code, error, error_description, device_id, user: userData } = queryOrBody;
	const { codeVerifier, callbackURL, link, errorURL, newUserURL, requestSignUp } = await parseState(c);
	const resolvedErrorURL = errorURL ?? defaultErrorURL;
	if (error) redirectOnError(c, resolvedErrorURL, error, error_description);
	if (!code) {
		c.context.logger.warn("Code not found");
		redirectOnError(c, resolvedErrorURL, "no_code");
	}
	const provider = await getAwaitableValue(c.context.socialProviders, { value: c.params.id });
	if (!provider) {
		c.context.logger.warn("OAuth provider not found", { providerId: c.params.id });
		redirectOnError(c, resolvedErrorURL, "oauth_provider_not_found");
	}
	let tokens;
	try {
		tokens = await provider.validateAuthorizationCode({
			code,
			codeVerifier,
			deviceId: device_id,
			redirectURI: `${c.context.baseURL}/callback/${provider.id}`
		});
	} catch (e) {
		c.context.logger.error("", e);
		redirectOnError(c, resolvedErrorURL, "invalid_code");
	}
	if (!tokens) redirectOnError(c, resolvedErrorURL, "invalid_code");
	const parsedUserData = userData ? safeJSONParse(userData) : null;
	const userInfo = await provider.getUserInfo({
		...tokens,
		user: parsedUserData ?? void 0
	}).then((res) => res?.user);
	if (!userInfo || userInfo.id === void 0 || userInfo.id === null || userInfo.id === "") {
		c.context.logger.error("Unable to get user info");
		redirectOnError(c, resolvedErrorURL, "unable_to_get_user_info");
	}
	const providerAccountId = String(userInfo.id);
	if (!callbackURL) {
		c.context.logger.error("No callback URL found");
		redirectOnError(c, resolvedErrorURL, "no_callback_url");
	}
	if (link) {
		if (!c.context.trustedProviders.includes(provider.id) && !userInfo.emailVerified || c.context.options.account?.accountLinking?.enabled === false) {
			c.context.logger.error("Unable to link account - untrusted provider");
			redirectOnError(c, resolvedErrorURL, "unable_to_link_account");
		}
		if (userInfo.email?.toLowerCase() !== link.email.toLowerCase() && c.context.options.account?.accountLinking?.allowDifferentEmails !== true) redirectOnError(c, resolvedErrorURL, "email_doesn't_match");
		const existingAccount = await c.context.internalAdapter.findAccountByProviderId(providerAccountId, provider.id);
		if (existingAccount) {
			if (existingAccount.userId.toString() !== link.userId.toString()) redirectOnError(c, resolvedErrorURL, "account_already_linked_to_different_user");
			const updateData = Object.fromEntries(Object.entries({
				accessToken: await setTokenUtil(tokens.accessToken, c.context),
				refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
				idToken: tokens.idToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
				scope: tokens.scopes?.join(",")
			}).filter(([_, value]) => value !== void 0));
			await c.context.internalAdapter.updateAccount(existingAccount.id, updateData);
		} else if (!await c.context.internalAdapter.createAccount({
			userId: link.userId,
			providerId: provider.id,
			accountId: providerAccountId,
			...tokens,
			accessToken: await setTokenUtil(tokens.accessToken, c.context),
			refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
			scope: tokens.scopes?.join(",")
		})) redirectOnError(c, resolvedErrorURL, "unable_to_link_account");
		await applyUpdateUserInfoOnLink(c, link.userId, userInfo);
		let toRedirectTo;
		try {
			toRedirectTo = callbackURL.toString();
		} catch {
			toRedirectTo = callbackURL;
		}
		throw c.redirect(toRedirectTo);
	}
	if (!userInfo.email) {
		c.context.logger.error(missingEmailLogMessage(provider.id));
		redirectOnError(c, resolvedErrorURL, "email_not_found");
	}
	const accountData = {
		providerId: provider.id,
		accountId: providerAccountId,
		...tokens,
		scope: tokens.scopes?.join(",")
	};
	let result;
	try {
		result = await handleOAuthUserInfo(c, {
			userInfo: {
				...userInfo,
				id: providerAccountId,
				email: userInfo.email,
				name: userInfo.name || ""
			},
			account: accountData,
			callbackURL,
			disableSignUp: provider.disableImplicitSignUp && !requestSignUp || provider.options?.disableSignUp,
			overrideUserInfo: provider.options?.overrideUserInfoOnSignIn
		});
	} catch (e) {
		if (isAPIError(e) && e.body?.code) redirectOnError(c, resolvedErrorURL, e.body.code, e.body.message);
		throw e;
	}
	if (result.error) {
		c.context.logger.error(result.error.split(" ").join("_"));
		redirectOnError(c, resolvedErrorURL, result.error.split(" ").join("_"));
	}
	const { session, user } = result.data;
	await setSessionCookie(c, {
		session,
		user
	});
	let toRedirectTo;
	try {
		toRedirectTo = (result.isRegister ? newUserURL || callbackURL : callbackURL).toString();
	} catch {
		toRedirectTo = result.isRegister ? newUserURL || callbackURL : callbackURL;
	}
	throw c.redirect(toRedirectTo);
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/error.mjs
function sanitize(input) {
	return input.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/&(?!amp;|lt;|gt;|quot;|#39;|#x[0-9a-fA-F]+;|#[0-9]+;)/g, "&amp;");
}
var html = (options, code = "Unknown", description = null) => {
	const custom = options.onAPIError?.customizeDefaultErrorPage;
	return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Error</title>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        font-family: ${custom?.font?.defaultFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"};
        background: ${custom?.colors?.background || "var(--background)"};
        color: var(--foreground);
        margin: 0;
      }
      :root,
      :host {
        --spacing: 0.25rem;
        --container-md: 28rem;
        --text-sm: ${custom?.size?.textSm || "0.875rem"};
        --text-sm--line-height: calc(1.25 / 0.875);
        --text-2xl: ${custom?.size?.text2xl || "1.5rem"};
        --text-2xl--line-height: calc(2 / 1.5);
        --text-4xl: ${custom?.size?.text4xl || "2.25rem"};
        --text-4xl--line-height: calc(2.5 / 2.25);
        --text-6xl: ${custom?.size?.text6xl || "3rem"};
        --text-6xl--line-height: 1;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;
        --default-transition-duration: 150ms;
        --default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        --radius: ${custom?.size?.radiusSm || "0.625rem"};
        --default-mono-font-family: ${custom?.font?.monoFamily || "var(--font-geist-mono)"};
        --primary: ${custom?.colors?.primary || "black"};
        --primary-foreground: ${custom?.colors?.primaryForeground || "white"};
        --background: ${custom?.colors?.background || "white"};
        --foreground: ${custom?.colors?.foreground || "oklch(0.271 0 0)"};
        --border: ${custom?.colors?.border || "oklch(0.89 0 0)"};
        --destructive: ${custom?.colors?.destructive || "oklch(0.55 0.15 25.723)"};
        --muted-foreground: ${custom?.colors?.mutedForeground || "oklch(0.545 0 0)"};
        --corner-border: ${custom?.colors?.cornerBorder || "#404040"};
      }

      button, .btn {
        cursor: pointer;
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        transition: all var(--default-transition-duration)
          var(--default-transition-timing-function);
      }
      button:hover, .btn:hover {
        opacity: 0.8;
      }

      @media (prefers-color-scheme: dark) {
        :root,
        :host {
          --primary: ${custom?.colors?.primary || "white"};
          --primary-foreground: ${custom?.colors?.primaryForeground || "black"};
          --background: ${custom?.colors?.background || "oklch(0.15 0 0)"};
          --foreground: ${custom?.colors?.foreground || "oklch(0.98 0 0)"};
          --border: ${custom?.colors?.border || "oklch(0.27 0 0)"};
          --destructive: ${custom?.colors?.destructive || "oklch(0.65 0.15 25.723)"};
          --muted-foreground: ${custom?.colors?.mutedForeground || "oklch(0.65 0 0)"};
          --corner-border: ${custom?.colors?.cornerBorder || "#a0a0a0"};
        }
      }
      @media (max-width: 640px) {
        :root, :host {
          --text-6xl: 2.5rem;
          --text-2xl: 1.25rem;
          --text-sm: 0.8125rem;
        }
      }
      @media (max-width: 480px) {
        :root, :host {
          --text-6xl: 2rem;
          --text-2xl: 1.125rem;
        }
      }
    </style>
  </head>
  <body style="width: 100vw; min-height: 100vh; overflow-x: hidden; overflow-y: auto;">
    <div
        style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1.5rem;
            position: relative;
            width: 100%;
            min-height: 100vh;
            padding: 1rem;
        "
        >
${custom?.disableBackgroundGrid ? "" : `
      <div
        style="
          position: absolute;
          inset: 0;
          background-image: linear-gradient(to right, ${custom?.colors?.gridColor || "var(--border)"} 1px, transparent 1px),
            linear-gradient(to bottom, ${custom?.colors?.gridColor || "var(--border)"} 1px, transparent 1px);
          background-size: 40px 40px;
          opacity: 0.6;
          pointer-events: none;
          width: 100vw;
          height: 100vh;
        "
      ></div>
      <div
        style="
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${custom?.colors?.background || "var(--background)"};
          mask-image: radial-gradient(ellipse at center, transparent 20%, black);
          -webkit-mask-image: radial-gradient(ellipse at center, transparent 20%, black);
          pointer-events: none;
        "
      ></div>
`}

<div
  style="
    position: relative;
    z-index: 10;
    border: 2px solid var(--border);
    background: ${custom?.colors?.cardBackground || "var(--background)"};
    padding: 1.5rem;
    max-width: 42rem;
    width: 100%;
  "
>
    ${custom?.disableCornerDecorations ? "" : `
        <!-- Corner decorations -->
        <div
          style="
            position: absolute;
            top: -2px;
            left: -2px;
            width: 2rem;
            height: 2rem;
            border-top: 4px solid var(--corner-border);
            border-left: 4px solid var(--corner-border);
          "
        ></div>
        <div
          style="
            position: absolute;
            top: -2px;
            right: -2px;
            width: 2rem;
            height: 2rem;
            border-top: 4px solid var(--corner-border);
            border-right: 4px solid var(--corner-border);
          "
        ></div>
  
        <div
          style="
            position: absolute;
            bottom: -2px;
            left: -2px;
            width: 2rem;
            height: 2rem;
            border-bottom: 4px solid var(--corner-border);
            border-left: 4px solid var(--corner-border);
          "
        ></div>
        <div
          style="
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 2rem;
            height: 2rem;
            border-bottom: 4px solid var(--corner-border);
            border-right: 4px solid var(--corner-border);
          "
        ></div>`}

        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="margin-bottom: 1.5rem;">
            <div
              style="
                display: inline-block;
                border: 2px solid ${custom?.disableTitleBorder ? "transparent" : custom?.colors?.titleBorder || "var(--destructive)"};
                padding: 0.375rem 1rem;
              "
            >
              <h1
                style="
                  font-size: var(--text-6xl);
                  font-weight: var(--font-weight-semibold);
                  color: ${custom?.colors?.titleColor || "var(--foreground)"};
                  letter-spacing: -0.02em;
                  margin: 0;
                "
              >
                ERROR
              </h1>
            </div>
            <div
              style="
                height: 2px;
                background-color: var(--border);
                width: calc(100% + 3rem);
                margin-left: -1.5rem;
                margin-top: 1.5rem;
              "
            ></div>
          </div>

          <h2
            style="
              font-size: var(--text-2xl);
              font-weight: var(--font-weight-semibold);
              color: var(--foreground);
              margin: 0 0 1rem;
            "
          >
            Something went wrong
          </h2>

          <div
            style="
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                border: 2px solid var(--border);
                background-color: var(--muted);
                padding: 0.375rem 0.75rem;
                margin: 0 0 1rem;
                flex-wrap: wrap;
                justify-content: center;
            "
            >
            <span
                style="
                font-size: 0.75rem;
                color: var(--muted-foreground);
                font-weight: var(--font-weight-semibold);
                "
            >
                CODE:
            </span>
            <span
                style="
                font-size: var(--text-sm);
                font-family: var(--default-mono-font-family, monospace);
                color: var(--foreground);
                word-break: break-all;
                "
            >
                ${sanitize(code)}
            </span>
            </div>

          <p
            style="
              color: var(--muted-foreground);
              max-width: 28rem;
              margin: 0 auto;
              font-size: var(--text-sm);
              line-height: 1.5;
              text-wrap: pretty;
            "
          >
            ${!description ? `We encountered an unexpected error. Please try again or return to the home page. If you're a developer, you can find <a href='https://better-auth.com/docs/reference/errors/${encodeURIComponent(code)}' target='_blank' rel="noopener noreferrer" style='color: var(--foreground); text-decoration: underline;'>more information about the error</a>.` : description}
          </p>
        </div>

        <div
          style="
            display: flex;
            gap: 0.75rem;
            margin-top: 1.5rem;
            justify-content: center;
            flex-wrap: wrap;
          "
        >
          <a
            href="/"
            style="
              text-decoration: none;
            "
          >
            <div
              style="
                border: 2px solid var(--border);
                background: var(--primary);
                color: var(--primary-foreground);
                padding: 0.5rem 1rem;
                border-radius: 0;
                white-space: nowrap;
              "
              class="btn"
            >
              Go Home
            </div>
          </a>
          <a
            href="https://better-auth.com/docs/reference/errors/${encodeURIComponent(code)}?askai=${encodeURIComponent(`What does the error code ${code} mean?`)}"
            target="_blank"
            rel="noopener noreferrer"
            style="
              text-decoration: none;
            "
          >
            <div
              style="
                border: 2px solid var(--border);
                background: transparent;
                color: var(--foreground);
                padding: 0.5rem 1rem;
                border-radius: 0;
                white-space: nowrap;
              "
              class="btn"
            >
              Ask AI
            </div>
          </a>
        </div>
      </div>
    </div>
  </body>
</html>`;
};
var error = createAuthEndpoint("/error", {
	method: "GET",
	metadata: {
		...HIDE_METADATA,
		openapi: {
			description: "Displays an error page",
			responses: { "200": {
				description: "Success",
				content: { "text/html": { schema: {
					type: "string",
					description: "The HTML content of the error page"
				} } }
			} }
		}
	}
}, async (c) => {
	const url = new URL(c.request?.url || "");
	const unsanitizedCode = url.searchParams.get("error") || "UNKNOWN";
	const unsanitizedDescription = url.searchParams.get("error_description") || null;
	const safeCode = /^[\'A-Za-z0-9_-]+$/.test(unsanitizedCode || "") ? unsanitizedCode : "UNKNOWN";
	const safeDescription = unsanitizedDescription ? sanitize(unsanitizedDescription) : null;
	const queryParams = new URLSearchParams();
	queryParams.set("error", safeCode);
	if (unsanitizedDescription) queryParams.set("error_description", unsanitizedDescription);
	const options = c.context.options;
	const errorURL = options.onAPIError?.errorURL;
	if (errorURL) return new Response(null, {
		status: 302,
		headers: { Location: `${errorURL}${errorURL.includes("?") ? "&" : "?"}${queryParams.toString()}` }
	});
	if (isProduction && !options.onAPIError?.customizeDefaultErrorPage) return new Response(null, {
		status: 302,
		headers: { Location: `/?${queryParams.toString()}` }
	});
	return new Response(html(c.context.options, safeCode, safeDescription), { headers: { "Content-Type": "text/html" } });
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/ok.mjs
var ok = createAuthEndpoint("/ok", {
	method: "GET",
	metadata: {
		...HIDE_METADATA,
		openapi: {
			description: "Check if the API is working",
			responses: { "200": {
				description: "API is working",
				content: { "application/json": { schema: {
					type: "object",
					properties: { ok: {
						type: "boolean",
						description: "Indicates if the API is working"
					} },
					required: ["ok"]
				} } }
			} }
		}
	}
}, async (ctx) => {
	return ctx.json({ ok: true });
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/utils/password.mjs
async function validatePassword(ctx, data) {
	const credentialAccount = (await ctx.context.internalAdapter.findAccounts(data.userId))?.find((account) => account.providerId === "credential");
	const currentPassword = credentialAccount?.password;
	if (!credentialAccount || !currentPassword) return false;
	return await ctx.context.password.verify({
		hash: currentPassword,
		password: data.password
	});
}
async function checkPassword(userId, c) {
	const credentialAccount = (await c.context.internalAdapter.findAccounts(userId))?.find((account) => account.providerId === "credential");
	const currentPassword = credentialAccount?.password;
	const password = c.body.password;
	if (!credentialAccount || !currentPassword || !password) {
		if (password) await c.context.password.hash(password);
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	}
	if (!await c.context.password.verify({
		hash: currentPassword,
		password
	})) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	return true;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/password.mjs
function redirectError(ctx, callbackURL, query) {
	const url = callbackURL ? new URL(callbackURL, ctx.baseURL) : new URL(`${ctx.baseURL}/error`);
	if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
	return url.href;
}
function redirectCallback(ctx, callbackURL, query) {
	const url = new URL(callbackURL, ctx.baseURL);
	if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
	return url.href;
}
var requestPasswordReset = createAuthEndpoint("/request-password-reset", {
	method: "POST",
	body: z$1.object({
		email: z$1.email().meta({ description: "The email address of the user to send a password reset email to" }),
		redirectTo: z$1.string().meta({ description: "The URL to redirect the user to reset their password. If the token isn't valid or expired, it'll be redirected with a query parameter `?error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?token=VALID_TOKEN" }).optional()
	}),
	metadata: { openapi: {
		operationId: "requestPasswordReset",
		description: "Send a password reset email to the user",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					status: { type: "boolean" },
					message: { type: "string" }
				}
			} } }
		} }
	} },
	use: [originCheck((ctx) => ctx.body.redirectTo)]
}, async (ctx) => {
	if (!ctx.context.options.emailAndPassword?.sendResetPassword) {
		ctx.context.logger.error("Reset password isn't enabled.Please pass an emailAndPassword.sendResetPassword function in your auth config!");
		throw APIError.from("BAD_REQUEST", {
			message: "Reset password isn't enabled",
			code: "RESET_PASSWORD_DISABLED"
		});
	}
	const { email, redirectTo } = ctx.body;
	const user = await ctx.context.internalAdapter.findUserByEmail(email, { includeAccounts: true });
	if (!user) {
		/**
		* We simulate the verification token generation and the database lookup
		* to mitigate timing attacks.
		*/
		generateId$1(24);
		await ctx.context.internalAdapter.findVerificationValue("dummy-verification-token");
		ctx.context.logger.warn("Reset Password: User not found");
		return ctx.json({
			status: true,
			message: "If this email exists in our system, check your email for the reset link"
		});
	}
	const expiresAt = getDate(ctx.context.options.emailAndPassword.resetPasswordTokenExpiresIn || 3600 * 1, "sec");
	const verificationToken = generateId$1(24);
	await ctx.context.internalAdapter.createVerificationValue({
		value: user.user.id,
		identifier: `reset-password:${verificationToken}`,
		expiresAt
	});
	const callbackURL = redirectTo ? encodeURIComponent(redirectTo) : "";
	const url = `${ctx.context.baseURL}/reset-password/${verificationToken}?callbackURL=${callbackURL}`;
	await ctx.context.runInBackgroundOrAwait(ctx.context.options.emailAndPassword.sendResetPassword({
		user: user.user,
		url,
		token: verificationToken
	}, ctx.request));
	return ctx.json({
		status: true,
		message: "If this email exists in our system, check your email for the reset link"
	});
});
var requestPasswordResetCallback = createAuthEndpoint("/reset-password/:token", {
	method: "GET",
	operationId: "resetPasswordCallback",
	query: z$1.object({ callbackURL: z$1.string().meta({ description: "The URL to redirect the user to reset their password" }) }),
	use: [originCheck((ctx) => ctx.query.callbackURL)],
	metadata: { openapi: {
		operationId: "resetPasswordCallback",
		description: "Redirects the user to the callback URL with the token",
		parameters: [{
			name: "token",
			in: "path",
			required: true,
			description: "The token to reset the password",
			schema: { type: "string" }
		}, {
			name: "callbackURL",
			in: "query",
			required: true,
			description: "The URL to redirect the user to reset their password",
			schema: { type: "string" }
		}],
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { token: { type: "string" } }
			} } }
		} }
	} }
}, async (ctx) => {
	const { token } = ctx.params;
	const { callbackURL } = ctx.query;
	if (!token || !callbackURL) throw ctx.redirect(redirectError(ctx.context, callbackURL, { error: "INVALID_TOKEN" }));
	const verification = await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`);
	if (!verification || verification.expiresAt < /* @__PURE__ */ new Date()) throw ctx.redirect(redirectError(ctx.context, callbackURL, { error: "INVALID_TOKEN" }));
	throw ctx.redirect(redirectCallback(ctx.context, callbackURL, { token }));
});
var resetPassword = createAuthEndpoint("/reset-password", {
	method: "POST",
	operationId: "resetPassword",
	query: z$1.object({ token: z$1.string().optional() }).optional(),
	body: z$1.object({
		newPassword: z$1.string().meta({ description: "The new password to set" }),
		token: z$1.string().meta({ description: "The token to reset the password" }).optional()
	}),
	metadata: { openapi: {
		operationId: "resetPassword",
		description: "Reset the password for a user",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { status: { type: "boolean" } }
			} } }
		} }
	} }
}, async (ctx) => {
	const token = ctx.body.token || ctx.query?.token;
	if (!token) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_TOKEN);
	const { newPassword } = ctx.body;
	const minLength = ctx.context.password?.config.minPasswordLength;
	const maxLength = ctx.context.password?.config.maxPasswordLength;
	if (newPassword.length < minLength) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
	if (newPassword.length > maxLength) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
	const id = `reset-password:${token}`;
	const verification = await ctx.context.internalAdapter.consumeVerificationValue(id);
	if (!verification) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_TOKEN);
	const userId = verification.value;
	const hashedPassword = await ctx.context.password.hash(newPassword);
	if (!(await ctx.context.internalAdapter.findAccounts(userId)).find((ac) => ac.providerId === "credential")) await ctx.context.internalAdapter.createAccount({
		userId,
		providerId: "credential",
		password: hashedPassword,
		accountId: userId
	});
	else await ctx.context.internalAdapter.updatePassword(userId, hashedPassword);
	if (ctx.context.options.emailAndPassword?.onPasswordReset) {
		const user = await ctx.context.internalAdapter.findUserById(userId);
		if (user) await ctx.context.options.emailAndPassword.onPasswordReset({ user }, ctx.request);
	}
	if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset) await ctx.context.internalAdapter.deleteUserSessions(userId);
	return ctx.json({ status: true });
});
var verifyPassword = createAuthEndpoint("/verify-password", {
	method: "POST",
	body: z$1.object({ password: z$1.string().meta({ description: "The password to verify" }) }),
	metadata: {
		scope: "server",
		openapi: {
			operationId: "verifyPassword",
			description: "Verify the current user's password",
			responses: { "200": {
				description: "Success",
				content: { "application/json": { schema: {
					type: "object",
					properties: { status: { type: "boolean" } }
				} } }
			} }
		}
	},
	use: [sensitiveSessionMiddleware]
}, async (ctx) => {
	const { password } = ctx.body;
	const session = ctx.context.session;
	if (!await validatePassword(ctx, {
		password,
		userId: session.user.id
	})) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	return ctx.json({ status: true });
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/sign-in.mjs
var socialSignInBodySchema = z$1.object({
	callbackURL: z$1.string().meta({ description: "Callback URL to redirect to after the user has signed in" }).optional(),
	newUserCallbackURL: z$1.string().optional(),
	errorCallbackURL: z$1.string().meta({ description: "Callback URL to redirect to if an error happens" }).optional(),
	provider: SocialProviderListEnum,
	disableRedirect: z$1.boolean().meta({ description: "Disable automatic redirection to the provider. Useful for handling the redirection yourself" }).optional(),
	idToken: z$1.optional(z$1.object({
		token: z$1.string().meta({ description: "ID token from the provider" }),
		nonce: z$1.string().meta({ description: "Nonce used to generate the token" }).optional(),
		accessToken: z$1.string().meta({ description: "Access token from the provider" }).optional(),
		refreshToken: z$1.string().meta({ description: "Refresh token from the provider" }).optional(),
		expiresAt: z$1.number().meta({ description: "Expiry date of the token" }).optional(),
		user: z$1.object({
			name: z$1.object({
				firstName: z$1.string().optional(),
				lastName: z$1.string().optional()
			}).optional(),
			email: z$1.string().optional()
		}).meta({ description: "The user object from the provider. Only available for some providers like Apple." }).optional()
	})),
	scopes: z$1.array(z$1.string()).meta({ description: "Array of scopes to request from the provider. This will override the default scopes passed." }).optional(),
	requestSignUp: z$1.boolean().meta({ description: "Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider" }).optional(),
	loginHint: z$1.string().meta({ description: "The login hint to use for the authorization code request" }).optional(),
	additionalData: z$1.record(z$1.string(), z$1.any()).optional().meta({ description: "Additional data to be passed through the OAuth flow" })
});
var signInSocial = () => createAuthEndpoint("/sign-in/social", {
	method: "POST",
	operationId: "socialSignIn",
	body: socialSignInBodySchema,
	metadata: {
		$Infer: {
			body: {},
			returned: {}
		},
		openapi: {
			description: "Sign in with a social provider",
			operationId: "socialSignIn",
			responses: { "200": {
				description: "Success - Returns session details (idToken branch) or an authorize URL (redirect branch)",
				content: { "application/json": { schema: {
					type: "object",
					description: "Returns session details when idToken is provided, or an authorize URL otherwise",
					properties: {
						token: { type: "string" },
						user: {
							type: "object",
							$ref: "#/components/schemas/User"
						},
						url: { type: "string" },
						redirect: { type: "boolean" }
					},
					required: ["redirect"]
				} } }
			} }
		}
	}
}, async (c) => {
	const provider = await getAwaitableValue(c.context.socialProviders, { value: c.body.provider });
	if (!provider) {
		c.context.logger.error("Provider not found. Make sure to add the provider in your auth config", { provider: c.body.provider });
		throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.PROVIDER_NOT_FOUND);
	}
	if (c.body.idToken) {
		if (!provider.verifyIdToken) {
			c.context.logger.error("Provider does not support id token verification", { provider: c.body.provider });
			throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.ID_TOKEN_NOT_SUPPORTED);
		}
		const { token, nonce } = c.body.idToken;
		if (!await provider.verifyIdToken(token, nonce)) {
			c.context.logger.warn("Invalid id token", { provider: c.body.provider });
			throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_TOKEN);
		}
		const userInfo = await provider.getUserInfo({
			idToken: token,
			accessToken: c.body.idToken.accessToken,
			refreshToken: c.body.idToken.refreshToken,
			user: c.body.idToken.user
		});
		if (!userInfo || !userInfo?.user) {
			c.context.logger.error("Failed to get user info", { provider: c.body.provider });
			throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO);
		}
		if (!userInfo.user.email) {
			c.context.logger.error(missingEmailLogMessage(c.body.provider, { source: "id_token" }), { provider: c.body.provider });
			throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND);
		}
		const data = await handleOAuthUserInfo(c, {
			userInfo: {
				...userInfo.user,
				email: userInfo.user.email,
				id: String(userInfo.user.id),
				name: userInfo.user.name || "",
				image: userInfo.user.image,
				emailVerified: userInfo.user.emailVerified || false
			},
			account: {
				providerId: provider.id,
				accountId: String(userInfo.user.id),
				accessToken: c.body.idToken.accessToken
			},
			callbackURL: c.body.callbackURL,
			disableSignUp: provider.disableImplicitSignUp && !c.body.requestSignUp || provider.disableSignUp
		});
		if (data.error) throw APIError.from("UNAUTHORIZED", {
			message: data.error,
			code: "OAUTH_LINK_ERROR"
		});
		await setSessionCookie(c, data.data);
		return c.json({
			redirect: false,
			token: data.data.session.token,
			url: void 0,
			user: parseUserOutput(c.context.options, data.data.user)
		});
	}
	const { codeVerifier, state } = await generateState(c, void 0, c.body.additionalData);
	const url = await provider.createAuthorizationURL({
		state,
		codeVerifier,
		redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
		scopes: c.body.scopes,
		loginHint: c.body.loginHint
	});
	if (!c.body.disableRedirect) c.setHeader("Location", url.toString());
	return c.json({
		url: url.toString(),
		redirect: !c.body.disableRedirect
	});
});
var signInEmail = () => createAuthEndpoint("/sign-in/email", {
	method: "POST",
	operationId: "signInEmail",
	use: [formCsrfMiddleware],
	cloneRequest: true,
	body: z$1.object({
		email: z$1.string().meta({ description: "Email of the user" }),
		password: z$1.string().meta({ description: "Password of the user" }),
		callbackURL: z$1.string().meta({ description: "Callback URL to use as a redirect for email verification" }).optional(),
		rememberMe: z$1.boolean().meta({ description: "If this is false, the session will not be remembered. Default is `true`." }).default(true).optional()
	}),
	metadata: {
		allowedMediaTypes: ["application/x-www-form-urlencoded", "application/json"],
		$Infer: {
			body: {},
			returned: {}
		},
		openapi: {
			operationId: "signInEmail",
			description: "Sign in with email and password",
			responses: { "200": {
				description: "Success - Returns either session details or redirect URL",
				content: { "application/json": { schema: {
					type: "object",
					description: "Session response when idToken is provided",
					properties: {
						redirect: {
							type: "boolean",
							enum: [false]
						},
						token: {
							type: "string",
							description: "Session token"
						},
						url: {
							type: "string",
							nullable: true
						},
						user: {
							type: "object",
							$ref: "#/components/schemas/User"
						}
					},
					required: [
						"redirect",
						"token",
						"user"
					]
				} } }
			} }
		}
	}
}, async (ctx) => {
	if (!ctx.context.options?.emailAndPassword?.enabled) {
		ctx.context.logger.error("Email and password is not enabled. Make sure to enable it in the options on you `auth.ts` file. Check `https://better-auth.com/docs/authentication/email-password` for more!");
		throw APIError.from("BAD_REQUEST", {
			code: "EMAIL_PASSWORD_DISABLED",
			message: "Email and password is not enabled"
		});
	}
	const { email, password } = ctx.body;
	if (!z$1.email().safeParse(email).success) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
	const user = await ctx.context.internalAdapter.findUserByEmail(email, { includeAccounts: true });
	if (!user) {
		await ctx.context.password.hash(password);
		ctx.context.logger.warn("User not found");
		throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
	}
	const credentialAccount = user.accounts.find((a) => a.providerId === "credential");
	if (!credentialAccount) {
		await ctx.context.password.hash(password);
		ctx.context.logger.warn("Credential account not found");
		throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
	}
	const currentPassword = credentialAccount?.password;
	if (!currentPassword) {
		await ctx.context.password.hash(password);
		ctx.context.logger.warn("Password not found");
		throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
	}
	if (!await ctx.context.password.verify({
		hash: currentPassword,
		password
	})) {
		ctx.context.logger.warn("Invalid password");
		throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
	}
	if (ctx.context.options?.emailAndPassword?.requireEmailVerification && !user.user.emailVerified) {
		if (!ctx.context.options?.emailVerification?.sendVerificationEmail) throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED);
		if (ctx.context.options?.emailVerification?.sendOnSignIn) {
			const token = await createEmailVerificationToken(ctx.context.secret, user.user.email, void 0, ctx.context.options.emailVerification?.expiresIn);
			const callbackURL = ctx.body.callbackURL ? encodeURIComponent(ctx.body.callbackURL) : encodeURIComponent("/");
			const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
			await ctx.context.runInBackgroundOrAwait(ctx.context.options.emailVerification.sendVerificationEmail({
				user: user.user,
				url,
				token
			}, ctx.request?.clone()));
		}
		throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED);
	}
	const session = await ctx.context.internalAdapter.createSession(user.user.id, ctx.body.rememberMe === false);
	if (!session) {
		ctx.context.logger.error("Failed to create session");
		throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION);
	}
	await setSessionCookie(ctx, {
		session,
		user: user.user
	}, ctx.body.rememberMe === false);
	if (ctx.body.callbackURL) ctx.setHeader("Location", ctx.body.callbackURL);
	return ctx.json({
		redirect: !!ctx.body.callbackURL,
		token: session.token,
		url: ctx.body.callbackURL,
		user: parseUserOutput(ctx.context.options, user.user)
	});
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/sign-out.mjs
var signOut = createAuthEndpoint("/sign-out", {
	method: "POST",
	operationId: "signOut",
	requireHeaders: true,
	metadata: { openapi: {
		operationId: "signOut",
		description: "Sign out the current user",
		responses: { "200": {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { success: { type: "boolean" } }
			} } }
		} }
	} }
}, async (ctx) => {
	const sessionCookieToken = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
	if (sessionCookieToken) try {
		await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
	} catch (e) {
		ctx.context.logger.error("Failed to delete session from database", e);
	}
	deleteSessionCookie(ctx);
	return ctx.json({ success: true });
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/sign-up.mjs
var signUpEmailBodySchema = z$1.object({
	name: z$1.string(),
	email: z$1.email(),
	password: z$1.string().nonempty(),
	image: z$1.string().optional(),
	callbackURL: z$1.string().optional(),
	rememberMe: z$1.boolean().optional()
}).and(z$1.record(z$1.string(), z$1.any()));
var signUpEmail = () => createAuthEndpoint("/sign-up/email", {
	method: "POST",
	operationId: "signUpWithEmailAndPassword",
	use: [formCsrfMiddleware],
	body: signUpEmailBodySchema,
	cloneRequest: true,
	metadata: {
		allowedMediaTypes: ["application/x-www-form-urlencoded", "application/json"],
		$Infer: {
			body: {},
			returned: {}
		},
		openapi: {
			operationId: "signUpWithEmailAndPassword",
			description: "Sign up a user using email and password",
			requestBody: { content: { "application/json": { schema: {
				type: "object",
				properties: {
					name: {
						type: "string",
						description: "The name of the user"
					},
					email: {
						type: "string",
						description: "The email of the user"
					},
					password: {
						type: "string",
						description: "The password of the user"
					},
					image: {
						type: "string",
						description: "The profile image URL of the user"
					},
					callbackURL: {
						type: "string",
						description: "The URL to use for email verification callback"
					},
					rememberMe: {
						type: "boolean",
						description: "If this is false, the session will not be remembered. Default is `true`."
					}
				},
				required: [
					"name",
					"email",
					"password"
				]
			} } } },
			responses: {
				"200": {
					description: "Successfully created user",
					content: { "application/json": { schema: {
						type: "object",
						properties: {
							token: {
								type: "string",
								nullable: true,
								description: "Authentication token for the session"
							},
							user: {
								type: "object",
								properties: {
									id: {
										type: "string",
										description: "The unique identifier of the user"
									},
									email: {
										type: "string",
										format: "email",
										description: "The email address of the user"
									},
									name: {
										type: "string",
										description: "The name of the user"
									},
									image: {
										type: "string",
										format: "uri",
										nullable: true,
										description: "The profile image URL of the user"
									},
									emailVerified: {
										type: "boolean",
										description: "Whether the email has been verified"
									},
									createdAt: {
										type: "string",
										format: "date-time",
										description: "When the user was created"
									},
									updatedAt: {
										type: "string",
										format: "date-time",
										description: "When the user was last updated"
									}
								},
								required: [
									"id",
									"email",
									"name",
									"emailVerified",
									"createdAt",
									"updatedAt"
								]
							}
						},
						required: ["user"]
					} } }
				},
				"422": {
					description: "Unprocessable Entity. User already exists or failed to create user.",
					content: { "application/json": { schema: {
						type: "object",
						properties: { message: { type: "string" } }
					} } }
				}
			}
		}
	}
}, async (ctx) => {
	return runWithTransaction(ctx.context.adapter, async () => {
		if (!ctx.context.options.emailAndPassword?.enabled || ctx.context.options.emailAndPassword?.disableSignUp) throw APIError.from("BAD_REQUEST", {
			message: "Email and password sign up is not enabled",
			code: "EMAIL_PASSWORD_SIGN_UP_DISABLED"
		});
		const body = ctx.body;
		const { name, email, password, image, callbackURL: _callbackURL, rememberMe, ...rest } = body;
		if (!z$1.email().safeParse(email).success) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
		if (!password || typeof password !== "string") throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
		const minPasswordLength = ctx.context.password.config.minPasswordLength;
		if (password.length < minPasswordLength) {
			ctx.context.logger.warn("Password is too short");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
		}
		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
		if (password.length > maxPasswordLength) {
			ctx.context.logger.warn("Password is too long");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
		}
		const shouldReturnGenericDuplicateResponse = ctx.context.options.emailAndPassword.requireEmailVerification || ctx.context.options.emailAndPassword.autoSignIn === false;
		const shouldSkipAutoSignIn = ctx.context.options.emailAndPassword.autoSignIn === false || shouldReturnGenericDuplicateResponse;
		const additionalUserFields = parseUserInput(ctx.context.options, rest, "create");
		const normalizedEmail = email.toLowerCase();
		const dbUser = await ctx.context.internalAdapter.findUserByEmail(normalizedEmail);
		if (dbUser?.user) {
			ctx.context.logger.info(`Sign-up attempt for existing email: ${email}`);
			if (shouldReturnGenericDuplicateResponse) {
				/**
				* Hash the password to reduce timing differences
				* between existing and non-existing emails.
				*/
				await ctx.context.password.hash(password);
				if (ctx.context.options.emailAndPassword?.onExistingUserSignUp) await ctx.context.runInBackgroundOrAwait(ctx.context.options.emailAndPassword.onExistingUserSignUp({ user: dbUser.user }, ctx.request?.clone()));
				const now = /* @__PURE__ */ new Date();
				const generatedId = ctx.context.generateId({ model: "user" }) || generateId$1();
				const coreFields = {
					name,
					email: normalizedEmail,
					emailVerified: false,
					image: image ?? null,
					createdAt: now,
					updatedAt: now
				};
				const customSyntheticUser = ctx.context.options.emailAndPassword?.customSyntheticUser;
				let syntheticUser;
				if (customSyntheticUser) {
					const additionalFieldKeys = Object.keys(ctx.context.options.user?.additionalFields ?? {});
					const additionalFields = {};
					for (const key of additionalFieldKeys) if (key in additionalUserFields) additionalFields[key] = additionalUserFields[key];
					const customResult = customSyntheticUser({
						coreFields,
						additionalFields,
						id: generatedId
					});
					syntheticUser = buildSyntheticUserOutput(ctx.context.options, customResult);
				} else syntheticUser = buildSyntheticUserOutput(ctx.context.options, {
					...coreFields,
					...additionalUserFields,
					id: generatedId
				});
				return ctx.json({
					token: null,
					user: parseUserOutput(ctx.context.options, syntheticUser)
				});
			}
			throw APIError.from("UNPROCESSABLE_ENTITY", BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL);
		}
		/**
		* Hash the password
		*
		* This is done prior to creating the user
		* to ensure that any plugin that
		* may break the hashing should break
		* before the user is created.
		*/
		const hash = await ctx.context.password.hash(password);
		let createdUser;
		try {
			createdUser = await ctx.context.internalAdapter.createUser({
				email: normalizedEmail,
				name,
				image,
				...additionalUserFields,
				emailVerified: false
			});
			if (!createdUser) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.FAILED_TO_CREATE_USER);
		} catch (e) {
			if (isDevelopment()) ctx.context.logger.error("Failed to create user", e);
			if (isAPIError(e)) throw e;
			ctx.context.logger?.error("Failed to create user", e);
			throw APIError.from("UNPROCESSABLE_ENTITY", BASE_ERROR_CODES.FAILED_TO_CREATE_USER);
		}
		if (!createdUser) throw APIError.from("UNPROCESSABLE_ENTITY", BASE_ERROR_CODES.FAILED_TO_CREATE_USER);
		await ctx.context.internalAdapter.linkAccount({
			userId: createdUser.id,
			providerId: "credential",
			accountId: createdUser.id,
			password: hash
		});
		if (ctx.context.options.emailVerification?.sendOnSignUp ?? ctx.context.options.emailAndPassword.requireEmailVerification) {
			const token = await createEmailVerificationToken(ctx.context.secret, createdUser.email, void 0, ctx.context.options.emailVerification?.expiresIn);
			const callbackURL = body.callbackURL ? encodeURIComponent(body.callbackURL) : encodeURIComponent("/");
			const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
			if (ctx.context.options.emailVerification?.sendVerificationEmail) await ctx.context.runInBackgroundOrAwait(ctx.context.options.emailVerification.sendVerificationEmail({
				user: createdUser,
				url,
				token
			}, ctx.request?.clone()));
		}
		if (shouldSkipAutoSignIn) return ctx.json({
			token: null,
			user: parseUserOutput(ctx.context.options, createdUser)
		});
		const session = await ctx.context.internalAdapter.createSession(createdUser.id, rememberMe === false);
		if (!session) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION);
		await setSessionCookie(ctx, {
			session,
			user: createdUser
		}, rememberMe === false);
		return ctx.json({
			token: session.token,
			user: parseUserOutput(ctx.context.options, createdUser)
		});
	});
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/update-session.mjs
var updateSessionBodySchema = z$1.record(z$1.string().meta({ description: "Field name must be a string" }), z$1.any());
var updateSession = () => createAuthEndpoint("/update-session", {
	method: "POST",
	operationId: "updateSession",
	body: updateSessionBodySchema,
	use: [sessionMiddleware],
	metadata: {
		$Infer: { body: {} },
		openapi: {
			operationId: "updateSession",
			description: "Update the current session",
			responses: { "200": {
				description: "Success",
				content: { "application/json": { schema: {
					type: "object",
					properties: { session: {
						type: "object",
						$ref: "#/components/schemas/Session"
					} }
				} } }
			} }
		}
	}
}, async (ctx) => {
	const body = ctx.body;
	if (typeof body !== "object" || Array.isArray(body)) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.BODY_MUST_BE_AN_OBJECT);
	const session = ctx.context.session;
	const additionalFields = parseSessionInput(ctx.context.options, body, "update");
	if (Object.keys(additionalFields).length === 0) throw APIError.fromStatus("BAD_REQUEST", { message: "No fields to update" });
	const updatedSession = await ctx.context.internalAdapter.updateSession(session.session.token, {
		...additionalFields,
		updatedAt: /* @__PURE__ */ new Date()
	});
	if (!updatedSession && isStateful(ctx)) {
		deleteSessionCookie(ctx);
		throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.FAILED_TO_GET_SESSION);
	}
	const newSession = updatedSession ?? {
		...session.session,
		...additionalFields,
		updatedAt: /* @__PURE__ */ new Date()
	};
	await setSessionCookie(ctx, {
		session: newSession,
		user: session.user
	});
	return ctx.json({ session: parseSessionOutput(ctx.context.options, newSession) });
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/routes/update-user.mjs
var updateUserBodySchema = z$1.record(z$1.string().meta({ description: "Field name must be a string" }), z$1.any());
var updateUser = () => createAuthEndpoint("/update-user", {
	method: "POST",
	operationId: "updateUser",
	body: updateUserBodySchema,
	use: [sessionMiddleware],
	metadata: {
		$Infer: { body: {} },
		openapi: {
			operationId: "updateUser",
			description: "Update the current user",
			requestBody: { content: { "application/json": { schema: {
				type: "object",
				properties: {
					name: {
						type: "string",
						description: "The name of the user"
					},
					image: {
						type: "string",
						description: "The image of the user",
						nullable: true
					}
				}
			} } } },
			responses: { "200": {
				description: "Success",
				content: { "application/json": { schema: {
					type: "object",
					properties: { user: {
						type: "object",
						$ref: "#/components/schemas/User"
					} }
				} } }
			} }
		}
	}
}, async (ctx) => {
	const body = ctx.body;
	if (typeof body !== "object" || Array.isArray(body)) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.BODY_MUST_BE_AN_OBJECT);
	if (body.email) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.EMAIL_CAN_NOT_BE_UPDATED);
	const { name, image, ...rest } = body;
	const session = ctx.context.session;
	const additionalFields = parseUserInput(ctx.context.options, rest, "update");
	if (image === void 0 && name === void 0 && Object.keys(additionalFields).length === 0) throw APIError.fromStatus("BAD_REQUEST", { message: "No fields to update" });
	const updatedUser = await ctx.context.internalAdapter.updateUser(session.user.id, {
		name,
		image,
		...additionalFields
	}) ?? {
		...session.user,
		...name !== void 0 && { name },
		...image !== void 0 && { image },
		...additionalFields
	};
	/**
	* Update the session cookie with the new user data
	*/
	await setSessionCookie(ctx, {
		session: session.session,
		user: updatedUser
	});
	return ctx.json({ status: true });
});
var changePassword = createAuthEndpoint("/change-password", {
	method: "POST",
	operationId: "changePassword",
	body: z$1.object({
		newPassword: z$1.string().meta({ description: "The new password to set" }),
		currentPassword: z$1.string().meta({ description: "The current password is required" }),
		revokeOtherSessions: z$1.boolean().meta({ description: "Must be a boolean value" }).optional()
	}),
	use: [sensitiveSessionMiddleware],
	metadata: { openapi: {
		operationId: "changePassword",
		description: "Change the password of the user",
		responses: { "200": {
			description: "Password successfully changed",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					token: {
						type: "string",
						nullable: true,
						description: "New session token if other sessions were revoked"
					},
					user: {
						type: "object",
						properties: {
							id: {
								type: "string",
								description: "The unique identifier of the user"
							},
							email: {
								type: "string",
								format: "email",
								description: "The email address of the user"
							},
							name: {
								type: "string",
								description: "The name of the user"
							},
							image: {
								type: "string",
								format: "uri",
								nullable: true,
								description: "The profile image URL of the user"
							},
							emailVerified: {
								type: "boolean",
								description: "Whether the email has been verified"
							},
							createdAt: {
								type: "string",
								format: "date-time",
								description: "When the user was created"
							},
							updatedAt: {
								type: "string",
								format: "date-time",
								description: "When the user was last updated"
							}
						},
						required: [
							"id",
							"email",
							"name",
							"emailVerified",
							"createdAt",
							"updatedAt"
						]
					}
				},
				required: ["user"]
			} } }
		} }
	} }
}, async (ctx) => {
	const { newPassword, currentPassword, revokeOtherSessions } = ctx.body;
	const session = ctx.context.session;
	const minPasswordLength = ctx.context.password.config.minPasswordLength;
	if (newPassword.length < minPasswordLength) {
		ctx.context.logger.warn("Password is too short");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
	}
	const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
	if (newPassword.length > maxPasswordLength) {
		ctx.context.logger.warn("Password is too long");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
	}
	const account = (await ctx.context.internalAdapter.findAccounts(session.user.id)).find((account) => account.providerId === "credential" && account.password);
	if (!account || !account.password) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND);
	const passwordHash = await ctx.context.password.hash(newPassword);
	if (!await ctx.context.password.verify({
		hash: account.password,
		password: currentPassword
	})) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	await ctx.context.internalAdapter.updateAccount(account.id, { password: passwordHash });
	let token = null;
	if (revokeOtherSessions) {
		await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
		const newSession = await ctx.context.internalAdapter.createSession(session.user.id);
		if (!newSession) throw APIError.from("INTERNAL_SERVER_ERROR", BASE_ERROR_CODES.FAILED_TO_GET_SESSION);
		await setSessionCookie(ctx, {
			session: newSession,
			user: session.user
		});
		token = newSession.token;
	}
	return ctx.json({
		token,
		user: parseUserOutput(ctx.context.options, session.user)
	});
});
var setPassword = createAuthEndpoint.serverOnly({
	method: "POST",
	body: z$1.object({ newPassword: z$1.string().meta({ description: "The new password to set is required" }) }),
	use: [sensitiveSessionMiddleware]
}, async (ctx) => {
	const { newPassword } = ctx.body;
	const session = ctx.context.session;
	const minPasswordLength = ctx.context.password.config.minPasswordLength;
	if (newPassword.length < minPasswordLength) {
		ctx.context.logger.warn("Password is too short");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
	}
	const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
	if (newPassword.length > maxPasswordLength) {
		ctx.context.logger.warn("Password is too long");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
	}
	const account = (await ctx.context.internalAdapter.findAccounts(session.user.id)).find((account) => account.providerId === "credential" && account.password);
	const passwordHash = await ctx.context.password.hash(newPassword);
	if (!account) {
		await ctx.context.internalAdapter.linkAccount({
			userId: session.user.id,
			providerId: "credential",
			accountId: session.user.id,
			password: passwordHash
		});
		return ctx.json({ status: true });
	}
	throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_ALREADY_SET);
});
var deleteUser = createAuthEndpoint("/delete-user", {
	method: "POST",
	use: [sensitiveSessionMiddleware],
	body: z$1.object({
		callbackURL: z$1.string().meta({ description: "The callback URL to redirect to after the user is deleted" }).optional(),
		password: z$1.string().meta({ description: "The password of the user is required to delete the user" }).optional(),
		token: z$1.string().meta({ description: "The token to delete the user is required" }).optional()
	}),
	metadata: { openapi: {
		operationId: "deleteUser",
		description: "Delete the user",
		requestBody: { content: { "application/json": { schema: {
			type: "object",
			properties: {
				callbackURL: {
					type: "string",
					description: "The callback URL to redirect to after the user is deleted"
				},
				password: {
					type: "string",
					description: "The user's password. Required if session is not fresh"
				},
				token: {
					type: "string",
					description: "The deletion verification token"
				}
			}
		} } } },
		responses: { "200": {
			description: "User deletion processed successfully",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					success: {
						type: "boolean",
						description: "Indicates if the operation was successful"
					},
					message: {
						type: "string",
						enum: ["User deleted", "Verification email sent"],
						description: "Status message of the deletion process"
					}
				},
				required: ["success", "message"]
			} } }
		} }
	} }
}, async (ctx) => {
	if (!ctx.context.options.user?.deleteUser?.enabled) {
		ctx.context.logger.error("Delete user is disabled. Enable it in the options");
		throw APIError.fromStatus("NOT_FOUND");
	}
	const session = ctx.context.session;
	if (ctx.body.password) {
		const account = (await ctx.context.internalAdapter.findAccounts(session.user.id)).find((account) => account.providerId === "credential" && account.password);
		if (!account || !account.password) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND);
		if (!await ctx.context.password.verify({
			hash: account.password,
			password: ctx.body.password
		})) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	}
	if (ctx.body.token) {
		await deleteUserCallback({
			...ctx,
			query: { token: ctx.body.token }
		});
		return ctx.json({
			success: true,
			message: "User deleted"
		});
	}
	if (ctx.context.options.user.deleteUser?.sendDeleteAccountVerification) {
		const token = generateRandomString(32, "0-9", "a-z");
		await ctx.context.internalAdapter.createVerificationValue({
			value: session.user.id,
			identifier: `delete-account-${token}`,
			expiresAt: new Date(Date.now() + (ctx.context.options.user.deleteUser?.deleteTokenExpiresIn || 3600 * 24) * 1e3)
		});
		const url = `${ctx.context.baseURL}/delete-user/callback?token=${token}&callbackURL=${encodeURIComponent(ctx.body.callbackURL || "/")}`;
		await ctx.context.runInBackgroundOrAwait(ctx.context.options.user.deleteUser.sendDeleteAccountVerification({
			user: session.user,
			url,
			token
		}, ctx.request));
		return ctx.json({
			success: true,
			message: "Verification email sent"
		});
	}
	if (!ctx.body.password && ctx.context.sessionConfig.freshAge !== 0) {
		const createdAt = new Date(session.session.createdAt).getTime();
		const freshAge = ctx.context.sessionConfig.freshAge * 1e3;
		if (Date.now() - createdAt >= freshAge) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.SESSION_EXPIRED);
	}
	const beforeDelete = ctx.context.options.user.deleteUser?.beforeDelete;
	if (beforeDelete) await beforeDelete(session.user, ctx.request);
	await ctx.context.internalAdapter.deleteUser(session.user.id);
	await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
	deleteSessionCookie(ctx);
	const afterDelete = ctx.context.options.user.deleteUser?.afterDelete;
	if (afterDelete) await afterDelete(session.user, ctx.request);
	return ctx.json({
		success: true,
		message: "User deleted"
	});
});
var deleteUserCallback = createAuthEndpoint("/delete-user/callback", {
	method: "GET",
	query: z$1.object({
		token: z$1.string().meta({ description: "The token to verify the deletion request" }),
		callbackURL: z$1.string().meta({ description: "The URL to redirect to after deletion" }).optional()
	}),
	use: [originCheck((ctx) => ctx.query.callbackURL)],
	metadata: { openapi: {
		description: "Callback to complete user deletion with verification token",
		responses: { "200": {
			description: "User successfully deleted",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					success: {
						type: "boolean",
						description: "Indicates if the deletion was successful"
					},
					message: {
						type: "string",
						enum: ["User deleted"],
						description: "Confirmation message"
					}
				},
				required: ["success", "message"]
			} } }
		} }
	} }
}, async (ctx) => {
	if (!ctx.context.options.user?.deleteUser?.enabled) {
		ctx.context.logger.error("Delete user is disabled. Enable it in the options");
		throw APIError.from("NOT_FOUND", {
			message: "Not found",
			code: "NOT_FOUND"
		});
	}
	const session = await getSessionFromCtx(ctx, { disableCookieCache: isStateful(ctx) });
	if (!session) throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO);
	const token = await ctx.context.internalAdapter.consumeVerificationValue(`delete-account-${ctx.query.token}`);
	if (!token || token.value !== session.user.id) throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.INVALID_TOKEN);
	const beforeDelete = ctx.context.options.user.deleteUser?.beforeDelete;
	if (beforeDelete) await beforeDelete(session.user, ctx.request);
	await ctx.context.internalAdapter.deleteUser(session.user.id);
	await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
	await ctx.context.internalAdapter.deleteAccounts(session.user.id);
	deleteSessionCookie(ctx);
	const afterDelete = ctx.context.options.user.deleteUser?.afterDelete;
	if (afterDelete) await afterDelete(session.user, ctx.request);
	if (ctx.query.callbackURL) throw ctx.redirect(ctx.query.callbackURL || "/");
	return ctx.json({
		success: true,
		message: "User deleted"
	});
});
var changeEmail = createAuthEndpoint("/change-email", {
	method: "POST",
	body: z$1.object({
		newEmail: z$1.email().meta({ description: "The new email address to set must be a valid email address" }),
		callbackURL: z$1.string().meta({ description: "The URL to redirect to after email verification" }).optional()
	}),
	use: [sensitiveSessionMiddleware],
	metadata: { openapi: {
		operationId: "changeEmail",
		responses: { "200": {
			description: "Email change request processed successfully",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					user: {
						type: "object",
						$ref: "#/components/schemas/User"
					},
					status: {
						type: "boolean",
						description: "Indicates if the request was successful"
					},
					message: {
						type: "string",
						enum: ["Email updated", "Verification email sent"],
						description: "Status message of the email change process",
						nullable: true
					}
				},
				required: ["status"]
			} } }
		} }
	} }
}, async (ctx) => {
	if (!ctx.context.options.user?.changeEmail?.enabled) {
		ctx.context.logger.error("Change email is disabled.");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED);
	}
	const newEmail = ctx.body.newEmail.toLowerCase();
	if (newEmail === ctx.context.session.user.email) {
		ctx.context.logger.warn("Email is the same");
		throw APIError.fromStatus("BAD_REQUEST", { message: "Email is the same" });
	}
	/**
	* Early config check: ensure at least one email-change flow is
	* available for the current session state. Without this, an
	* existing-email lookup would return 200 while a non-existing
	* email would later throw 400, leaking email existence.
	*/
	const canUpdateWithoutVerification = ctx.context.session.user.emailVerified !== true && ctx.context.options.user.changeEmail.updateEmailWithoutVerification;
	const canSendVerification = ctx.context.options.emailVerification?.sendVerificationEmail;
	const canSendConfirmation = canSendVerification && ctx.context.session.user.emailVerified && ctx.context.options.user.changeEmail.sendChangeEmailConfirmation;
	if (!canUpdateWithoutVerification && !canSendConfirmation && !canSendVerification) {
		ctx.context.logger.error("Verification email isn't enabled.");
		throw APIError.fromStatus("BAD_REQUEST", { message: "Verification email isn't enabled" });
	}
	if (await ctx.context.internalAdapter.findUserByEmail(newEmail)) {
		await createEmailVerificationToken(ctx.context.secret, ctx.context.session.user.email, newEmail, ctx.context.options.emailVerification?.expiresIn);
		ctx.context.logger.info("Change email attempt for existing email");
		return ctx.json({ status: true });
	}
	/**
	* If the email is not verified, we can update the email if the option is enabled
	*/
	if (canUpdateWithoutVerification) {
		await ctx.context.internalAdapter.updateUserByEmail(ctx.context.session.user.email, { email: newEmail });
		await setSessionCookie(ctx, {
			session: ctx.context.session.session,
			user: {
				...ctx.context.session.user,
				email: newEmail
			}
		});
		if (canSendVerification) {
			const token = await createEmailVerificationToken(ctx.context.secret, newEmail, void 0, ctx.context.options.emailVerification?.expiresIn);
			const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(ctx.body.callbackURL || "/")}`;
			await ctx.context.runInBackgroundOrAwait(canSendVerification({
				user: {
					...ctx.context.session.user,
					email: newEmail
				},
				url,
				token
			}, ctx.request));
		}
		return ctx.json({ status: true });
	}
	/**
	* If the email is verified, we need to send a verification email
	*/
	if (canSendConfirmation) {
		const token = await createEmailVerificationToken(ctx.context.secret, ctx.context.session.user.email, newEmail, ctx.context.options.emailVerification?.expiresIn, { requestType: "change-email-confirmation" });
		const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(ctx.body.callbackURL || "/")}`;
		await ctx.context.runInBackgroundOrAwait(canSendConfirmation({
			user: ctx.context.session.user,
			newEmail,
			url,
			token
		}, ctx.request));
		return ctx.json({ status: true });
	}
	if (!canSendVerification) {
		ctx.context.logger.error("Verification email isn't enabled.");
		throw APIError.fromStatus("BAD_REQUEST", { message: "Verification email isn't enabled" });
	}
	const token = await createEmailVerificationToken(ctx.context.secret, ctx.context.session.user.email, newEmail, ctx.context.options.emailVerification?.expiresIn, { requestType: "change-email-verification" });
	const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(ctx.body.callbackURL || "/")}`;
	await ctx.context.runInBackgroundOrAwait(canSendVerification({
		user: {
			...ctx.context.session.user,
			email: newEmail
		},
		url,
		token
	}, ctx.request));
	return ctx.json({ status: true });
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/dispatch.mjs
var defuReplaceArrays = createDefu((obj, key, value) => {
	if (Array.isArray(obj[key]) && Array.isArray(value)) {
		obj[key] = value;
		return true;
	}
});
var hooksSourceWeakMap = /* @__PURE__ */ new WeakMap();
/**
* Resolves the operation id used for spans, preferring an explicit
* `operationId`, then the OpenAPI one, then the caller's `fallback` (the
* `auth.api.*` map key), and finally the route path.
*/
function getOperationId(endpoint, fallback) {
	const opts = endpoint.options;
	return opts?.operationId ?? opts?.metadata?.openapi?.operationId ?? fallback ?? endpoint.path ?? "/:virtual";
}
/**
* Merge a set of response headers onto the dispatch's accumulator, appending
* `set-cookie` (multiple cookies are legal) and replacing everything else.
*/
function mergeResponseHeaders(context, headers) {
	if (!headers) return;
	headers.forEach((value, key) => {
		if (!context.responseHeaders) context.responseHeaders = new Headers({ [key]: value });
		else if (key.toLowerCase() === "set-cookie") context.responseHeaders.append(key, value);
		else context.responseHeaders.set(key, value);
	});
}
/**
* Combine the two header sources an `APIError` can carry into one set:
* - `kAPIErrorHeaderSymbol`: `ctx.responseHeaders` accumulated via
*   `c.setCookie` / `c.setHeader` before the throw.
* - `e.headers`: explicit headers on the error (e.g. `location` from
*   `c.redirect`).
*
* `c.redirect()` reuses `ctx.responseHeaders` as `e.headers`, so when both
* point at the same object iterating each would duplicate every `set-cookie`;
* the identity check skips that copy. Explicit error headers override
* accumulated ones, while cookies from both accumulate.
*/
function mergeAPIErrorHeaders(error) {
	const ctxHeaders = error[kAPIErrorHeaderSymbol];
	const errHeaders = error.headers && error.headers !== ctxHeaders ? new Headers(error.headers) : null;
	if (!ctxHeaders && !errHeaders) return null;
	const headers = new Headers();
	ctxHeaders?.forEach((value, key) => {
		headers.append(key, value);
	});
	errHeaders?.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie") headers.append(key, value);
		else headers.set(key, value);
	});
	return headers;
}
async function runBeforeHooks(context, hooks, endpoint, operationId) {
	let modifiedContext = {};
	for (const hook of hooks) {
		let matched = false;
		try {
			matched = hook.matcher(context);
		} catch (error) {
			const hookSource = hooksSourceWeakMap.get(hook.handler) ?? "unknown";
			context.context.logger.error(`An error occurred during ${hookSource} hook matcher execution:`, error);
			throw new APIError("INTERNAL_SERVER_ERROR", { message: "An error occurred during hook matcher execution. Check the logs for more details." });
		}
		if (!matched) continue;
		const hookSource = hooksSourceWeakMap.get(hook.handler) ?? "unknown";
		const route = endpoint.path ?? "/:virtual";
		const result = await withSpan(`hook before ${route} ${hookSource}`, {
			[ATTR_HOOK_TYPE]: "before",
			[ATTR_HTTP_ROUTE]: route,
			[ATTR_CONTEXT]: hookSource,
			[ATTR_OPERATION_ID]: operationId
		}, () => hook.handler({
			...context,
			returnHeaders: true
		})).catch((e) => {
			if (isAPIError(e) && shouldPublishLog(context.context.logger.level, "debug")) e.stack = e.errorStack;
			throw e;
		});
		mergeResponseHeaders(context.context, result?.headers);
		const hookReturn = result?.response;
		if (hookReturn && typeof hookReturn === "object") {
			if ("context" in hookReturn && typeof hookReturn.context === "object") {
				const { headers, ...rest } = hookReturn.context;
				if (headers instanceof Headers) if (modifiedContext.headers) headers.forEach((value, key) => {
					modifiedContext.headers?.set(key, value);
				});
				else modifiedContext.headers = headers;
				modifiedContext = defuReplaceArrays(rest, modifiedContext);
				continue;
			}
			return hookReturn;
		}
	}
	return { context: modifiedContext };
}
async function runAfterHooks(context, hooks, endpoint, operationId) {
	for (const hook of hooks) {
		if (!hook.matcher(context)) continue;
		const hookSource = hooksSourceWeakMap.get(hook.handler) ?? "unknown";
		const route = endpoint.path ?? "/:virtual";
		const result = await withSpan(`hook after ${route} ${hookSource}`, {
			[ATTR_HOOK_TYPE]: "after",
			[ATTR_HTTP_ROUTE]: route,
			[ATTR_CONTEXT]: hookSource,
			[ATTR_OPERATION_ID]: operationId
		}, () => hook.handler(context)).catch((e) => {
			if (isAPIError(e)) {
				if (shouldPublishLog(context.context.logger.level, "debug")) e.stack = e.errorStack;
				return {
					response: e,
					headers: mergeAPIErrorHeaders(e)
				};
			}
			throw e;
		});
		mergeResponseHeaders(context.context, result.headers);
		if (result.response !== void 0) context.context.returned = result.response;
	}
	return {
		response: context.context.returned,
		headers: context.context.responseHeaders
	};
}
function getHooks(authContext) {
	const plugins = authContext.options.plugins || [];
	const beforeHooks = [];
	const afterHooks = [];
	const beforeHookHandler = authContext.options.hooks?.before;
	if (beforeHookHandler) {
		hooksSourceWeakMap.set(beforeHookHandler, "user");
		beforeHooks.push({
			matcher: () => true,
			handler: beforeHookHandler
		});
	}
	const afterHookHandler = authContext.options.hooks?.after;
	if (afterHookHandler) {
		hooksSourceWeakMap.set(afterHookHandler, "user");
		afterHooks.push({
			matcher: () => true,
			handler: afterHookHandler
		});
	}
	const pluginBeforeHooks = plugins.flatMap((plugin) => (plugin.hooks?.before ?? []).map((h) => {
		hooksSourceWeakMap.set(h.handler, `plugin:${plugin.id}`);
		return h;
	}));
	const pluginAfterHooks = plugins.flatMap((plugin) => (plugin.hooks?.after ?? []).map((h) => {
		hooksSourceWeakMap.set(h.handler, `plugin:${plugin.id}`);
		return h;
	}));
	if (pluginBeforeHooks.length) beforeHooks.push(...pluginBeforeHooks);
	if (pluginAfterHooks.length) afterHooks.push(...pluginAfterHooks);
	return {
		beforeHooks,
		afterHooks
	};
}
/**
* Run a single endpoint through the configured `hooks.before` / `hooks.after`
* pipeline, normalizing the response, headers, and `APIError`s the same way a
* router or `auth.api.*` dispatch does.
*
* This is the canonical hook runner. The HTTP router and `auth.api.*` reach it
* through {@link toAuthEndpoints}. Plugins call it directly when they need to
* re-enter the pipeline on purpose, such as resuming `/oauth2/authorize` after
* a fresh sign-in. Calling an endpoint as a plain function deliberately skips
* hooks; `dispatchAuthEndpoint` is the supported way to opt back in.
*
* @param endpoint The endpoint to dispatch.
* @param input Input context whose `context` is an already-resolved `AuthContext`.
*/
async function dispatchAuthEndpoint(endpoint, input) {
	const operationId = input.operationId ?? getOperationId(endpoint);
	const route = endpoint.path ?? "/:virtual";
	const endpointMethod = endpoint.options?.method;
	const defaultMethod = Array.isArray(endpointMethod) ? endpointMethod[0] : endpointMethod;
	const methodName = input.method ?? input.request?.method ?? defaultMethod ?? "?";
	const shouldReturnResponse = input.asResponse ?? isRequestLike(input.request);
	let internalContext = {
		...input,
		context: {
			...input.context,
			returned: void 0,
			responseHeaders: void 0,
			session: input.context.session ?? null
		},
		path: endpoint.path,
		headers: input.headers ? new Headers(input.headers) : void 0
	};
	return withSpan(`${methodName} ${route}`, {
		[ATTR_HTTP_ROUTE]: route,
		[ATTR_OPERATION_ID]: operationId
	}, async () => runWithEndpointContext(internalContext, async () => {
		const { beforeHooks, afterHooks } = getHooks(internalContext.context);
		const before = await runBeforeHooks(internalContext, beforeHooks, endpoint, operationId);
		if ("context" in before && before.context && typeof before.context === "object") {
			const { headers, ...rest } = before.context;
			if (headers) {
				if (!internalContext.headers) internalContext.headers = new Headers();
				const requestHeaders = internalContext.headers;
				headers.forEach((value, key) => {
					requestHeaders.set(key, value);
				});
			}
			internalContext = defuReplaceArrays(rest, internalContext);
		} else if (before) {
			const responseHeaders = internalContext.context.responseHeaders;
			return shouldReturnResponse ? toResponse(before, { headers: responseHeaders }) : input.returnHeaders ? {
				headers: responseHeaders,
				response: before
			} : before;
		}
		internalContext.asResponse = false;
		internalContext.returnHeaders = true;
		internalContext.returnStatus = true;
		const result = await runWithEndpointContext(internalContext, () => withSpan(`handler ${route}`, {
			[ATTR_HTTP_ROUTE]: route,
			[ATTR_OPERATION_ID]: operationId
		}, () => endpoint(internalContext))).catch((e) => {
			if (isAPIError(e)) return {
				response: e,
				status: e.statusCode,
				headers: mergeAPIErrorHeaders(e)
			};
			throw e;
		});
		if (result instanceof Response) return result;
		internalContext.context.returned = result.response;
		internalContext.context.responseHeaders = result.headers ?? void 0;
		const after = await runAfterHooks(internalContext, afterHooks, endpoint, operationId);
		if (after.response !== void 0) result.response = after.response;
		result.headers = after.headers ?? result.headers;
		if (isAPIError(result.response) && shouldPublishLog(internalContext.context.logger.level, "debug")) result.response.stack = result.response.errorStack;
		if (isAPIError(result.response) && !shouldReturnResponse) {
			if (result.headers) Object.defineProperty(result.response, kAPIErrorHeaderSymbol, {
				enumerable: false,
				configurable: true,
				writable: false,
				value: result.headers
			});
			throw result.response;
		}
		return shouldReturnResponse ? toResponse(result.response, {
			headers: result.headers ?? void 0,
			status: result.status
		}) : input.returnHeaders ? input.returnStatus ? {
			headers: result.headers,
			response: result.response,
			status: result.status
		} : {
			headers: result.headers,
			response: result.response
		} : input.returnStatus ? {
			response: result.response,
			status: result.status
		} : result.response;
	}));
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/to-auth-endpoints.mjs
/**
* Resolves the per-call `AuthContext` for endpoints with a dynamic `baseURL`.
*
* - `rawCtx.baseURL` already set: HTTP handler rehydrated upstream; return as-is.
* - Direct `auth.api` call with a source or a configured `fallback`: resolve here.
* - Neither: throw `APIError` with a helpful message. Leaving `baseURL = ""`
*   would let plugins build `new URL("")` and crash cryptically downstream.
*/
async function resolveDynamicContext(rawCtx, input) {
	if (rawCtx.baseURL) return rawCtx;
	const source = pickSource(input);
	const config = rawCtx.options.baseURL;
	const hasFallback = isDynamicBaseURLConfig(config) && Boolean(config.fallback);
	if (source === void 0 && !hasFallback) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Dynamic baseURL could not be resolved for this direct auth.api call. Pass `headers: request.headers` (or `request`) to the call, or add `fallback` to your baseURL config." });
	try {
		return await resolveRequestContext(rawCtx, source, resolveDynamicTrustedProxyHeaders(rawCtx.options));
	} catch (err) {
		if (err instanceof BetterAuthError) throw new APIError("INTERNAL_SERVER_ERROR", { message: err.message });
		throw err;
	}
}
/**
* Wraps each raw endpoint so a router or `auth.api.*` call runs it through the
* configured hook pipeline. Per-call work that is specific to this entry point
* (dynamic `baseURL` resolution, request-state initialization) happens here;
* the hook pipeline itself lives in {@link dispatchAuthEndpoint}.
*/
function toAuthEndpoints(endpoints, ctx) {
	const api = {};
	for (const [key, endpoint] of Object.entries(endpoints)) {
		api[key] = async (context) => {
			const operationId = getOperationId(endpoint, key);
			const run = async () => {
				const rawContext = await ctx;
				const authContext = isDynamicBaseURLConfig(rawContext.options.baseURL) ? await resolveDynamicContext(rawContext, context) : rawContext;
				return dispatchAuthEndpoint(endpoint, {
					...context,
					context: authContext,
					operationId,
					asResponse: context?.asResponse ?? isRequestLike(context?.request)
				});
			};
			if (await hasRequestState()) return run();
			return runWithRequestState(/* @__PURE__ */ new WeakMap(), run);
		};
		api[key].path = endpoint.path;
		api[key].options = endpoint.options;
	}
	return api;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/api/index.mjs
function checkEndpointConflicts(options, logger) {
	const endpointRegistry = /* @__PURE__ */ new Map();
	options.plugins?.forEach((plugin) => {
		if (plugin.endpoints) {
			for (const [key, endpoint] of Object.entries(plugin.endpoints)) if (endpoint && "path" in endpoint && typeof endpoint.path === "string") {
				const path = endpoint.path;
				let methods = [];
				if (endpoint.options && "method" in endpoint.options) {
					if (Array.isArray(endpoint.options.method)) methods = endpoint.options.method;
					else if (typeof endpoint.options.method === "string") methods = [endpoint.options.method];
				}
				if (methods.length === 0) methods = ["*"];
				if (!endpointRegistry.has(path)) endpointRegistry.set(path, []);
				endpointRegistry.get(path).push({
					pluginId: plugin.id,
					endpointKey: key,
					methods
				});
			}
		}
	});
	const conflicts = [];
	for (const [path, entries] of endpointRegistry.entries()) if (entries.length > 1) {
		const methodMap = /* @__PURE__ */ new Map();
		let hasConflict = false;
		for (const entry of entries) for (const method of entry.methods) {
			if (!methodMap.has(method)) methodMap.set(method, []);
			methodMap.get(method).push(entry.pluginId);
			if (methodMap.get(method).length > 1) hasConflict = true;
			if (method === "*" && entries.length > 1) hasConflict = true;
			else if (method !== "*" && methodMap.has("*")) hasConflict = true;
		}
		if (hasConflict) {
			const uniquePlugins = [...new Set(entries.map((e) => e.pluginId))];
			const conflictingMethods = [];
			for (const [method, plugins] of methodMap.entries()) if (plugins.length > 1 || method === "*" && entries.length > 1 || method !== "*" && methodMap.has("*")) conflictingMethods.push(method);
			conflicts.push({
				path,
				plugins: uniquePlugins,
				conflictingMethods
			});
		}
	}
	if (conflicts.length > 0) {
		const conflictMessages = conflicts.map((conflict) => `  - "${conflict.path}" [${conflict.conflictingMethods.join(", ")}] used by plugins: ${conflict.plugins.join(", ")}`).join("\n");
		logger.error(`Endpoint path conflicts detected! Multiple plugins are trying to use the same endpoint paths with conflicting HTTP methods:
${conflictMessages}

To resolve this, you can:
	1. Use only one of the conflicting plugins
	2. Configure the plugins to use different paths (if supported)
	3. Ensure plugins use different HTTP methods for the same path
`);
	}
}
function getEndpoints(ctx, options) {
	const pluginEndpoints = options.plugins?.reduce((acc, plugin) => {
		return {
			...acc,
			...plugin.endpoints
		};
	}, {}) ?? {};
	const middlewares = options.plugins?.map((plugin) => plugin.middlewares?.map((m) => {
		const middleware = (async (context) => {
			const authContext = await ctx;
			return withSpan(`middleware ${m.path} ${plugin.id}`, {
				["better_auth.hook.type"]: "middleware",
				["http.route"]: m.path,
				["better_auth.context"]: `plugin:${plugin.id}`
			}, () => m.middleware({
				...context,
				context: {
					...authContext,
					...context.context
				}
			}));
		});
		middleware.options = m.middleware.options;
		return {
			path: m.path,
			middleware
		};
	})).filter((plugin) => plugin !== void 0).flat() || [];
	return {
		api: toAuthEndpoints({
			signInSocial: signInSocial(),
			callbackOAuth,
			getSession: getSession(),
			signOut,
			signUpEmail: signUpEmail(),
			signInEmail: signInEmail(),
			resetPassword,
			verifyPassword,
			verifyEmail,
			sendVerificationEmail,
			changeEmail,
			changePassword,
			setPassword,
			updateSession: updateSession(),
			updateUser: updateUser(),
			deleteUser,
			requestPasswordReset,
			requestPasswordResetCallback,
			listSessions: listSessions(),
			revokeSession,
			revokeSessions,
			revokeOtherSessions,
			linkSocialAccount,
			listUserAccounts,
			deleteUserCallback,
			unlinkAccount,
			refreshToken,
			getAccessToken,
			accountInfo,
			...pluginEndpoints,
			ok,
			error
		}, ctx),
		middlewares
	};
}
var router = (ctx, options) => {
	const { api, middlewares } = getEndpoints(ctx, options);
	const basePath = new URL(ctx.baseURL).pathname;
	return createRouter$1(api, {
		routerContext: ctx,
		openapi: { disabled: true },
		basePath,
		routerMiddleware: [{
			path: "/**",
			middleware: originCheckMiddleware
		}, ...middlewares],
		allowedMediaTypes: ["application/json"],
		skipTrailingSlashes: options.advanced?.skipTrailingSlashes ?? false,
		async onRequest(req) {
			const disabledPaths = ctx.options.disabledPaths || [];
			const normalizedPath = normalizePathname(req.url, basePath);
			if (disabledPaths.includes(normalizedPath)) return new Response("Not Found", { status: 404 });
			let currentRequest = req;
			const rateLimitResponse = await onRequestRateLimit(currentRequest, ctx);
			if (rateLimitResponse) return rateLimitResponse;
			for (const plugin of ctx.options.plugins || []) if (plugin.onRequest) {
				const response = await withSpan(`onRequest ${plugin.id}`, {
					[ATTR_HOOK_TYPE]: "onRequest",
					[ATTR_CONTEXT]: `plugin:${plugin.id}`
				}, () => plugin.onRequest(currentRequest, ctx));
				if (response && "response" in response) return response.response;
				if (response && "request" in response) currentRequest = response.request;
			}
			return currentRequest;
		},
		async onResponse(res, req) {
			for (const plugin of ctx.options.plugins || []) if (plugin.onResponse) {
				const response = await withSpan(`onResponse ${plugin.id}`, {
					[ATTR_HOOK_TYPE]: "onResponse",
					[ATTR_CONTEXT]: `plugin:${plugin.id}`,
					[ATTR_HTTP_RESPONSE_STATUS_CODE]: res.status
				}, () => plugin.onResponse(res, ctx));
				if (response) return response.response;
			}
			return res;
		},
		onError(e) {
			if (isAPIError(e) && e.status === "FOUND") return;
			if (options.onAPIError?.throw) throw e;
			if (options.onAPIError?.onError) {
				options.onAPIError.onError(e, ctx);
				return;
			}
			const optLogLevel = options.logger?.level;
			const log = optLogLevel === "error" || optLogLevel === "warn" || optLogLevel === "debug" ? logger : void 0;
			if (options.logger?.disabled !== true) {
				if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
					if (e.message.includes("no column") || e.message.includes("column") || e.message.includes("relation") || e.message.includes("table") || e.message.includes("does not exist")) {
						ctx.logger?.error(e.message);
						return;
					}
				}
				if (isAPIError(e)) {
					if (e.status === "INTERNAL_SERVER_ERROR") ctx.logger.error(e.status, e);
					log?.error(e.message);
				} else ctx.logger?.error(e && typeof e === "object" && "name" in e ? e.name : "", e);
			}
		}
	});
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/adapter-base.mjs
async function getBaseAdapter(options, handleDirectDatabase) {
	let adapter;
	if (!options.database) {
		const tables = getAuthTables(options);
		const memoryDB = Object.keys(tables).reduce((acc, key) => {
			acc[key] = [];
			return acc;
		}, {});
		const { memoryAdapter } = await import("./dist3.js");
		adapter = memoryAdapter(memoryDB)(options);
	} else if (typeof options.database === "function") adapter = options.database(options);
	else adapter = await handleDirectDatabase(options);
	if (!adapter.transaction) {
		logger.warn("Adapter does not correctly implement transaction function, patching it automatically. Please update your adapter implementation.");
		adapter.transaction = async (cb) => {
			return cb(adapter);
		};
	}
	return adapter;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/adapter-kysely.mjs
async function getAdapter(options) {
	return getBaseAdapter(options, async (opts) => {
		const { createKyselyAdapter } = await import("./kysely-adapter.js");
		const { kysely, databaseType, transaction } = await createKyselyAdapter(opts);
		if (!kysely) throw new BetterAuthError("Failed to initialize database adapter");
		const { kyselyAdapter } = await import("./kysely-adapter.js");
		return kyselyAdapter(kysely, {
			type: databaseType || "sqlite",
			debugLogs: opts.database && "debugLogs" in opts.database ? opts.database.debugLogs : false,
			transaction
		})(opts);
	});
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/get-schema.mjs
function getSchema(config) {
	const tables = getAuthTables(config);
	const schema = {};
	for (const key in tables) {
		const table = tables[key];
		const fields = table.fields;
		const actualFields = {};
		Object.entries(fields).forEach(([key, field]) => {
			actualFields[field.fieldName || key] = field;
			if (field.references) {
				const refTable = tables[field.references.model];
				if (refTable) actualFields[field.fieldName || key].references = {
					...field.references,
					model: refTable.modelName,
					field: field.references.field
				};
			}
		});
		if (schema[table.modelName]) {
			schema[table.modelName].fields = {
				...schema[table.modelName].fields,
				...actualFields
			};
			if (table.disableMigrations) schema[table.modelName].disableMigrations = true;
			continue;
		}
		schema[table.modelName] = {
			fields: actualFields,
			order: table.order || Infinity,
			disableMigrations: table.disableMigrations
		};
	}
	return schema;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/db/get-migration.mjs
var map = {
	postgres: {
		string: [
			"character varying",
			"varchar",
			"text",
			"uuid"
		],
		number: [
			"int4",
			"integer",
			"bigint",
			"smallint",
			"numeric",
			"real",
			"double precision"
		],
		boolean: ["bool", "boolean"],
		date: [
			"timestamptz",
			"timestamp",
			"date"
		],
		json: ["json", "jsonb"]
	},
	mysql: {
		string: [
			"varchar",
			"text",
			"uuid"
		],
		number: [
			"integer",
			"int",
			"bigint",
			"smallint",
			"decimal",
			"float",
			"double"
		],
		boolean: ["boolean", "tinyint"],
		date: [
			"timestamp",
			"datetime",
			"date"
		],
		json: ["json"]
	},
	sqlite: {
		string: ["TEXT"],
		number: ["INTEGER", "REAL"],
		boolean: ["INTEGER", "BOOLEAN"],
		date: ["DATE", "INTEGER"],
		json: ["TEXT"]
	},
	mssql: {
		string: [
			"varchar",
			"nvarchar",
			"uniqueidentifier"
		],
		number: [
			"int",
			"bigint",
			"smallint",
			"decimal",
			"float",
			"double"
		],
		boolean: ["bit", "smallint"],
		date: [
			"datetime2",
			"date",
			"datetime"
		],
		json: ["varchar", "nvarchar"]
	}
};
function matchType(columnDataType, fieldType, dbType) {
	function normalize(type) {
		return type.toLowerCase().split("(")[0].trim();
	}
	if (fieldType === "string[]" || fieldType === "number[]") return columnDataType.toLowerCase().includes("json");
	const types = map[dbType];
	return (Array.isArray(fieldType) ? types["string"].map((t) => t.toLowerCase()) : types[fieldType].map((t) => t.toLowerCase())).includes(normalize(columnDataType));
}
/**
* Get the current PostgreSQL schema (search_path) for the database connection
* Returns the first schema in the search_path, defaulting to 'public' if not found
*/
async function getPostgresSchema(db) {
	try {
		const result = await sql$1`SHOW search_path`.execute(db);
		const searchPath = result.rows[0]?.search_path ?? result.rows[0]?.searchPath;
		if (searchPath) return searchPath.split(",").map((s) => s.trim()).map((s) => s.replace(/^["']|["']$/g, "")).filter((s) => !s.startsWith("$") && !s.startsWith("\\$"))[0] || "public";
	} catch {}
	return "public";
}
async function getMigrations(config) {
	const betterAuthSchema = getSchema(config);
	const logger = createLogger(config.logger);
	let { kysely: db, databaseType: dbType } = await createKyselyAdapter(config);
	if (!dbType) {
		logger.warn("Could not determine database type, defaulting to sqlite. Please provide a type in the database options to avoid this.");
		dbType = "sqlite";
	}
	if (!db) {
		logger.error("Only kysely adapter is supported for migrations. You can use `generate` command to generate the schema, if you're using a different adapter.");
		process.exit(1);
	}
	let currentSchema = "public";
	if (dbType === "postgres") {
		currentSchema = await getPostgresSchema(db);
		logger.debug(`PostgreSQL migration: Using schema '${currentSchema}' (from search_path)`);
		try {
			const schemaCheck = await sql$1`
				SELECT schema_name
				FROM information_schema.schemata
				WHERE schema_name = ${currentSchema}
			`.execute(db);
			if (!(schemaCheck.rows[0]?.schema_name ?? schemaCheck.rows[0]?.schemaName)) logger.warn(`Schema '${currentSchema}' does not exist. Tables will be inspected from available schemas. Consider creating the schema first or checking your database configuration.`);
		} catch (error) {
			logger.debug(`Could not verify schema existence: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	const allTableMetadata = await db.introspection.getTables();
	let tableMetadata = allTableMetadata;
	if (dbType === "postgres") try {
		const tablesInSchema = await sql$1`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = ${currentSchema}
				AND table_type = 'BASE TABLE'
			`.execute(db);
		const tableNamesInSchema = new Set(tablesInSchema.rows.map((row) => row.table_name ?? row.tableName));
		tableMetadata = allTableMetadata.filter((table) => table.schema === currentSchema && tableNamesInSchema.has(table.name));
		logger.debug(`Found ${tableMetadata.length} table(s) in schema '${currentSchema}': ${tableMetadata.map((t) => t.name).join(", ") || "(none)"}`);
	} catch (error) {
		logger.warn(`Could not filter tables by schema. Using all discovered tables. Error: ${error instanceof Error ? error.message : String(error)}`);
	}
	const toBeCreated = [];
	const toBeAdded = [];
	for (const [key, value] of Object.entries(betterAuthSchema)) {
		if (value.disableMigrations) continue;
		const table = tableMetadata.find((t) => t.name === key);
		if (!table) {
			const tIndex = toBeCreated.findIndex((t) => t.table === key);
			const tableData = {
				table: key,
				fields: value.fields,
				order: value.order || Infinity
			};
			const insertIndex = toBeCreated.findIndex((t) => (t.order || Infinity) > tableData.order);
			if (insertIndex === -1) if (tIndex === -1) toBeCreated.push(tableData);
			else toBeCreated[tIndex].fields = {
				...toBeCreated[tIndex].fields,
				...value.fields
			};
			else toBeCreated.splice(insertIndex, 0, tableData);
			continue;
		}
		const toBeAddedFields = {};
		for (const [fieldName, field] of Object.entries(value.fields)) {
			const column = table.columns.find((c) => c.name === fieldName);
			if (!column) {
				toBeAddedFields[fieldName] = field;
				continue;
			}
			if (matchType(column.dataType, field.type, dbType)) continue;
			else logger.warn(`Field ${fieldName} in table ${key} has a different type in the database. Expected ${field.type} but got ${column.dataType}.`);
		}
		if (Object.keys(toBeAddedFields).length > 0) toBeAdded.push({
			table: key,
			fields: toBeAddedFields,
			order: value.order || Infinity
		});
	}
	const migrations = [];
	const useUUIDs = config.advanced?.database?.generateId === "uuid";
	const useNumberId = config.advanced?.database?.generateId === "serial";
	function getType(field, fieldName) {
		const type = field.type;
		const provider = dbType || "sqlite";
		const typeMap = {
			string: {
				sqlite: "text",
				postgres: "text",
				mysql: field.unique ? "varchar(255)" : field.references ? "varchar(36)" : field.sortable ? "varchar(255)" : field.index ? "varchar(255)" : "text",
				mssql: field.unique || field.sortable ? "varchar(255)" : field.references ? "varchar(36)" : "varchar(8000)"
			},
			boolean: {
				sqlite: "integer",
				postgres: "boolean",
				mysql: "boolean",
				mssql: "smallint"
			},
			number: {
				sqlite: field.bigint ? "bigint" : "integer",
				postgres: field.bigint ? "bigint" : "integer",
				mysql: field.bigint ? "bigint" : "integer",
				mssql: field.bigint ? "bigint" : "integer"
			},
			date: {
				sqlite: "date",
				postgres: "timestamptz",
				mysql: "timestamp(3)",
				mssql: sql$1`datetime2(3)`
			},
			json: {
				sqlite: "text",
				postgres: "jsonb",
				mysql: "json",
				mssql: "varchar(8000)"
			},
			id: {
				postgres: useNumberId ? sql$1`integer GENERATED BY DEFAULT AS IDENTITY` : useUUIDs ? "uuid" : "text",
				mysql: useNumberId ? "integer" : useUUIDs ? "varchar(36)" : "varchar(36)",
				mssql: useNumberId ? "integer" : useUUIDs ? "varchar(36)" : "varchar(36)",
				sqlite: useNumberId ? "integer" : "text"
			},
			foreignKeyId: {
				postgres: useNumberId ? "integer" : useUUIDs ? "uuid" : "text",
				mysql: useNumberId ? "integer" : useUUIDs ? "varchar(36)" : "varchar(36)",
				mssql: useNumberId ? "integer" : useUUIDs ? "varchar(36)" : "varchar(36)",
				sqlite: useNumberId ? "integer" : "text"
			},
			"string[]": {
				sqlite: "text",
				postgres: "jsonb",
				mysql: "json",
				mssql: "varchar(8000)"
			},
			"number[]": {
				sqlite: "text",
				postgres: "jsonb",
				mysql: "json",
				mssql: "varchar(8000)"
			}
		};
		if (fieldName === "id" || field.references?.field === "id") {
			if (fieldName === "id") return typeMap.id[provider];
			return typeMap.foreignKeyId[provider];
		}
		if (Array.isArray(type)) return "text";
		if (!(type in typeMap)) throw new Error(`Unsupported field type '${String(type)}' for field '${fieldName}'. Allowed types are: string, number, boolean, date, string[], number[]. If you need to store structured data, store it as a JSON string (type: "string") or split it into primitive fields. See https://better-auth.com/docs/advanced/schema#additional-fields`);
		return typeMap[type][provider];
	}
	const getModelName = initGetModelName({
		schema: getAuthTables(config),
		usePlural: false
	});
	const getFieldName = initGetFieldName({
		schema: getAuthTables(config),
		usePlural: false
	});
	function getReferencePath(model, field) {
		try {
			return `${getModelName(model)}.${getFieldName({
				model,
				field
			})}`;
		} catch {
			return `${model}.${field}`;
		}
	}
	const deferredIndexes = [];
	if (toBeAdded.length) for (const table of toBeAdded) for (const [fieldName, field] of Object.entries(table.fields)) {
		const type = getType(field, fieldName);
		const builder = db.schema.alterTable(table.table);
		if (field.index) {
			const indexName = `${table.table}_${fieldName}_${field.unique ? "uidx" : "idx"}`;
			const indexBuilder = db.schema.createIndex(indexName).on(table.table).columns([fieldName]);
			deferredIndexes.push(field.unique ? indexBuilder.unique() : indexBuilder);
		}
		const built = builder.addColumn(fieldName, type, (col) => {
			col = field.required !== false ? col.notNull() : col;
			if (field.references) col = col.references(getReferencePath(field.references.model, field.references.field)).onDelete(field.references.onDelete || "cascade");
			if (field.unique) col = col.unique();
			if (field.type === "date" && typeof field.defaultValue === "function" && (dbType === "postgres" || dbType === "mysql" || dbType === "mssql")) if (dbType === "mysql") col = col.defaultTo(sql$1`CURRENT_TIMESTAMP(3)`);
			else col = col.defaultTo(sql$1`CURRENT_TIMESTAMP`);
			return col;
		});
		migrations.push(built);
	}
	if (toBeCreated.length) for (const table of toBeCreated) {
		const idType = getType({ type: useNumberId ? "number" : "string" }, "id");
		let dbT = db.schema.createTable(table.table).addColumn("id", idType, (col) => {
			if (useNumberId) {
				if (dbType === "postgres") return col.primaryKey().notNull();
				else if (dbType === "sqlite") return col.primaryKey().notNull();
				else if (dbType === "mssql") return col.identity().primaryKey().notNull();
				return col.autoIncrement().primaryKey().notNull();
			}
			if (useUUIDs) {
				if (dbType === "postgres") return col.primaryKey().defaultTo(sql$1`pg_catalog.gen_random_uuid()`).notNull();
				return col.primaryKey().notNull();
			}
			return col.primaryKey().notNull();
		});
		for (const [fieldName, field] of Object.entries(table.fields)) {
			const type = getType(field, fieldName);
			dbT = dbT.addColumn(fieldName, type, (col) => {
				col = field.required !== false ? col.notNull() : col;
				if (field.references) col = col.references(getReferencePath(field.references.model, field.references.field)).onDelete(field.references.onDelete || "cascade");
				if (field.unique) col = col.unique();
				if (field.type === "date" && typeof field.defaultValue === "function" && (dbType === "postgres" || dbType === "mysql" || dbType === "mssql")) if (dbType === "mysql") col = col.defaultTo(sql$1`CURRENT_TIMESTAMP(3)`);
				else col = col.defaultTo(sql$1`CURRENT_TIMESTAMP`);
				return col;
			});
			if (field.index) {
				const builder = db.schema.createIndex(`${table.table}_${fieldName}_${field.unique ? "uidx" : "idx"}`).on(table.table).columns([fieldName]);
				deferredIndexes.push(field.unique ? builder.unique() : builder);
			}
		}
		migrations.push(dbT);
	}
	for (const index of deferredIndexes) migrations.push(index);
	async function runMigrations() {
		for (const migration of migrations) await migration.execute();
	}
	async function compileMigrations() {
		return migrations.map((m) => m.compile().sql).join(";\n\n") + ";";
	}
	return {
		toBeCreated,
		toBeAdded,
		runMigrations,
		compileMigrations
	};
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/utils/constants.mjs
var DEFAULT_SECRET = "better-auth-secret-12345678901234567890";
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/context/secret-utils.mjs
/**
* Estimates the entropy of a string in bits.
* This is a simple approximation that helps detect low-entropy secrets.
*/
function estimateEntropy$1(str) {
	const unique = new Set(str).size;
	if (unique === 0) return 0;
	return Math.log2(Math.pow(unique, str.length));
}
function parseSecretsEnv(envValue) {
	if (!envValue) return null;
	return envValue.split(",").map((entry) => {
		entry = entry.trim();
		const colonIdx = entry.indexOf(":");
		if (colonIdx === -1) throw new BetterAuthError(`Invalid BETTER_AUTH_SECRETS entry: "${entry}". Expected format: "<version>:<secret>"`);
		const version = parseInt(entry.slice(0, colonIdx), 10);
		if (!Number.isInteger(version) || version < 0) throw new BetterAuthError(`Invalid version in BETTER_AUTH_SECRETS: "${entry.slice(0, colonIdx)}". Version must be a non-negative integer.`);
		const value = entry.slice(colonIdx + 1).trim();
		if (!value) throw new BetterAuthError(`Empty secret value for version ${version} in BETTER_AUTH_SECRETS.`);
		return {
			version,
			value
		};
	});
}
function validateSecretsArray(secrets, logger) {
	if (secrets.length === 0) throw new BetterAuthError("`secrets` array must contain at least one entry.");
	const seen = /* @__PURE__ */ new Set();
	for (const s of secrets) {
		const version = parseInt(String(s.version), 10);
		if (!Number.isInteger(version) || version < 0 || String(version) !== String(s.version).trim()) throw new BetterAuthError(`Invalid version ${s.version} in \`secrets\`. Version must be a non-negative integer.`);
		if (!s.value) throw new BetterAuthError(`Empty secret value for version ${version} in \`secrets\`.`);
		if (seen.has(version)) throw new BetterAuthError(`Duplicate version ${version} in \`secrets\`. Each version must be unique.`);
		seen.add(version);
	}
	const current = secrets[0];
	if (current.value.length < 32) logger.warn(`[better-auth] Warning: the current secret (version ${current.version}) should be at least 32 characters long for adequate security.`);
	if (estimateEntropy$1(current.value) < 120) logger.warn("[better-auth] Warning: the current secret appears low-entropy. Use a randomly generated secret for production.");
}
function buildSecretConfig(secrets, legacySecret) {
	const keys = /* @__PURE__ */ new Map();
	for (const s of secrets) keys.set(parseInt(String(s.version), 10), s.value);
	return {
		keys,
		currentVersion: parseInt(String(secrets[0].version), 10),
		legacySecret: legacySecret && legacySecret !== "better-auth-secret-12345678901234567890" ? legacySecret : void 0
	};
}
//#endregion
//#region ../../node_modules/.bun/@better-auth+telemetry@1.6.23+650014f1ad959098/node_modules/@better-auth/telemetry/dist/node.mjs
async function getTelemetryAuthConfig(options, context) {
	return {
		database: context?.database,
		adapter: context?.adapter,
		emailVerification: {
			sendVerificationEmail: !!options.emailVerification?.sendVerificationEmail,
			sendOnSignUp: !!options.emailVerification?.sendOnSignUp,
			sendOnSignIn: !!options.emailVerification?.sendOnSignIn,
			autoSignInAfterVerification: !!options.emailVerification?.autoSignInAfterVerification,
			expiresIn: options.emailVerification?.expiresIn,
			beforeEmailVerification: !!options.emailVerification?.beforeEmailVerification,
			afterEmailVerification: !!options.emailVerification?.afterEmailVerification
		},
		emailAndPassword: {
			enabled: !!options.emailAndPassword?.enabled,
			disableSignUp: !!options.emailAndPassword?.disableSignUp,
			requireEmailVerification: !!options.emailAndPassword?.requireEmailVerification,
			maxPasswordLength: options.emailAndPassword?.maxPasswordLength,
			minPasswordLength: options.emailAndPassword?.minPasswordLength,
			sendResetPassword: !!options.emailAndPassword?.sendResetPassword,
			resetPasswordTokenExpiresIn: options.emailAndPassword?.resetPasswordTokenExpiresIn,
			onPasswordReset: !!options.emailAndPassword?.onPasswordReset,
			password: {
				hash: !!options.emailAndPassword?.password?.hash,
				verify: !!options.emailAndPassword?.password?.verify
			},
			autoSignIn: !!options.emailAndPassword?.autoSignIn,
			revokeSessionsOnPasswordReset: !!options.emailAndPassword?.revokeSessionsOnPasswordReset
		},
		socialProviders: await Promise.all(Object.keys(options.socialProviders || {}).map(async (key) => {
			const p = options.socialProviders?.[key];
			if (!p) return {};
			const provider = typeof p === "function" ? await p() : p;
			return {
				id: key,
				mapProfileToUser: !!provider.mapProfileToUser,
				disableDefaultScope: !!provider.disableDefaultScope,
				disableIdTokenSignIn: !!provider.disableIdTokenSignIn,
				disableImplicitSignUp: provider.disableImplicitSignUp,
				disableSignUp: provider.disableSignUp,
				getUserInfo: !!provider.getUserInfo,
				overrideUserInfoOnSignIn: !!provider.overrideUserInfoOnSignIn,
				prompt: provider.prompt,
				verifyIdToken: !!provider.verifyIdToken,
				scope: provider.scope,
				refreshAccessToken: !!provider.refreshAccessToken
			};
		})),
		plugins: options.plugins?.map((p) => p.id.toString()),
		user: {
			modelName: options.user?.modelName,
			fields: options.user?.fields,
			additionalFields: options.user?.additionalFields,
			changeEmail: {
				enabled: options.user?.changeEmail?.enabled,
				sendChangeEmailConfirmation: !!options.user?.changeEmail?.sendChangeEmailConfirmation
			}
		},
		verification: {
			modelName: options.verification?.modelName,
			disableCleanup: options.verification?.disableCleanup,
			fields: options.verification?.fields
		},
		session: {
			modelName: options.session?.modelName,
			additionalFields: options.session?.additionalFields,
			cookieCache: {
				enabled: options.session?.cookieCache?.enabled,
				maxAge: options.session?.cookieCache?.maxAge,
				strategy: options.session?.cookieCache?.strategy
			},
			disableSessionRefresh: options.session?.disableSessionRefresh,
			expiresIn: options.session?.expiresIn,
			fields: options.session?.fields,
			freshAge: options.session?.freshAge,
			preserveSessionInDatabase: options.session?.preserveSessionInDatabase,
			storeSessionInDatabase: options.session?.storeSessionInDatabase,
			updateAge: options.session?.updateAge
		},
		account: {
			modelName: options.account?.modelName,
			fields: options.account?.fields,
			encryptOAuthTokens: options.account?.encryptOAuthTokens,
			updateAccountOnSignIn: options.account?.updateAccountOnSignIn,
			accountLinking: {
				enabled: options.account?.accountLinking?.enabled,
				trustedProviders: options.account?.accountLinking?.trustedProviders,
				updateUserInfoOnLink: options.account?.accountLinking?.updateUserInfoOnLink,
				allowUnlinkingAll: options.account?.accountLinking?.allowUnlinkingAll
			}
		},
		hooks: {
			after: !!options.hooks?.after,
			before: !!options.hooks?.before
		},
		secondaryStorage: !!options.secondaryStorage,
		advanced: {
			cookiePrefix: !!options.advanced?.cookiePrefix,
			cookies: !!options.advanced?.cookies,
			crossSubDomainCookies: {
				domain: !!options.advanced?.crossSubDomainCookies?.domain,
				enabled: options.advanced?.crossSubDomainCookies?.enabled,
				additionalCookies: options.advanced?.crossSubDomainCookies?.additionalCookies
			},
			database: {
				generateId: options.advanced?.database?.generateId,
				defaultFindManyLimit: options.advanced?.database?.defaultFindManyLimit
			},
			useSecureCookies: options.advanced?.useSecureCookies,
			ipAddress: {
				disableIpTracking: options.advanced?.ipAddress?.disableIpTracking,
				ipAddressHeaders: options.advanced?.ipAddress?.ipAddressHeaders
			},
			disableCSRFCheck: options.advanced?.disableCSRFCheck,
			cookieAttributes: {
				expires: options.advanced?.defaultCookieAttributes?.expires,
				secure: options.advanced?.defaultCookieAttributes?.secure,
				sameSite: options.advanced?.defaultCookieAttributes?.sameSite,
				domain: !!options.advanced?.defaultCookieAttributes?.domain,
				path: options.advanced?.defaultCookieAttributes?.path,
				httpOnly: options.advanced?.defaultCookieAttributes?.httpOnly
			}
		},
		trustedOrigins: options.trustedOrigins?.length,
		rateLimit: {
			storage: options.rateLimit?.storage,
			modelName: options.rateLimit?.modelName,
			window: options.rateLimit?.window,
			customStorage: !!options.rateLimit?.customStorage,
			enabled: options.rateLimit?.enabled,
			max: options.rateLimit?.max
		},
		onAPIError: {
			errorURL: options.onAPIError?.errorURL,
			onError: !!options.onAPIError?.onError,
			throw: options.onAPIError?.throw
		},
		logger: {
			disabled: options.logger?.disabled,
			level: options.logger?.level,
			log: !!options.logger?.log
		},
		databaseHooks: {
			user: {
				create: {
					after: !!options.databaseHooks?.user?.create?.after,
					before: !!options.databaseHooks?.user?.create?.before
				},
				update: {
					after: !!options.databaseHooks?.user?.update?.after,
					before: !!options.databaseHooks?.user?.update?.before
				}
			},
			session: {
				create: {
					after: !!options.databaseHooks?.session?.create?.after,
					before: !!options.databaseHooks?.session?.create?.before
				},
				update: {
					after: !!options.databaseHooks?.session?.update?.after,
					before: !!options.databaseHooks?.session?.update?.before
				}
			},
			account: {
				create: {
					after: !!options.databaseHooks?.account?.create?.after,
					before: !!options.databaseHooks?.account?.create?.before
				},
				update: {
					after: !!options.databaseHooks?.account?.update?.after,
					before: !!options.databaseHooks?.account?.update?.before
				}
			},
			verification: {
				create: {
					after: !!options.databaseHooks?.verification?.create?.after,
					before: !!options.databaseHooks?.verification?.create?.before
				},
				update: {
					after: !!options.databaseHooks?.verification?.update?.after,
					before: !!options.databaseHooks?.verification?.update?.before
				}
			}
		}
	};
}
function detectPackageManager() {
	const userAgent = env.npm_config_user_agent;
	if (!userAgent) return;
	const pmSpec = userAgent.split(" ")[0];
	const separatorPos = pmSpec.lastIndexOf("/");
	const name = pmSpec.substring(0, separatorPos);
	return {
		name: name === "npminstall" ? "cnpm" : name,
		version: pmSpec.substring(separatorPos + 1)
	};
}
function isCI() {
	return env.CI !== "false" && ("BUILD_ID" in env || "BUILD_NUMBER" in env || "CI" in env || "CI_APP_ID" in env || "CI_BUILD_ID" in env || "CI_BUILD_NUMBER" in env || "CI_NAME" in env || "CONTINUOUS_INTEGRATION" in env || "RUN_ID" in env);
}
function detectRuntime() {
	if (typeof Deno !== "undefined") return {
		name: "deno",
		version: Deno?.version?.deno ?? null
	};
	if (typeof Bun !== "undefined") return {
		name: "bun",
		version: Bun?.version ?? null
	};
	if (typeof process !== "undefined" && process?.versions?.node) return {
		name: "node",
		version: process.versions.node ?? null
	};
	return {
		name: "edge",
		version: null
	};
}
function detectEnvironment() {
	return getEnvVar("NODE_ENV") === "production" ? "production" : isCI() ? "ci" : isTest() ? "test" : "development";
}
async function hashToBase64(data) {
	const buffer = await createHash$1("SHA-256").digest(data);
	return base64.encode(buffer);
}
var generateId = (size) => {
	return createRandomStringGenerator("a-z", "A-Z", "0-9")(size || 32);
};
var packageJSONCache;
async function readRootPackageJson() {
	if (packageJSONCache) return packageJSONCache;
	try {
		const cwd = process.cwd();
		if (!cwd) return void 0;
		const raw = await fsPromises.readFile(path.join(cwd, "package.json"), "utf-8");
		packageJSONCache = JSON.parse(raw);
		return packageJSONCache;
	} catch {}
}
async function getPackageVersion(pkg) {
	if (packageJSONCache) return packageJSONCache.dependencies?.[pkg] || packageJSONCache.devDependencies?.[pkg] || packageJSONCache.peerDependencies?.[pkg];
	try {
		const cwd = process.cwd();
		if (!cwd) throw new Error("no-cwd");
		const pkgJsonPath = path.join(cwd, "node_modules", pkg, "package.json");
		const raw = await fsPromises.readFile(pkgJsonPath, "utf-8");
		return JSON.parse(raw).version || await getVersionFromLocalPackageJson(pkg) || void 0;
	} catch {}
	return getVersionFromLocalPackageJson(pkg);
}
async function getVersionFromLocalPackageJson(pkg) {
	const json = await readRootPackageJson();
	if (!json) return void 0;
	return {
		...json.dependencies,
		...json.devDependencies,
		...json.peerDependencies
	}[pkg];
}
async function getNameFromLocalPackageJson() {
	return (await readRootPackageJson())?.name;
}
async function detectSystemInfo() {
	try {
		const cpus = os.cpus();
		return {
			deploymentVendor: getVendor(),
			systemPlatform: os.platform(),
			systemRelease: os.release(),
			systemArchitecture: os.arch(),
			cpuCount: cpus.length,
			cpuModel: cpus.length ? cpus[0].model : null,
			cpuSpeed: cpus.length ? cpus[0].speed : null,
			memory: os.totalmem(),
			isWSL: await isWsl(),
			isDocker: await isDocker(),
			isTTY: process.stdout ? process.stdout.isTTY : null
		};
	} catch {
		return {
			systemPlatform: null,
			systemRelease: null,
			systemArchitecture: null,
			cpuCount: null,
			cpuModel: null,
			cpuSpeed: null,
			memory: null,
			isWSL: null,
			isDocker: null,
			isTTY: null
		};
	}
}
function getVendor() {
	const env = process.env;
	const hasAny = (...keys) => keys.some((k) => Boolean(env[k]));
	if (hasAny("CF_PAGES", "CF_PAGES_URL", "CF_ACCOUNT_ID") || typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") return "cloudflare";
	if (hasAny("VERCEL", "VERCEL_URL", "VERCEL_ENV")) return "vercel";
	if (hasAny("NETLIFY", "NETLIFY_URL")) return "netlify";
	if (hasAny("RENDER", "RENDER_URL", "RENDER_INTERNAL_HOSTNAME", "RENDER_SERVICE_ID")) return "render";
	if (hasAny("AWS_LAMBDA_FUNCTION_NAME", "AWS_EXECUTION_ENV", "LAMBDA_TASK_ROOT")) return "aws";
	if (hasAny("GOOGLE_CLOUD_FUNCTION_NAME", "GOOGLE_CLOUD_PROJECT", "GCP_PROJECT", "K_SERVICE")) return "gcp";
	if (hasAny("AZURE_FUNCTION_NAME", "FUNCTIONS_WORKER_RUNTIME", "WEBSITE_INSTANCE_ID", "WEBSITE_SITE_NAME")) return "azure";
	if (hasAny("DENO_DEPLOYMENT_ID", "DENO_REGION")) return "deno-deploy";
	if (hasAny("FLY_APP_NAME", "FLY_REGION", "FLY_ALLOC_ID")) return "fly-io";
	if (hasAny("RAILWAY_STATIC_URL", "RAILWAY_ENVIRONMENT_NAME")) return "railway";
	if (hasAny("DYNO", "HEROKU_APP_NAME")) return "heroku";
	if (hasAny("DO_DEPLOYMENT_ID", "DO_APP_NAME", "DIGITALOCEAN")) return "digitalocean";
	if (hasAny("KOYEB", "KOYEB_DEPLOYMENT_ID", "KOYEB_APP_NAME")) return "koyeb";
	return null;
}
var isDockerCached;
async function hasDockerEnv() {
	try {
		fs.statSync("/.dockerenv");
		return true;
	} catch {
		return false;
	}
}
async function hasDockerCGroup() {
	try {
		return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
	} catch {
		return false;
	}
}
async function isDocker() {
	if (isDockerCached === void 0) isDockerCached = await hasDockerEnv() || await hasDockerCGroup();
	return isDockerCached;
}
var isInsideContainerCached;
var hasContainerEnv = async () => {
	try {
		fs.statSync("/run/.containerenv");
		return true;
	} catch {
		return false;
	}
};
async function isInsideContainer() {
	if (isInsideContainerCached === void 0) isInsideContainerCached = await hasContainerEnv() || await isDocker();
	return isInsideContainerCached;
}
async function isWsl() {
	try {
		if (process.platform !== "linux") return false;
		if (os.release().toLowerCase().includes("microsoft")) {
			if (await isInsideContainer()) return false;
			return true;
		}
		return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft") ? !await isInsideContainer() : false;
	} catch {
		return false;
	}
}
var projectIdCached = null;
async function getProjectId(baseUrl) {
	if (projectIdCached) return projectIdCached;
	const projectName = await getNameFromLocalPackageJson();
	if (projectName) {
		projectIdCached = await hashToBase64(baseUrl ? baseUrl + projectName : projectName);
		return projectIdCached;
	}
	if (baseUrl) {
		projectIdCached = await hashToBase64(baseUrl);
		return projectIdCached;
	}
	projectIdCached = generateId(32);
	return projectIdCached;
}
async function detectDatabaseNode() {
	for (const [pkg, name] of Object.entries({
		pg: "postgresql",
		mysql: "mysql",
		mariadb: "mariadb",
		sqlite3: "sqlite",
		"better-sqlite3": "sqlite",
		"@prisma/client": "prisma",
		mongoose: "mongodb",
		mongodb: "mongodb",
		"drizzle-orm": "drizzle"
	})) {
		const version = await getPackageVersion(pkg);
		if (version) return {
			name,
			version
		};
	}
}
async function detectFrameworkNode() {
	for (const [pkg, name] of Object.entries({
		next: "next",
		nuxt: "nuxt",
		"react-router": "react-router",
		astro: "astro",
		"@sveltejs/kit": "sveltekit",
		"solid-start": "solid-start",
		"tanstack-start": "tanstack-start",
		hono: "hono",
		express: "express",
		elysia: "elysia",
		expo: "expo"
	})) {
		const version = await getPackageVersion(pkg);
		if (version) return {
			name,
			version
		};
	}
}
var noop = async function noop() {};
async function createTelemetry(options, context) {
	const debugEnabled = options.telemetry?.debug || getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);
	const telemetryEndpoint = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	if (!telemetryEndpoint && !context?.customTrack) return { publish: noop };
	const track = async (event) => {
		if (context?.customTrack) await context.customTrack(event).catch(logger.error);
		else if (telemetryEndpoint) if (debugEnabled) logger.info("telemetry event", JSON.stringify(event, null, 2));
		else await betterFetch(telemetryEndpoint, {
			method: "POST",
			body: event
		}).catch(logger.error);
	};
	const isEnabled = async () => {
		const telemetryEnabled = options.telemetry?.enabled !== void 0 ? options.telemetry.enabled : false;
		return (getBooleanEnvVar("BETTER_AUTH_TELEMETRY", false) || telemetryEnabled) && (context?.skipTestCheck || !isTest());
	};
	const enabled = await isEnabled();
	let anonymousId;
	if (enabled) {
		anonymousId = await getProjectId(typeof options.baseURL === "string" ? options.baseURL : void 0);
		track({
			type: "init",
			payload: {
				config: await getTelemetryAuthConfig(options, context),
				runtime: detectRuntime(),
				database: await detectDatabaseNode(),
				framework: await detectFrameworkNode(),
				environment: detectEnvironment(),
				systemInfo: await detectSystemInfo(),
				packageManager: detectPackageManager()
			},
			anonymousId
		});
	}
	return { publish: async (event) => {
		if (!enabled) return;
		if (!anonymousId) anonymousId = await getProjectId(typeof options.baseURL === "string" ? options.baseURL : void 0);
		await track({
			type: event.type,
			payload: event.payload,
			anonymousId
		});
	} };
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/context/create-context.mjs
/**
* Estimates the entropy of a string in bits.
* This is a simple approximation that helps detect low-entropy secrets.
*/
function estimateEntropy(str) {
	const unique = new Set(str).size;
	if (unique === 0) return 0;
	return Math.log2(Math.pow(unique, str.length));
}
/**
* Validates that the secret meets minimum security requirements.
* Throws BetterAuthError if the secret is invalid.
* Skips validation for DEFAULT_SECRET in test environments only.
* Only throws for DEFAULT_SECRET in production environment.
*/
function validateSecret(secret, logger) {
	const isDefaultSecret = secret === DEFAULT_SECRET;
	if (isTest()) return;
	if (isDefaultSecret && isProduction) throw new BetterAuthError("You are using the default secret. Please set `BETTER_AUTH_SECRET` in your environment variables or pass `secret` in your auth config.");
	if (!secret) throw new BetterAuthError("BETTER_AUTH_SECRET is missing. Set it in your environment or pass `secret` to betterAuth({ secret }).");
	if (secret.length < 32) logger.warn(`[better-auth] Warning: your BETTER_AUTH_SECRET should be at least 32 characters long for adequate security. Generate one with \`npx auth secret\` or \`openssl rand -base64 32\`.`);
	if (estimateEntropy(secret) < 120) logger.warn("[better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.");
}
async function createAuthContext(adapter, options, getDatabaseType) {
	const isStateful = hasServerSessionStore(options);
	if (!isStateful) options = defu(options, { session: { cookieCache: {
		enabled: true,
		strategy: "jwe",
		refreshCache: true,
		maxAge: options.session?.expiresIn || 3600 * 24 * 7
	} } });
	if (!options.database) options = defu(options, { account: { storeAccountCookie: true } });
	const plugins = options.plugins || [];
	const internalPlugins = getInternalPlugins(options);
	const logger = createLogger(options.logger);
	const isDynamicConfig = isDynamicBaseURLConfig(options.baseURL);
	if (isDynamicBaseURLConfig(options.baseURL)) {
		const { allowedHosts } = options.baseURL;
		if (!allowedHosts || allowedHosts.length === 0) throw new BetterAuthError("baseURL.allowedHosts cannot be empty. Provide at least one allowed host pattern (e.g., [\"myapp.com\", \"*.vercel.app\"]).");
	}
	const baseURL = isDynamicConfig ? void 0 : getBaseURL(typeof options.baseURL === "string" ? options.baseURL : void 0, options.basePath);
	if (!baseURL && !isDynamicConfig) logger.warn(`[better-auth] Base URL is not set. Set the baseURL option or BETTER_AUTH_URL env, or use a dynamic baseURL with allowedHosts for multi-host setups. Without it the origin is derived from the incoming request, and callbacks and redirects may not work correctly.`);
	if (adapter.id === "memory" && options.advanced?.database?.generateId === false) logger.error(`[better-auth] Misconfiguration detected.
You are using the memory DB with generateId: false.
This will cause no id to be generated for any model.
Most of the features of Better Auth will not work correctly.`);
	const secretsArray = options.secrets ?? parseSecretsEnv(env.BETTER_AUTH_SECRETS);
	const legacySecret = options.secret || env.BETTER_AUTH_SECRET || env.AUTH_SECRET || "";
	let secret;
	let secretConfig;
	if (secretsArray) {
		validateSecretsArray(secretsArray, logger);
		secret = secretsArray[0].value;
		secretConfig = buildSecretConfig(secretsArray, legacySecret);
	} else {
		secret = legacySecret || "better-auth-secret-12345678901234567890";
		validateSecret(secret, logger);
		secretConfig = secret;
	}
	options = {
		...options,
		secret,
		baseURL: isDynamicConfig ? options.baseURL : baseURL ? new URL(baseURL).origin : "",
		basePath: options.basePath || "/api/auth",
		plugins: plugins.concat(internalPlugins)
	};
	checkEndpointConflicts(options, logger);
	const trustedProxies = options.advanced?.ipAddress?.trustedProxies;
	if (trustedProxies && trustedProxies.length > 0) {
		const invalid = findInvalidTrustedProxies(trustedProxies);
		if (invalid.length > 0) logger.warn(`Ignoring invalid \`advanced.ipAddress.trustedProxies\` entries: ${invalid.join(", ")}. Each entry must be an IP address or CIDR range.`);
	}
	const cookies = getCookies(options);
	const tables = getAuthTables(options);
	const providers = (await Promise.all(Object.entries(options.socialProviders || {}).map(async ([key, originalConfig]) => {
		const config = typeof originalConfig === "function" ? await originalConfig() : originalConfig;
		if (config == null) return null;
		if (config.enabled === false) return null;
		if (!config.clientId) logger.warn(`Social provider ${key} is missing clientId or clientSecret`);
		const provider = socialProviders[key](config);
		provider.disableImplicitSignUp = config.disableImplicitSignUp;
		return provider;
	}))).filter((x) => x !== null);
	const generateIdFunc = ({ model, size }) => {
		if (typeof options.advanced?.generateId === "function") return options.advanced.generateId({
			model,
			size
		});
		const dbGenerateId = options?.advanced?.database?.generateId;
		if (typeof dbGenerateId === "function") return dbGenerateId({
			model,
			size
		});
		if (dbGenerateId === "uuid") return crypto.randomUUID();
		if (dbGenerateId === "serial" || dbGenerateId === false) return false;
		return generateId$1(size);
	};
	const { publish } = await createTelemetry(options, {
		adapter: adapter.id,
		database: typeof options.database === "function" ? "adapter" : getDatabaseType(options.database)
	});
	const pluginIds = new Set(options.plugins.map((p) => p.id));
	const getPluginFn = (id) => options.plugins.find((p) => p.id === id) ?? null;
	const hasPluginFn = (id) => pluginIds.has(id);
	const trustedOrigins = await getTrustedOrigins(options);
	const trustedProviders = await getTrustedProviders(options);
	const ctx = {
		appName: options.appName || "Better Auth",
		baseURL: baseURL || "",
		version: getBetterAuthVersion(),
		socialProviders: providers,
		options,
		oauthConfig: {
			storeStateStrategy: options.account?.storeStateStrategy || (isStateful ? "database" : "cookie"),
			skipStateCookieCheck: !!options.account?.skipStateCookieCheck
		},
		tables,
		trustedOrigins,
		trustedProviders,
		isTrustedOrigin(url, settings) {
			return this.trustedOrigins.some((origin) => matchesOriginPattern(url, origin, settings));
		},
		sessionConfig: {
			updateAge: options.session?.updateAge !== void 0 ? options.session.updateAge : 1440 * 60,
			expiresIn: options.session?.expiresIn || 3600 * 24 * 7,
			freshAge: options.session?.freshAge === void 0 ? 3600 * 24 : options.session.freshAge,
			cookieRefreshCache: (() => {
				const refreshCache = options.session?.cookieCache?.refreshCache;
				const maxAge = options.session?.cookieCache?.maxAge || 300;
				if (isStateful && refreshCache) {
					logger.warn("[better-auth] `session.cookieCache.refreshCache` is enabled while `database` or `secondaryStorage` is configured. `refreshCache` is meant for stateless (DB-less) setups. Disabling `refreshCache` — remove it from your config to silence this warning.");
					return false;
				}
				if (refreshCache === false || refreshCache === void 0) return false;
				if (refreshCache === true) return {
					enabled: true,
					updateAge: Math.floor(maxAge * .2)
				};
				return {
					enabled: true,
					updateAge: refreshCache.updateAge !== void 0 ? refreshCache.updateAge : Math.floor(maxAge * .2)
				};
			})()
		},
		secret,
		secretConfig,
		rateLimit: {
			...options.rateLimit,
			enabled: options.rateLimit?.enabled ?? isProduction,
			window: options.rateLimit?.window || 10,
			max: options.rateLimit?.max || 100,
			storage: options.rateLimit?.storage || (options.secondaryStorage ? "secondary-storage" : "memory")
		},
		authCookies: cookies,
		logger,
		generateId: generateIdFunc,
		session: null,
		secondaryStorage: options.secondaryStorage,
		password: {
			hash: options.emailAndPassword?.password?.hash || hashPassword$1,
			verify: options.emailAndPassword?.password?.verify || verifyPassword$1,
			config: {
				minPasswordLength: options.emailAndPassword?.minPasswordLength || 8,
				maxPasswordLength: options.emailAndPassword?.maxPasswordLength || 128
			},
			checkPassword
		},
		setNewSession(session) {
			this.newSession = session;
		},
		newSession: null,
		adapter,
		internalAdapter: createInternalAdapter(adapter, {
			options,
			logger,
			hooks: options.databaseHooks ? [{
				source: "user",
				hooks: options.databaseHooks
			}] : [],
			generateId: generateIdFunc
		}),
		createAuthCookie: createCookieGetter(options),
		async runMigrations() {
			throw new BetterAuthError("runMigrations will be set by the specific init implementation");
		},
		publishTelemetry: publish,
		skipCSRFCheck: !!options.advanced?.disableCSRFCheck,
		skipOriginCheck: options.advanced?.disableOriginCheck !== void 0 ? options.advanced.disableOriginCheck : isTest() ? true : false,
		runInBackground: options.advanced?.backgroundTasks?.handler ?? ((p) => {
			p.catch(() => {});
		}),
		async runInBackgroundOrAwait(promise) {
			try {
				if (options.advanced?.backgroundTasks?.handler) {
					if (promise instanceof Promise) options.advanced.backgroundTasks.handler(promise.catch((e) => {
						logger.error("Failed to run background task:", e);
					}));
				} else await promise;
			} catch (e) {
				logger.error("Failed to run background task:", e);
			}
		},
		getPlugin: getPluginFn,
		hasPlugin: hasPluginFn
	};
	const initOrPromise = runPluginInit(ctx);
	if (isPromise(initOrPromise)) await initOrPromise;
	return ctx;
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/context/init.mjs
var init = async (options) => {
	const adapter = await getAdapter(options);
	const getDatabaseType = (database) => getKyselyDatabaseType(database) || "unknown";
	const ctx = await createAuthContext(adapter, options, getDatabaseType);
	ctx.runMigrations = async function() {
		if (!options.database || "updateMany" in options.database) throw new BetterAuthError("Database is not provided or it's an adapter. Migrations are only supported with a database instance.");
		const { runMigrations } = await getMigrations(options);
		await runMigrations();
	};
	return ctx;
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/auth/base.mjs
var createBetterAuth = (options, initFn) => {
	const authContext = initFn(options);
	const { api } = getEndpoints(authContext, options);
	return {
		handler: async (request) => {
			const ctx = await authContext;
			const basePath = ctx.options.basePath || "/api/auth";
			let handlerCtx;
			if (isDynamicBaseURLConfig(options.baseURL)) handlerCtx = await resolveRequestContext(ctx, request, resolveDynamicTrustedProxyHeaders(ctx.options));
			else {
				handlerCtx = Object.create(Object.getPrototypeOf(ctx), Object.getOwnPropertyDescriptors(ctx));
				let trustOptions = ctx.options;
				if (!ctx.options.baseURL) {
					const baseURL = getBaseURL(void 0, basePath, request, void 0, ctx.options.advanced?.trustedProxyHeaders);
					if (!baseURL) throw new BetterAuthError("Could not get base URL from request. Please provide a valid base URL.");
					handlerCtx.baseURL = baseURL;
					handlerCtx.options = {
						...ctx.options,
						baseURL: getOrigin(baseURL) || void 0
					};
					trustOptions = handlerCtx.options;
				}
				handlerCtx.trustedOrigins = await getTrustedOrigins(trustOptions, request);
				handlerCtx.trustedProviders = await getTrustedProviders(trustOptions, request);
			}
			const { handler } = router(handlerCtx, options);
			return runWithAdapter(handlerCtx.adapter, () => handler(request));
		},
		api,
		options,
		$context: authContext,
		$ERROR_CODES: {
			...options.plugins?.reduce((acc, plugin) => {
				if (plugin.$ERROR_CODES) return {
					...acc,
					...plugin.$ERROR_CODES
				};
				return acc;
			}, {}),
			...BASE_ERROR_CODES
		}
	};
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/auth/full.mjs
/**
* Better Auth initializer for full mode (with Kysely)
*
* @example
* ```ts
* import { betterAuth } from "better-auth";
*
* const auth = betterAuth({
* 	database: new PostgresDialect({ connection: process.env.DATABASE_URL }),
* });
* ```
*
* For minimal mode (without Kysely), import from `better-auth/minimal` instead
* @example
* ```ts
* import { betterAuth } from "better-auth/minimal";
*
* const auth = betterAuth({
*	  database: drizzleAdapter(db, { provider: "pg" }),
* });
*/
var betterAuth = (options) => {
	return createBetterAuth(options, init);
};
//#endregion
//#region ../../node_modules/.bun/@better-auth+drizzle-adapter@1.6.23+eea1f8afb2415253/node_modules/@better-auth/drizzle-adapter/dist/index.mjs
/**
* Case-insensitive LIKE/ILIKE for pattern matching.
* Uses ILIKE on PostgreSQL, LOWER()+LIKE on MySQL/SQLite.
*/
function insensitiveIlike(column, pattern, provider) {
	return provider === "pg" ? ilike(column, pattern) : sql`LOWER(${column}) LIKE LOWER(${pattern})`;
}
/**
* Case-insensitive IN for string arrays.
*/
function insensitiveInArray(column, values) {
	if (values.length === 0) return sql`false`;
	return sql`LOWER(${column}) IN (${sql.join(values.map((v) => sql`LOWER(${v})`), sql`, `)})`;
}
/**
* Case-insensitive NOT IN for string arrays.
*/
function insensitiveNotInArray(column, values) {
	if (values.length === 0) return sql`true`;
	return sql`LOWER(${column}) NOT IN (${sql.join(values.map((v) => sql`LOWER(${v})`), sql`, `)})`;
}
/**
* Case-insensitive equality for strings.
*/
function insensitiveEq(column, value) {
	return sql`LOWER(${column}) = LOWER(${value})`;
}
/**
* Case-insensitive inequality for strings.
*/
function insensitiveNe(column, value) {
	return sql`LOWER(${column}) <> LOWER(${value})`;
}
/**
* Derive the number of affected rows from a Drizzle write result.
*
* Drizzle returns the raw per-driver result for a non-returning write, so the
* count lives under a different field per driver: node-postgres / neon expose
* `rowCount`, postgres-js / bun-sql carry `count` on an Array subclass, mysql2
* reports `affectedRows` (in a result-header array), planetscale and other
* serverless drivers use `rowsAffected`, better-sqlite3 uses `changes`, and
* Cloudflare D1 nests the count under `meta.changes`. This normalizes them so
* write methods that depend on affected rows honor the adapter contract instead
* of leaking the raw driver result.
*/
function getAffectedRowCount(result, operation, context) {
	let count = 0;
	if (result && typeof result === "object" && "rowCount" in result) count = result.rowCount;
	else if (result && typeof result === "object" && typeof result.count === "number") count = result.count;
	else if (Array.isArray(result)) count = result.length > 0 && hasDriverRowCount(result[0]) ? readDriverRowCount(result[0]) : result.length;
	else if (hasDriverRowCount(result)) count = readDriverRowCount(result);
	if (typeof count !== "number") {
		logger.error(`[Drizzle Adapter] The result of the ${operation} operation is not a number. This is likely a bug in the adapter. Please report this issue to the Better Auth team.`, {
			result,
			...context
		});
		return 0;
	}
	return count;
}
function readDriverRowCount(result) {
	if (!result || typeof result !== "object") return void 0;
	if ("affectedRows" in result) return result.affectedRows;
	if ("rowsAffected" in result) return result.rowsAffected;
	if ("changes" in result) return result.changes;
	if ("meta" in result) {
		const meta = result.meta;
		if (meta && typeof meta === "object" && "changes" in meta) return meta.changes;
	}
}
function hasDriverRowCount(result) {
	return readDriverRowCount(result) !== void 0;
}
var drizzleAdapter = (db, config) => {
	let lazyOptions = null;
	let mysqlNoIdWarned = false;
	const createCustomAdapter = (db, inTransaction = false) => ({ getFieldName, getDefaultFieldName, getDefaultModelName, options, schema: baSchema }) => {
		if (config.provider === "mysql" && options.advanced?.database?.generateId === false && !mysqlNoIdWarned) {
			mysqlNoIdWarned = true;
			logger.warn("[Drizzle Adapter] MySQL does not support INSERT...RETURNING. With generateId set to false, the adapter uses best-effort fallback strategies (unique columns, full-field match) to retrieve inserted rows. For reliable behavior, use Better Auth's default ID generation, a custom generateId function, or generateId: \"serial\" for auto-increment.");
		}
		function getSchema(model) {
			const schema = config.schema || db._.fullSchema;
			if (!schema) throw new BetterAuthError("Drizzle adapter failed to initialize. Schema not found. Please provide a schema object in the adapter options object.");
			const schemaModel = schema[model];
			if (!schemaModel) throw new BetterAuthError(`[# Drizzle Adapter]: The model "${model}" was not found in the schema object. Please pass the schema directly to the adapter options.`);
			return schemaModel;
		}
		const withReturning = async (model, builder, data, where) => {
			if (config.provider !== "mysql") return (await builder.returning())[0];
			await builder.execute();
			const schemaModel = getSchema(model);
			const builderVal = builder.config?.values;
			if (where?.length) {
				const clause = convertWhereClause(where.map((w) => {
					if (data[w.field] !== void 0) return {
						...w,
						value: data[w.field]
					};
					return w;
				}), model);
				return (await db.select().from(schemaModel).where(...clause))[0];
			}
			const fetchInserted = async (tx) => {
				const builderId = builderVal?.[0]?.id?.value;
				if (builderId) return (await tx.select().from(schemaModel).where(eq(schemaModel.id, builderId)).limit(1).execute())[0] ?? null;
				if (data.id) return (await tx.select().from(schemaModel).where(eq(schemaModel.id, data.id)).limit(1).execute())[0] ?? null;
				if (options.advanced?.database?.generateId === "serial" && schemaModel.id) {
					const lastId = (await tx.select({ id: sql`LAST_INSERT_ID()` }).from(schemaModel).limit(1).execute())[0]?.id;
					if (lastId) return (await tx.select().from(schemaModel).where(eq(schemaModel.id, lastId)).limit(1).execute())[0] ?? null;
				}
				const modelSchema = baSchema[getDefaultModelName(model)]?.fields;
				if (modelSchema) for (const [fieldKey, fieldAttr] of Object.entries(modelSchema)) {
					if (!fieldAttr.unique) continue;
					const dbFieldName = getFieldName({
						model,
						field: fieldKey
					});
					const val = data[dbFieldName];
					if (val === void 0 || val === null) continue;
					if (!schemaModel[dbFieldName]) continue;
					const res = await tx.select().from(schemaModel).where(eq(schemaModel[dbFieldName], val)).limit(1).execute();
					if (res[0]) return res[0];
				}
				const conditions = [];
				for (const [key, val] of Object.entries(data)) {
					if (val === void 0 || !schemaModel[key]) continue;
					conditions.push(val === null ? isNull(schemaModel[key]) : eq(schemaModel[key], val));
				}
				if (conditions.length > 0) {
					const combined = and(...conditions);
					if (combined) {
						const res = await tx.select().from(schemaModel).where(combined).limit(2).execute();
						if (res.length === 1) return res[0];
					}
				}
				logger.warn(`[Drizzle Adapter] Unable to safely identify the inserted "${model}" row on MySQL. Enable Better Auth ID generation or use generateId: "serial" for reliable behavior.`);
				return null;
			};
			return inTransaction ? fetchInserted(db) : db.transaction(fetchInserted);
		};
		function convertWhereClause(where, model) {
			const schemaModel = getSchema(model);
			if (!where) return [];
			if (where.length === 1) {
				const w = where[0];
				if (!w) return [];
				const field = getFieldName({
					model,
					field: w.field
				});
				if (!schemaModel[field]) throw new BetterAuthError(`The field "${w.field}" does not exist in the schema for the model "${model}". Please update your schema.`);
				const isInsensitive = (w.mode ?? "sensitive") === "insensitive" && (typeof w.value === "string" || Array.isArray(w.value) && w.value.every((v) => typeof v === "string"));
				if (w.operator === "in") {
					if (!Array.isArray(w.value)) throw new BetterAuthError(`The value for the field "${w.field}" must be an array when using the "in" operator.`);
					if (isInsensitive) return [insensitiveInArray(schemaModel[field], w.value)];
					return [inArray(schemaModel[field], w.value)];
				}
				if (w.operator === "not_in") {
					if (!Array.isArray(w.value)) throw new BetterAuthError(`The value for the field "${w.field}" must be an array when using the "not_in" operator.`);
					if (isInsensitive) return [insensitiveNotInArray(schemaModel[field], w.value)];
					return [notInArray(schemaModel[field], w.value)];
				}
				if (w.operator === "contains") {
					if (isInsensitive && typeof w.value === "string") return [insensitiveIlike(schemaModel[field], `%${w.value}%`, config.provider)];
					return [like(schemaModel[field], `%${w.value}%`)];
				}
				if (w.operator === "starts_with") {
					if (isInsensitive && typeof w.value === "string") return [insensitiveIlike(schemaModel[field], `${w.value}%`, config.provider)];
					return [like(schemaModel[field], `${w.value}%`)];
				}
				if (w.operator === "ends_with") {
					if (isInsensitive && typeof w.value === "string") return [insensitiveIlike(schemaModel[field], `%${w.value}`, config.provider)];
					return [like(schemaModel[field], `%${w.value}`)];
				}
				if (w.operator === "lt") return [lt(schemaModel[field], w.value)];
				if (w.operator === "lte") return [lte(schemaModel[field], w.value)];
				if (w.operator === "ne") {
					if (w.value === null) return [isNotNull(schemaModel[field])];
					if (isInsensitive && typeof w.value === "string") return [insensitiveNe(schemaModel[field], w.value)];
					return [ne(schemaModel[field], w.value)];
				}
				if (w.operator === "gt") return [gt(schemaModel[field], w.value)];
				if (w.operator === "gte") return [gte(schemaModel[field], w.value)];
				if (w.value === null) return [isNull(schemaModel[field])];
				if (isInsensitive && typeof w.value === "string") return [insensitiveEq(schemaModel[field], w.value)];
				return [eq(schemaModel[field], w.value)];
			}
			const andGroup = where.filter((w) => w.connector === "AND" || !w.connector);
			const orGroup = where.filter((w) => w.connector === "OR");
			const andClause = and(...andGroup.map((w) => {
				const field = getFieldName({
					model,
					field: w.field
				});
				const isInsensitive = (w.mode ?? "sensitive") === "insensitive" && (typeof w.value === "string" || Array.isArray(w.value) && w.value.every((v) => typeof v === "string"));
				if (w.operator === "in") {
					if (!Array.isArray(w.value)) throw new BetterAuthError(`The value for the field "${w.field}" must be an array when using the "in" operator.`);
					if (isInsensitive) return insensitiveInArray(schemaModel[field], w.value);
					return inArray(schemaModel[field], w.value);
				}
				if (w.operator === "not_in") {
					if (!Array.isArray(w.value)) throw new BetterAuthError(`The value for the field "${w.field}" must be an array when using the "not_in" operator.`);
					if (isInsensitive) return insensitiveNotInArray(schemaModel[field], w.value);
					return notInArray(schemaModel[field], w.value);
				}
				if (w.operator === "contains") {
					if (isInsensitive && typeof w.value === "string") return insensitiveIlike(schemaModel[field], `%${w.value}%`, config.provider);
					return like(schemaModel[field], `%${w.value}%`);
				}
				if (w.operator === "starts_with") {
					if (isInsensitive && typeof w.value === "string") return insensitiveIlike(schemaModel[field], `${w.value}%`, config.provider);
					return like(schemaModel[field], `${w.value}%`);
				}
				if (w.operator === "ends_with") {
					if (isInsensitive && typeof w.value === "string") return insensitiveIlike(schemaModel[field], `%${w.value}`, config.provider);
					return like(schemaModel[field], `%${w.value}`);
				}
				if (w.operator === "lt") return lt(schemaModel[field], w.value);
				if (w.operator === "lte") return lte(schemaModel[field], w.value);
				if (w.operator === "gt") return gt(schemaModel[field], w.value);
				if (w.operator === "gte") return gte(schemaModel[field], w.value);
				if (w.operator === "ne") {
					if (w.value === null) return isNotNull(schemaModel[field]);
					if (isInsensitive && typeof w.value === "string") return insensitiveNe(schemaModel[field], w.value);
					return ne(schemaModel[field], w.value);
				}
				if (w.value === null) return isNull(schemaModel[field]);
				if (isInsensitive && typeof w.value === "string") return insensitiveEq(schemaModel[field], w.value);
				return eq(schemaModel[field], w.value);
			}));
			const orClause = or(...orGroup.map((w) => {
				const field = getFieldName({
					model,
					field: w.field
				});
				if (!schemaModel[field]) throw new BetterAuthError(`The field "${w.field}" does not exist in the schema for the model "${model}". Please update your schema.`);
				const isInsensitive = (w.mode ?? "sensitive") === "insensitive" && (typeof w.value === "string" || Array.isArray(w.value) && w.value.every((v) => typeof v === "string"));
				if (w.operator === "in") {
					if (!Array.isArray(w.value)) throw new BetterAuthError(`The value for the field "${w.field}" must be an array when using the "in" operator.`);
					if (isInsensitive) return insensitiveInArray(schemaModel[field], w.value);
					return inArray(schemaModel[field], w.value);
				}
				if (w.operator === "not_in") {
					if (!Array.isArray(w.value)) throw new BetterAuthError(`The value for the field "${w.field}" must be an array when using the "not_in" operator.`);
					if (isInsensitive) return insensitiveNotInArray(schemaModel[field], w.value);
					return notInArray(schemaModel[field], w.value);
				}
				if (w.operator === "contains") {
					if (isInsensitive && typeof w.value === "string") return insensitiveIlike(schemaModel[field], `%${w.value}%`, config.provider);
					return like(schemaModel[field], `%${w.value}%`);
				}
				if (w.operator === "starts_with") {
					if (isInsensitive && typeof w.value === "string") return insensitiveIlike(schemaModel[field], `${w.value}%`, config.provider);
					return like(schemaModel[field], `${w.value}%`);
				}
				if (w.operator === "ends_with") {
					if (isInsensitive && typeof w.value === "string") return insensitiveIlike(schemaModel[field], `%${w.value}`, config.provider);
					return like(schemaModel[field], `%${w.value}`);
				}
				if (w.operator === "lt") return lt(schemaModel[field], w.value);
				if (w.operator === "lte") return lte(schemaModel[field], w.value);
				if (w.operator === "gt") return gt(schemaModel[field], w.value);
				if (w.operator === "gte") return gte(schemaModel[field], w.value);
				if (w.operator === "ne") {
					if (w.value === null) return isNotNull(schemaModel[field]);
					if (isInsensitive && typeof w.value === "string") return insensitiveNe(schemaModel[field], w.value);
					return ne(schemaModel[field], w.value);
				}
				if (w.value === null) return isNull(schemaModel[field]);
				if (isInsensitive && typeof w.value === "string") return insensitiveEq(schemaModel[field], w.value);
				return eq(schemaModel[field], w.value);
			}));
			if (andGroup.length && orGroup.length) return [and(andClause, orClause)];
			if (andGroup.length) return [andClause];
			if (orGroup.length) return [orClause];
			return [];
		}
		function checkMissingFields(schema, model, values) {
			if (!schema) throw new BetterAuthError("Drizzle adapter failed to initialize. Drizzle Schema not found. Please provide a schema object in the adapter options object.");
			for (const key in values) {
				let fieldName;
				try {
					fieldName = getFieldName({
						model,
						field: key
					});
				} catch {
					fieldName = key;
				}
				if (!schema[fieldName]) throw new BetterAuthError(`The field "${key}" does not exist in the "${model}" Drizzle schema. Please update your drizzle schema or re-generate using "npx auth@latest generate".`);
			}
		}
		/**
		* Resolve the db.query key for a model.
		*
		* When `usePlural` is false (default), Better Auth uses singular model
		* names like "user", but Drizzle's db.query is keyed by the schema
		* export names (often plural like "users"). This function:
		*
		* 1. Tries the model name directly (works when schema keys match)
		* 2. If usePlural is set, tries appending "s"
		* 3. Falls back to scanning config.schema to find which db.query key
		*    corresponds to the same table object
		*/
		function getQueryModel(model) {
			if (db.query[model]) return model;
			if (config.usePlural) {
				const plural = `${model}s`;
				if (db.query[plural]) return plural;
			}
			if (config.schema) {
				const targetTable = config.schema[model];
				if (targetTable) {
					const fullSchema = db._.fullSchema;
					if (fullSchema) {
						for (const key of Object.keys(db.query)) if (fullSchema[key] === targetTable) return key;
					}
				}
			}
			return null;
		}
		return {
			async create({ model, data: values }) {
				const schemaModel = getSchema(model);
				checkMissingFields(schemaModel, model, values);
				return await withReturning(model, db.insert(schemaModel).values(values), values);
			},
			async findOne({ model, where, select, join }) {
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				if (options.experimental?.joins) {
					const queryModel = getQueryModel(model);
					if (!db.query || !queryModel) {
						logger.error(`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx auth@latest generate".`);
						logger.info("Falling back to regular query");
					} else {
						let includes;
						const pluralJoinResults = [];
						if (join) {
							includes = {};
							const joinEntries = Object.entries(join);
							for (const [model, joinAttr] of joinEntries) {
								const limit = joinAttr.limit ?? options.advanced?.database?.defaultFindManyLimit ?? 100;
								const isUnique = joinAttr.relation === "one-to-one";
								const pluralSuffix = isUnique || config.usePlural ? "" : "s";
								includes[`${model}${pluralSuffix}`] = isUnique ? true : { limit };
								if (!isUnique) pluralJoinResults.push(`${model}${pluralSuffix}`);
							}
						}
						const res = await db.query[queryModel].findFirst({
							where: clause[0],
							columns: select?.length && select.length > 0 ? select.reduce((acc, field) => {
								acc[getFieldName({
									model,
									field
								})] = true;
								return acc;
							}, {}) : void 0,
							with: includes
						});
						if (res) for (const pluralJoinResult of pluralJoinResults) {
							const singularKey = !config.usePlural ? pluralJoinResult.slice(0, -1) : pluralJoinResult;
							res[singularKey] = res[pluralJoinResult];
							if (pluralJoinResult !== singularKey) delete res[pluralJoinResult];
						}
						return res;
					}
				}
				const res = await db.select(select?.length && select.length > 0 ? select.reduce((acc, field) => {
					const fieldName = getFieldName({
						model,
						field
					});
					return {
						...acc,
						[fieldName]: schemaModel[fieldName]
					};
				}, {}) : void 0).from(schemaModel).where(...clause);
				if (!res.length) return null;
				return res[0];
			},
			async findMany({ model, where, sortBy, limit, select, offset, join }) {
				const schemaModel = getSchema(model);
				const clause = where ? convertWhereClause(where, model) : [];
				const sortFn = sortBy?.direction === "desc" ? desc : asc;
				if (options.experimental?.joins) {
					const queryModel = getQueryModel(model);
					if (!queryModel) {
						logger.error(`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx auth@latest generate".`);
						logger.info("Falling back to regular query");
					} else {
						let includes;
						const pluralJoinResults = [];
						if (join) {
							includes = {};
							const joinEntries = Object.entries(join);
							for (const [model, joinAttr] of joinEntries) {
								const isUnique = joinAttr.relation === "one-to-one";
								const limit = joinAttr.limit ?? options.advanced?.database?.defaultFindManyLimit ?? 100;
								const pluralSuffix = isUnique || config.usePlural ? "" : "s";
								includes[`${model}${pluralSuffix}`] = isUnique ? true : { limit };
								if (!isUnique) pluralJoinResults.push(`${model}${pluralSuffix}`);
							}
						}
						let orderBy = void 0;
						if (sortBy?.field) orderBy = [sortFn(schemaModel[getFieldName({
							model,
							field: sortBy?.field
						})])];
						const res = await db.query[queryModel].findMany({
							where: clause[0],
							with: includes,
							columns: select?.length && select.length > 0 ? select.reduce((acc, field) => {
								acc[getFieldName({
									model,
									field
								})] = true;
								return acc;
							}, {}) : void 0,
							limit: limit ?? 100,
							offset: offset ?? 0,
							orderBy
						});
						if (res) for (const item of res) for (const pluralJoinResult of pluralJoinResults) {
							const singularKey = !config.usePlural ? pluralJoinResult.slice(0, -1) : pluralJoinResult;
							if (singularKey === pluralJoinResult) continue;
							item[singularKey] = item[pluralJoinResult];
							delete item[pluralJoinResult];
						}
						return res;
					}
				}
				let builder = db.select(select?.length && select.length > 0 ? select.reduce((acc, field) => {
					const fieldName = getFieldName({
						model,
						field
					});
					return {
						...acc,
						[fieldName]: schemaModel[fieldName]
					};
				}, {}) : void 0).from(schemaModel);
				const effectiveLimit = limit;
				const effectiveOffset = offset;
				if (typeof effectiveLimit !== "undefined") builder = builder.limit(effectiveLimit);
				if (typeof effectiveOffset !== "undefined") builder = builder.offset(effectiveOffset);
				if (sortBy?.field) builder = builder.orderBy(sortFn(schemaModel[getFieldName({
					model,
					field: sortBy?.field
				})]));
				return await builder.where(...clause);
			},
			async count({ model, where }) {
				const schemaModel = getSchema(model);
				const clause = where ? convertWhereClause(where, model) : [];
				return (await db.select({ count: count() }).from(schemaModel).where(...clause))[0].count;
			},
			async update({ model, where, update: values }) {
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				return await withReturning(model, db.update(schemaModel).set(values).where(...clause), values, where);
			},
			async updateMany({ model, where, update: values }) {
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				return getAffectedRowCount(await db.update(schemaModel).set(values).where(...clause), "updateMany", {
					model,
					where
				});
			},
			async delete({ model, where }) {
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				return await db.delete(schemaModel).where(...clause);
			},
			async deleteMany({ model, where }) {
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				return getAffectedRowCount(await db.delete(schemaModel).where(...clause), "deleteMany", {
					model,
					where
				});
			},
			async consumeOne({ model, where }) {
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				const idField = getFieldName({
					model,
					field: "id"
				});
				const idColumn = schemaModel[idField];
				if (config.provider === "mysql") {
					const claimFromTransaction = async (tx) => {
						const target = (await tx.select().from(schemaModel).where(...clause).for("update").limit(1))[0];
						if (!target) return null;
						const targetId = target[idField] ?? target.id;
						if (targetId === void 0 || targetId === null || !idColumn) return null;
						return getAffectedRowCount(await tx.delete(schemaModel).where(eq(idColumn, targetId)).execute(), "consumeOne", {
							model,
							where
						}) > 0 ? target : null;
					};
					return inTransaction ? claimFromTransaction(db) : db.transaction(claimFromTransaction);
				}
				if (!idColumn) return null;
				const targetIds = db.select({ id: idColumn }).from(schemaModel).where(...clause).limit(1);
				return (await db.delete(schemaModel).where(inArray(idColumn, targetIds)).returning())[0] ?? null;
			},
			async incrementOne({ model, where, increment, set }) {
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				const idField = getFieldName({
					model,
					field: "id"
				});
				const idColumn = schemaModel[idField];
				const assignments = {};
				for (const [field, delta] of Object.entries(increment)) {
					const columnName = getFieldName({
						model,
						field
					});
					const column = schemaModel[columnName];
					if (!column) throw new BetterAuthError(`The field "${field}" does not exist in the schema for the model "${model}". Please update your schema.`);
					assignments[columnName] = sql`${column} + ${delta}`;
				}
				if (set) for (const [field, value] of Object.entries(set)) {
					const columnName = getFieldName({
						model,
						field
					});
					if (!schemaModel[columnName]) throw new BetterAuthError(`The field "${field}" does not exist in the schema for the model "${model}". Please update your schema.`);
					assignments[columnName] = value;
				}
				if (config.provider === "mysql") {
					const mutateInTransaction = async (tx) => {
						const target = (await tx.select().from(schemaModel).where(...clause).for("update").limit(1))[0];
						if (!target) return null;
						const targetId = target[idField] ?? target.id;
						if (targetId === void 0 || targetId === null || !idColumn) return null;
						await tx.update(schemaModel).set(assignments).where(eq(idColumn, targetId)).execute();
						return (await tx.select().from(schemaModel).where(eq(idColumn, targetId)).limit(1).execute())[0] ?? null;
					};
					return inTransaction ? mutateInTransaction(db) : db.transaction(mutateInTransaction);
				}
				if (!idColumn) return null;
				const targetIds = db.select({ id: idColumn }).from(schemaModel).where(...clause).limit(1);
				return (await db.update(schemaModel).set(assignments).where(inArray(idColumn, targetIds)).returning())[0] ?? null;
			},
			options: config
		};
	};
	let adapterOptions = null;
	adapterOptions = {
		config: {
			adapterId: "drizzle",
			adapterName: "Drizzle Adapter",
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
			supportsUUIDs: config.provider === "pg" ? true : false,
			supportsJSON: config.provider === "pg" ? true : false,
			supportsArrays: config.provider === "pg" ? true : false,
			customTransformOutput: ({ data, fieldAttributes }) => {
				if (fieldAttributes.type === "date") {
					if (data === null || data === void 0) return data;
					return new Date(data);
				}
				return data;
			},
			transaction: config.transaction ?? false ? (cb) => db.transaction((tx) => {
				return cb(createAdapterFactory({
					config: {
						...adapterOptions.config,
						transaction: false
					},
					adapter: createCustomAdapter(tx, true)
				})(lazyOptions));
			}) : false
		},
		adapter: createCustomAdapter(db)
	};
	const adapter = createAdapterFactory(adapterOptions);
	return (options) => {
		lazyOptions = options;
		return adapter(options);
	};
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/version.mjs
var PACKAGE_VERSION = "1.6.23";
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/plugins/bearer/index.mjs
var BEARER_SCHEME = "bearer ";
function tryDecode(str) {
	try {
		return decodeURIComponent(str);
	} catch {
		return str;
	}
}
/**
* Converts bearer token to session cookie
*/
var bearer = (options) => {
	return {
		id: "bearer",
		version: PACKAGE_VERSION,
		hooks: {
			before: [{
				matcher(context) {
					return Boolean(context.request?.headers.get("authorization") || context.headers?.get("authorization"));
				},
				handler: createAuthMiddleware(async (c) => {
					const authHeader = c.request?.headers.get("authorization") || c.headers?.get("Authorization");
					if (!authHeader) return;
					if (authHeader.slice(0, 7).toLowerCase() !== BEARER_SCHEME) return;
					const token = authHeader.slice(7).trim();
					if (!token) return;
					let decodedToken;
					if (token.includes(".")) decodedToken = token.includes("%") ? tryDecode(token) : token;
					else {
						if (options?.requireSignature) return;
						decodedToken = tryDecode((await serializeSignedCookie("", token, c.context.secret)).replace("=", ""));
					}
					try {
						if (!await createHMAC("SHA-256", "base64urlnopad").verify(c.context.secret, decodedToken.split(".")[0], decodedToken.split(".")[1])) return;
					} catch {
						return;
					}
					const existingHeaders = c.request?.headers || c.headers;
					const headers = new Headers({ ...Object.fromEntries(existingHeaders?.entries()) });
					setRequestCookie(headers, c.context.authCookies.sessionToken.name, decodedToken);
					return { context: { headers } };
				})
			}],
			after: [{
				matcher(context) {
					return true;
				},
				handler: createAuthMiddleware(async (ctx) => {
					const setCookie = ctx.context.responseHeaders?.get("set-cookie");
					if (!setCookie) return;
					const parsedCookies = parseSetCookieHeader(setCookie);
					const cookieName = ctx.context.authCookies.sessionToken.name;
					const sessionCookie = parsedCookies.get(cookieName);
					if (!sessionCookie || !sessionCookie.value || sessionCookie["max-age"] === 0) return;
					const token = sessionCookie.value;
					const exposedHeaders = ctx.context.responseHeaders?.get("access-control-expose-headers") || "";
					const headersSet = new Set(exposedHeaders.split(",").map((header) => header.trim()).filter(Boolean));
					headersSet.add("set-auth-token");
					ctx.setHeader("set-auth-token", token);
					ctx.setHeader("Access-Control-Expose-Headers", Array.from(headersSet).join(", "));
				})
			}]
		},
		options
	};
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/plugins/device-authorization/error-codes.mjs
var DEVICE_AUTHORIZATION_ERROR_CODES = defineErrorCodes({
	INVALID_DEVICE_CODE: "Invalid device code",
	EXPIRED_DEVICE_CODE: "Device code has expired",
	EXPIRED_USER_CODE: "User code has expired",
	AUTHORIZATION_PENDING: "Authorization pending",
	ACCESS_DENIED: "Access denied",
	INVALID_USER_CODE: "Invalid user code",
	DEVICE_CODE_ALREADY_PROCESSED: "Device code already processed",
	DEVICE_CODE_NOT_CLAIMED: "Device code has not been claimed by a verifying session; call `GET /device` with the `user_code` while signed in before approving or denying",
	POLLING_TOO_FREQUENTLY: "Polling too frequently",
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	INVALID_DEVICE_CODE_STATUS: "Invalid device code status",
	AUTHENTICATION_REQUIRED: "Authentication required"
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/plugins/device-authorization/routes.mjs
var defaultCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var deviceCodeBodySchema = z$1.object({
	client_id: z$1.string().meta({ description: "The client ID of the application" }),
	user_id: z$1.string().meta({ description: "The user ID to which the device code should be pre-bound." }).optional(),
	scope: z$1.string().meta({ description: "Space-separated list of scopes" }).optional()
});
var deviceCodeErrorSchema = z$1.object({
	error: z$1.enum(["invalid_request", "invalid_client"]).meta({ description: "Error code" }),
	error_description: z$1.string().meta({ description: "Detailed error description" })
});
var deviceCode$1 = (opts) => {
	const generateDeviceCode = async () => {
		if (opts.generateDeviceCode) return opts.generateDeviceCode();
		return defaultGenerateDeviceCode(opts.deviceCodeLength);
	};
	const generateUserCode = async () => {
		if (opts.generateUserCode) return opts.generateUserCode();
		return defaultGenerateUserCode(opts.userCodeLength);
	};
	return createAuthEndpoint("/device/code", {
		method: "POST",
		body: deviceCodeBodySchema,
		error: deviceCodeErrorSchema,
		metadata: { openapi: {
			description: `Request a device and user code

Follow [rfc8628#section-3.2](https://datatracker.ietf.org/doc/html/rfc8628#section-3.2)`,
			responses: {
				200: {
					description: "Success",
					content: { "application/json": { schema: {
						type: "object",
						properties: {
							device_code: {
								type: "string",
								description: "The device verification code"
							},
							user_code: {
								type: "string",
								description: "The user code to display"
							},
							verification_uri: {
								type: "string",
								format: "uri",
								description: "The URL for user verification. Defaults to /device if not configured."
							},
							verification_uri_complete: {
								type: "string",
								format: "uri",
								description: "The complete URL with user code as query parameter."
							},
							expires_in: {
								type: "number",
								description: "Lifetime in seconds of the device code"
							},
							interval: {
								type: "number",
								description: "Minimum polling interval in seconds"
							}
						}
					} } }
				},
				400: {
					description: "Error response",
					content: { "application/json": { schema: {
						type: "object",
						properties: {
							error: {
								type: "string",
								enum: ["invalid_request", "invalid_client"]
							},
							error_description: { type: "string" }
						}
					} } }
				}
			}
		} }
	}, async (ctx) => {
		if (opts.validateClient) {
			if (!await opts.validateClient(ctx.body.client_id)) throw new APIError("BAD_REQUEST", {
				error: "invalid_client",
				error_description: "Invalid client ID"
			});
		}
		if (opts.onDeviceAuthRequest) await opts.onDeviceAuthRequest(ctx.body.client_id, ctx.body.scope);
		const deviceCode = await generateDeviceCode();
		const userCode = await generateUserCode();
		const expiresIn = ms(opts.expiresIn);
		const expiresAt = new Date(Date.now() + expiresIn);
		await ctx.context.adapter.create({
			model: "deviceCode",
			data: {
				deviceCode,
				userCode,
				userId: ctx.body.user_id || null,
				expiresAt,
				status: "pending",
				pollingInterval: ms(opts.interval),
				clientId: ctx.body.client_id,
				scope: ctx.body.scope
			}
		});
		const { verificationUri, verificationUriComplete } = buildVerificationUris(opts.verificationUri, ctx.context.baseURL, userCode);
		return ctx.json({
			device_code: deviceCode,
			user_code: userCode,
			verification_uri: verificationUri,
			verification_uri_complete: verificationUriComplete,
			expires_in: Math.floor(expiresIn / 1e3),
			interval: Math.floor(ms(opts.interval) / 1e3)
		}, { headers: { "Cache-Control": "no-store" } });
	});
};
var deviceTokenBodySchema = z$1.object({
	grant_type: z$1.literal("urn:ietf:params:oauth:grant-type:device_code").meta({ description: "The grant type for device flow" }),
	device_code: z$1.string().meta({ description: "The device verification code" }),
	client_id: z$1.string().meta({ description: "The client ID of the application" })
});
var deviceTokenErrorSchema = z$1.object({
	error: z$1.enum([
		"authorization_pending",
		"slow_down",
		"expired_token",
		"access_denied",
		"invalid_request",
		"invalid_grant"
	]).meta({ description: "Error code" }),
	error_description: z$1.string().meta({ description: "Detailed error description" })
});
var deviceToken = (opts) => createAuthEndpoint("/device/token", {
	method: "POST",
	body: deviceTokenBodySchema,
	error: deviceTokenErrorSchema,
	metadata: { openapi: {
		description: `Exchange device code for access token

Follow [rfc8628#section-3.4](https://datatracker.ietf.org/doc/html/rfc8628#section-3.4)`,
		responses: {
			200: {
				description: "Success",
				content: { "application/json": { schema: {
					type: "object",
					properties: {
						session: { $ref: "#/components/schemas/Session" },
						user: { $ref: "#/components/schemas/User" }
					}
				} } }
			},
			400: {
				description: "Error response",
				content: { "application/json": { schema: {
					type: "object",
					properties: {
						error: {
							type: "string",
							enum: [
								"authorization_pending",
								"slow_down",
								"expired_token",
								"access_denied",
								"invalid_request",
								"invalid_grant"
							]
						},
						error_description: { type: "string" }
					}
				} } }
			}
		}
	} }
}, async (ctx) => {
	const { device_code, client_id } = ctx.body;
	if (opts.validateClient) {
		if (!await opts.validateClient(client_id)) throw new APIError("BAD_REQUEST", {
			error: "invalid_grant",
			error_description: "Invalid client ID"
		});
	}
	const deviceCodeRecord = await ctx.context.adapter.findOne({
		model: "deviceCode",
		where: [{
			field: "deviceCode",
			value: device_code
		}]
	});
	if (!deviceCodeRecord) throw new APIError("BAD_REQUEST", {
		error: "invalid_grant",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE.message
	});
	if (deviceCodeRecord.clientId && deviceCodeRecord.clientId !== client_id) throw new APIError("BAD_REQUEST", {
		error: "invalid_grant",
		error_description: "Client ID mismatch"
	});
	if (deviceCodeRecord.lastPolledAt && deviceCodeRecord.pollingInterval) {
		if (Date.now() - new Date(deviceCodeRecord.lastPolledAt).getTime() < deviceCodeRecord.pollingInterval) throw new APIError("BAD_REQUEST", {
			error: "slow_down",
			error_description: DEVICE_AUTHORIZATION_ERROR_CODES.POLLING_TOO_FREQUENTLY.message
		});
	}
	await ctx.context.adapter.update({
		model: "deviceCode",
		where: [{
			field: "id",
			value: deviceCodeRecord.id
		}],
		update: { lastPolledAt: /* @__PURE__ */ new Date() }
	});
	if (deviceCodeRecord.expiresAt < /* @__PURE__ */ new Date()) {
		await ctx.context.adapter.delete({
			model: "deviceCode",
			where: [{
				field: "id",
				value: deviceCodeRecord.id
			}]
		});
		throw new APIError("BAD_REQUEST", {
			error: "expired_token",
			error_description: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_DEVICE_CODE.message
		});
	}
	if (deviceCodeRecord.status === "pending") throw new APIError("BAD_REQUEST", {
		error: "authorization_pending",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.AUTHORIZATION_PENDING.message
	});
	if (deviceCodeRecord.status === "denied") {
		await ctx.context.adapter.delete({
			model: "deviceCode",
			where: [{
				field: "id",
				value: deviceCodeRecord.id
			}]
		});
		throw new APIError("BAD_REQUEST", {
			error: "access_denied",
			error_description: DEVICE_AUTHORIZATION_ERROR_CODES.ACCESS_DENIED.message
		});
	}
	if (deviceCodeRecord.status === "approved" && deviceCodeRecord.userId) {
		const claimedDeviceCode = await ctx.context.adapter.consumeOne({
			model: "deviceCode",
			where: [{
				field: "deviceCode",
				value: device_code
			}, {
				field: "status",
				value: "approved"
			}]
		});
		if (!claimedDeviceCode?.userId) throw new APIError("BAD_REQUEST", {
			error: "invalid_grant",
			error_description: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE.message
		});
		const user = await ctx.context.internalAdapter.findUserById(claimedDeviceCode.userId);
		if (!user) throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: DEVICE_AUTHORIZATION_ERROR_CODES.USER_NOT_FOUND.message
		});
		const session = await ctx.context.internalAdapter.createSession(user.id);
		if (!session) throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: DEVICE_AUTHORIZATION_ERROR_CODES.FAILED_TO_CREATE_SESSION.message
		});
		ctx.context.setNewSession({
			session,
			user
		});
		if (ctx.context.options.secondaryStorage) await ctx.context.secondaryStorage?.set(session.token, JSON.stringify({
			user,
			session
		}), Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1e3));
		return ctx.json({
			access_token: session.token,
			token_type: "Bearer",
			expires_in: Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1e3),
			scope: claimedDeviceCode.scope || ""
		}, { headers: {
			"Cache-Control": "no-store",
			Pragma: "no-cache"
		} });
	}
	throw new APIError("INTERNAL_SERVER_ERROR", {
		error: "server_error",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE_STATUS.message
	});
});
var deviceVerify = createAuthEndpoint("/device", {
	method: "GET",
	query: z$1.object({ user_code: z$1.string().meta({ description: "The user code to verify" }) }),
	error: z$1.object({
		error: z$1.enum(["invalid_request"]).meta({ description: "Error code" }),
		error_description: z$1.string().meta({ description: "Detailed error description" })
	}),
	metadata: { openapi: {
		description: "Verify user code and get device authorization status",
		responses: { 200: {
			description: "Device authorization status",
			content: { "application/json": { schema: {
				type: "object",
				properties: {
					user_code: {
						type: "string",
						description: "The user code to verify"
					},
					status: {
						type: "string",
						enum: [
							"pending",
							"approved",
							"denied"
						],
						description: "Current status of the device authorization"
					}
				}
			} } }
		} }
	} }
}, async (ctx) => {
	const { user_code } = ctx.query;
	const cleanUserCode = user_code.replace(/-/g, "");
	const deviceCodeRecord = await ctx.context.adapter.findOne({
		model: "deviceCode",
		where: [{
			field: "userCode",
			value: cleanUserCode
		}]
	});
	if (!deviceCodeRecord) throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE.message
	});
	if (deviceCodeRecord.expiresAt < /* @__PURE__ */ new Date()) throw new APIError("BAD_REQUEST", {
		error: "expired_token",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE.message
	});
	const session = await getSessionFromCtx(ctx);
	if (session?.user?.id && !deviceCodeRecord.userId && deviceCodeRecord.status === "pending") {
		if (await ctx.context.adapter.incrementOne({
			model: "deviceCode",
			where: [
				{
					field: "id",
					value: deviceCodeRecord.id
				},
				{
					field: "status",
					value: "pending"
				},
				{
					field: "userId",
					operator: "eq",
					value: null
				}
			],
			increment: {},
			set: { userId: session.user.id }
		})) deviceCodeRecord.userId = session.user.id;
	}
	return ctx.json({
		user_code,
		status: deviceCodeRecord.status
	});
});
var deviceApprove = createAuthEndpoint("/device/approve", {
	method: "POST",
	body: z$1.object({ userCode: z$1.string().meta({ description: "The user code to approve" }) }),
	error: z$1.object({
		error: z$1.enum([
			"invalid_request",
			"expired_token",
			"device_code_already_processed",
			"unauthorized",
			"access_denied"
		]).meta({ description: "Error code" }),
		error_description: z$1.string().meta({ description: "Detailed error description" })
	}),
	requireHeaders: true,
	metadata: { openapi: {
		description: "Approve device authorization",
		responses: { 200: {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { success: { type: "boolean" } }
			} } }
		} }
	} }
}, async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED", {
		error: "unauthorized",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.AUTHENTICATION_REQUIRED.message
	});
	const { userCode } = ctx.body;
	const cleanUserCode = userCode.replace(/-/g, "");
	const deviceCodeRecord = await ctx.context.adapter.findOne({
		model: "deviceCode",
		where: [{
			field: "userCode",
			value: cleanUserCode
		}]
	});
	if (!deviceCodeRecord) throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE.message
	});
	if (deviceCodeRecord.expiresAt < /* @__PURE__ */ new Date()) throw new APIError("BAD_REQUEST", {
		error: "expired_token",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE.message
	});
	if (deviceCodeRecord.status !== "pending") throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED.message
	});
	if (!deviceCodeRecord.userId) throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_NOT_CLAIMED.message
	});
	if (deviceCodeRecord.userId !== session.user.id) throw new APIError("FORBIDDEN", {
		error: "access_denied",
		error_description: "You are not authorized to approve this device authorization"
	});
	await ctx.context.adapter.update({
		model: "deviceCode",
		where: [{
			field: "id",
			value: deviceCodeRecord.id
		}],
		update: {
			status: "approved",
			userId: session.user.id
		}
	});
	return ctx.json({ success: true });
});
var deviceDeny = createAuthEndpoint("/device/deny", {
	method: "POST",
	body: z$1.object({ userCode: z$1.string().meta({ description: "The user code to deny" }) }),
	error: z$1.object({
		error: z$1.enum([
			"invalid_request",
			"expired_token",
			"unauthorized",
			"access_denied"
		]).meta({ description: "Error code" }),
		error_description: z$1.string().meta({ description: "Detailed error description" })
	}),
	requireHeaders: true,
	metadata: { openapi: {
		description: "Deny device authorization",
		responses: { 200: {
			description: "Success",
			content: { "application/json": { schema: {
				type: "object",
				properties: { success: { type: "boolean" } }
			} } }
		} }
	} }
}, async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED", {
		error: "unauthorized",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.AUTHENTICATION_REQUIRED.message
	});
	const { userCode } = ctx.body;
	const cleanUserCode = userCode.replace(/-/g, "");
	const deviceCodeRecord = await ctx.context.adapter.findOne({
		model: "deviceCode",
		where: [{
			field: "userCode",
			value: cleanUserCode
		}]
	});
	if (!deviceCodeRecord) throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE.message
	});
	if (deviceCodeRecord.expiresAt < /* @__PURE__ */ new Date()) throw new APIError("BAD_REQUEST", {
		error: "expired_token",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE.message
	});
	if (deviceCodeRecord.status !== "pending") throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED.message
	});
	if (!deviceCodeRecord.userId) throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_NOT_CLAIMED.message
	});
	if (deviceCodeRecord.userId !== session.user.id) throw new APIError("FORBIDDEN", {
		error: "access_denied",
		error_description: "You are not authorized to deny this device authorization"
	});
	await ctx.context.adapter.update({
		model: "deviceCode",
		where: [{
			field: "id",
			value: deviceCodeRecord.id
		}],
		update: {
			status: "denied",
			userId: session.user.id
		}
	});
	return ctx.json({ success: true });
});
/**
* @internal
*/
var buildVerificationUris = (verificationUri, baseURL, userCode) => {
	const uri = verificationUri || "/device";
	let verificationUrl;
	try {
		verificationUrl = new URL(uri);
	} catch {
		verificationUrl = new URL(uri, baseURL);
	}
	const verificationUriCompleteUrl = new URL(verificationUrl);
	verificationUriCompleteUrl.searchParams.set("user_code", userCode);
	return {
		verificationUri: verificationUrl.toString(),
		verificationUriComplete: verificationUriCompleteUrl.toString()
	};
};
/**
* @internal
*/
var defaultGenerateDeviceCode = (length) => {
	return generateRandomString(length, "a-z", "A-Z", "0-9");
};
/**
* @internal
*/
var defaultGenerateUserCode = (length) => {
	const chars = new Uint8Array(length);
	return Array.from(crypto.getRandomValues(chars)).map((byte) => defaultCharset[byte % 32]).join("");
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/plugins/device-authorization/schema.mjs
var schema$1 = { deviceCode: { fields: {
	deviceCode: {
		type: "string",
		required: true
	},
	userCode: {
		type: "string",
		required: true
	},
	userId: {
		type: "string",
		required: false
	},
	expiresAt: {
		type: "date",
		required: true
	},
	status: {
		type: "string",
		required: true
	},
	lastPolledAt: {
		type: "date",
		required: false
	},
	pollingInterval: {
		type: "number",
		required: false
	},
	clientId: {
		type: "string",
		required: false
	},
	scope: {
		type: "string",
		required: false
	}
} } };
z$1.object({
	id: z$1.string(),
	deviceCode: z$1.string(),
	userCode: z$1.string(),
	userId: z$1.string().optional(),
	expiresAt: z$1.date(),
	status: z$1.string(),
	lastPolledAt: z$1.date().optional(),
	pollingInterval: z$1.number().optional(),
	clientId: z$1.string().optional(),
	scope: z$1.string().optional()
});
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/plugins/device-authorization/index.mjs
var timeStringSchema = z$1.custom((val) => {
	if (typeof val !== "string") return false;
	try {
		ms(val);
		return true;
	} catch {
		return false;
	}
}, { message: "Invalid time string format. Use formats like '30m', '5s', '1h', etc." });
var deviceAuthorizationOptionsSchema = z$1.object({
	expiresIn: timeStringSchema.default("30m").describe("Time in seconds until the device code expires. Use formats like '30m', '5s', '1h', etc."),
	interval: timeStringSchema.default("5s").describe("Time in seconds between polling attempts. Use formats like '30m', '5s', '1h', etc."),
	deviceCodeLength: z$1.number().int().positive().default(40).describe("Length of the device code to be generated. Default is 40 characters."),
	userCodeLength: z$1.number().int().positive().default(8).describe("Length of the user code to be generated. Default is 8 characters."),
	generateDeviceCode: z$1.custom((val) => typeof val === "function", { message: "generateDeviceCode must be a function that returns a string or a promise that resolves to a string." }).optional().describe("Function to generate a device code. If not provided, a default random string generator will be used."),
	generateUserCode: z$1.custom((val) => typeof val === "function", { message: "generateUserCode must be a function that returns a string or a promise that resolves to a string." }).optional().describe("Function to generate a user code. If not provided, a default random string generator will be used."),
	validateClient: z$1.custom((val) => typeof val === "function", { message: "validateClient must be a function that returns a boolean or a promise that resolves to a boolean." }).optional().describe("Function to validate the client ID. If not provided, no validation will be performed."),
	onDeviceAuthRequest: z$1.custom((val) => typeof val === "function", { message: "onDeviceAuthRequest must be a function that returns void or a promise that resolves to void." }).optional().describe("Function to handle device authorization requests. If not provided, no additional actions will be taken."),
	verificationUri: z$1.string().optional().describe("The URI where users verify their device code. Can be an absolute URL (https://example.com/device) or relative path (/custom-path). This will be returned as verification_uri in the device code response. If not provided, defaults to /device."),
	schema: z$1.custom(() => true).optional()
});
var deviceAuthorization = (options = {}) => {
	const opts = deviceAuthorizationOptionsSchema.parse(options);
	return {
		id: "device-authorization",
		version: PACKAGE_VERSION,
		schema: mergeSchema(schema$1, options?.schema),
		endpoints: {
			deviceCode: deviceCode$1(opts),
			deviceToken: deviceToken(opts),
			deviceVerify,
			deviceApprove,
			deviceDeny
		},
		$ERROR_CODES: DEVICE_AUTHORIZATION_ERROR_CODES,
		options
	};
};
//#endregion
//#region src/lib/server/schema/auth.ts
var user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});
var session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" })
});
var account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});
var verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true })
});
var proofOfWorkChallenges = pgTable("proof_of_work_challenges", {
	id: text("id").primaryKey(),
	nonce: text("nonce").notNull(),
	purpose: text("purpose").notNull(),
	difficultyBits: integer("difficulty_bits").notNull(),
	expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
	usedAt: bigint("used_at", { mode: "number" }),
	createdAt: bigint("created_at", { mode: "number" }).notNull()
}, (t) => [index("proof_of_work_challenges_expiry_idx").on(t.expiresAt), index("proof_of_work_challenges_used_idx").on(t.usedAt)]);
//#endregion
//#region src/lib/server/schema/device.ts
var deviceCode = pgTable("device_code", {
	id: text("id").primaryKey(),
	deviceCode: text("device_code").notNull(),
	userCode: text("user_code").notNull(),
	userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	status: text("status").notNull(),
	lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
	pollingInterval: integer("polling_interval"),
	clientId: text("client_id"),
	scope: text("scope")
}, (t) => [
	uniqueIndex("device_code_device_code_unique").on(t.deviceCode),
	uniqueIndex("device_code_user_code_unique").on(t.userCode),
	index("device_code_expires_idx").on(t.expiresAt),
	index("device_code_user_idx").on(t.userId)
]);
//#endregion
//#region src/lib/server/schema/email.ts
var emailQueue = pgTable("email_queue", {
	id: text("id").primaryKey(),
	templateKey: text("template_key").notNull(),
	toAddress: text("to_address").notNull(),
	payloadEncrypted: text("payload_encrypted"),
	status: text("status").notNull(),
	priority: integer("priority").notNull(),
	attempts: integer("attempts").notNull(),
	maxAttempts: integer("max_attempts").notNull(),
	availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
	leaseOwner: text("lease_owner"),
	leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
	idempotencyKey: text("idempotency_key").unique(),
	lastErrorCode: text("last_error_code"),
	lastErrorMessage: text("last_error_message"),
	smtpMessageId: text("smtp_message_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true }),
	deadAt: timestamp("dead_at", { withTimezone: true })
}, (t) => [
	index("email_queue_claim_idx").on(t.status, t.availableAt, t.priority),
	index("email_queue_created_idx").on(t.createdAt),
	index("email_queue_to_idx").on(t.toAddress),
	index("email_queue_template_idx").on(t.templateKey)
]);
//#endregion
//#region src/lib/server/schema/names.ts
var names = pgTable("names", {
	name: text("name").primaryKey(),
	ownerUserId: text("owner_user_id").notNull().references(() => user.id),
	status: text("status").notNull(),
	checkoutId: text("checkout_id"),
	orderId: text("order_id"),
	pricePaidEur: numeric("price_paid_eur"),
	purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	revokeReason: text("revoke_reason"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (t) => [
	index("names_owner_idx").on(t.ownerUserId),
	index("names_status_idx").on(t.status),
	index("names_checkout_idx").on(t.checkoutId)
]);
var nameHolds = pgTable("name_holds", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	/** Which tier's CTA sent them here — avenid | avenme | avenceo | avencoop. */
	tier: text("tier").notNull().default(""),
	/** What to call them. */
	salutation: text("salutation").notNull().default(""),
	/** Free text: what they want to build. Read when deciding a wildcard invite. */
	idea: text("idea").notNull().default(""),
	claimTokenHash: text("claim_token_hash").notNull().default(""),
	successTokenHash: text("success_token_hash").notNull().default(""),
	emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
	reservedUntil: timestamp("reserved_until", { withTimezone: true }),
	checkoutId: text("checkout_id"),
	checkoutUrl: text("checkout_url"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
}, (t) => [
	index("name_holds_name_idx").on(t.name),
	index("name_holds_expiry_idx").on(t.expiresAt),
	index("name_holds_email_idx").on(t.email),
	index("name_holds_tier_idx").on(t.tier),
	index("name_holds_claim_token_idx").on(t.claimTokenHash),
	index("name_holds_reserved_idx").on(t.reservedUntil)
]);
var purchaseSessions = pgTable("purchase_sessions", {
	tokenHash: text("token_hash").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});
var paymentEvents = pgTable("payment_events", {
	id: text("id").primaryKey(),
	eventType: text("event_type").notNull(),
	checkoutId: text("checkout_id"),
	payload: jsonb("payload").notNull().default({}),
	processedAt: timestamp("processed_at", { withTimezone: true }).notNull()
}, (table) => [index("payment_events_checkout_idx").on(table.checkoutId)]);
//#endregion
//#region src/lib/server/schema/environments.ts
var customerEnvironments = pgTable("customer_environments", {
	id: text("id").primaryKey(),
	ownerUserId: text("owner_user_id").notNull().references(() => user.id),
	name: text("name").notNull().unique().references(() => names.name),
	databaseName: text("database_name").notNull().unique(),
	ownerRole: text("owner_role").notNull().unique(),
	stackName: text("stack_name").notNull().unique(),
	contractVersion: integer("contract_version").notNull().default(1),
	effectiveConfig: jsonb("effective_config").notNull().default({}),
	status: text("status").notNull(),
	lastOperation: text("last_operation"),
	lastErrorCode: text("last_error_code"),
	lastErrorMessage: text("last_error_message"),
	queuedAt: timestamp("queued_at", { withTimezone: true }).notNull(),
	provisioningAt: timestamp("provisioning_at", { withTimezone: true }),
	readyAt: timestamp("ready_at", { withTimezone: true }),
	suspendedAt: timestamp("suspended_at", { withTimezone: true }),
	failedAt: timestamp("failed_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (table) => [index("customer_environments_owner_idx").on(table.ownerUserId), index("customer_environments_status_idx").on(table.status)]);
var customerEnvironmentJobs = pgTable("customer_environment_jobs", {
	id: text("id").primaryKey(),
	environmentId: text("environment_id").notNull().references(() => customerEnvironments.id),
	operation: text("operation").notNull(),
	status: text("status").notNull(),
	attempt: integer("attempt").notNull().default(0),
	availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
	leaseOwner: text("lease_owner"),
	leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	errorCode: text("error_code"),
	errorMessage: text("error_message")
}, (table) => [index("customer_environment_jobs_claim_idx").on(table.status, table.availableAt), uniqueIndex("customer_environment_jobs_one_unfinished").on(table.environmentId).where(sql`${table.status} IN ('queued','running')`)]);
var customerEnvironmentLogs = pgTable("customer_environment_logs", {
	id: bigserial("id", { mode: "number" }).primaryKey(),
	jobId: text("job_id").notNull().references(() => customerEnvironmentJobs.id),
	sequence: integer("sequence").notNull(),
	level: text("level").notNull(),
	message: text("message").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [uniqueIndex("customer_environment_logs_job_sequence_unique").on(table.jobId, table.sequence)]);
//#endregion
//#region src/lib/server/schema/ops.ts
var auditEvents = pgTable("audit_events", {
	id: text("id").primaryKey(),
	eventType: text("event_type").notNull(),
	actorUserId: text("actor_user_id"),
	targetUserId: text("target_user_id"),
	emailQueueId: text("email_queue_id"),
	metadata: jsonb("metadata").notNull().default({}),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});
var workerHeartbeats = pgTable("worker_heartbeats", {
	workerName: text("worker_name").primaryKey(),
	instanceId: text("instance_id").notNull(),
	version: text("version").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
	lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull(),
	metadata: jsonb("metadata").notNull().default({})
});
//#endregion
//#region src/lib/server/schema/index.ts
var schema = {
	user,
	session,
	account,
	verification,
	deviceCode,
	passkey: pgTable("passkey", {
		id: text("id").primaryKey(),
		name: text("name"),
		publicKey: text("public_key").notNull(),
		userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credential_id").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("device_type").notNull(),
		backedUp: boolean("backed_up").notNull(),
		transports: text("transports"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		aaguid: text("aaguid"),
		prfEnabled: boolean("prf_enabled").notNull().default(false)
	}, (table) => [uniqueIndex("passkey_credential_id_unique").on(table.credentialID), index("passkey_user_id_idx").on(table.userId)]),
	setupLinks: pgTable("setup_links", {
		userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull().unique(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true })
	}),
	proofOfWorkChallenges,
	emailQueue,
	names,
	nameHolds,
	purchaseSessions,
	paymentEvents,
	customerEnvironments,
	customerEnvironmentJobs,
	customerEnvironmentLogs,
	auditEvents,
	workerHeartbeats
};
//#endregion
//#region src/lib/server/sign-in.ts
function setupSignIn(verifiers) {
	return {
		id: "setup-sign-in",
		endpoints: {
			signInPurchaseToken: createAuthEndpoint("/sign-in/purchase-token", {
				method: "POST",
				body: z.object({ token: z.string().min(8).max(128) })
			}, async (ctx) => {
				const verified = await verifiers.verifyPurchaseLogin(ctx.body.token);
				const user = verified ? await ctx.context.internalAdapter.findUserById(verified.userId) : null;
				if (!user) throw new APIError("UNAUTHORIZED", { message: "The purchase is not confirmed yet." });
				const session = await ctx.context.internalAdapter.createSession(user.id);
				if (!session) throw new APIError("UNAUTHORIZED", { message: "Could not create a session." });
				await setSessionCookie(ctx, {
					session,
					user
				});
				return ctx.json({ user: {
					id: user.id,
					email: user.email,
					name: user.name
				} });
			}),
			signInSetupToken: createAuthEndpoint("/sign-in/setup-token", {
				method: "GET",
				query: z.object({ token: z.string().min(8).max(128) })
			}, async (ctx) => {
				const verified = await verifiers.verifySetupLogin(ctx.query.token);
				const user = verified ? await ctx.context.internalAdapter.findUserById(verified.userId) : null;
				if (!user) throw ctx.redirect("/login?access=invalid");
				const session = await ctx.context.internalAdapter.createSession(user.id);
				if (!session) throw ctx.redirect("/login?access=invalid");
				await setSessionCookie(ctx, {
					session,
					user
				});
				throw ctx.redirect("/dashboard");
			})
		},
		rateLimit: [{
			pathMatcher: (path) => path === "/sign-in/setup-token",
			window: 60,
			max: 20
		}, {
			pathMatcher: (path) => path === "/sign-in/purchase-token",
			window: 60,
			max: 60
		}]
	};
}
//#endregion
//#region src/lib/server/auth.ts
var AVENOS_DEVICE_CLIENT_ID = "ceo.aven.os";
function requirePasskeyUserVerification(userVerified) {
	if (!userVerified) throw new Error("Passkey authentication requires user verification.");
}
function createAuth(config, database, verifiers) {
	return betterAuth({
		appName: "Aven",
		baseURL: config.PUBLIC_BASE_URL,
		basePath: "/api/auth",
		secret: config.BETTER_AUTH_SECRET,
		trustedOrigins: [config.PUBLIC_BASE_URL],
		database: drizzleAdapter(database.db, {
			provider: "pg",
			schema
		}),
		session: {
			expiresIn: config.BETTER_AUTH_SESSION_MAX_AGE_SECONDS,
			updateAge: config.BETTER_AUTH_SESSION_UPDATE_AGE_SECONDS
		},
		advanced: { useSecureCookies: config.NODE_ENV === "production" },
		rateLimit: {
			enabled: true,
			window: 60,
			max: 60,
			customRules: {
				"/device/code": {
					window: 60,
					max: 10
				},
				"/device/token": {
					window: 60,
					max: 30
				},
				"/device/approve": {
					window: 60,
					max: 10
				},
				"/passkey/generate-authenticate-options": {
					window: 60,
					max: 20
				},
				"/passkey/verify-authentication": {
					window: 60,
					max: 10
				},
				"/passkey/generate-register-options": {
					window: 3600,
					max: 10
				},
				"/passkey/verify-registration": {
					window: 3600,
					max: 10
				}
			}
		},
		plugins: [
			bearer(),
			deviceAuthorization({
				expiresIn: "10m",
				interval: "3s",
				verificationUri: "/device",
				validateClient: (clientId) => clientId === AVENOS_DEVICE_CLIENT_ID
			}),
			passkey({
				rpID: config.WEBAUTHN_RP_ID,
				rpName: "Aven",
				origin: config.PUBLIC_BASE_URL,
				authenticatorSelection: {
					residentKey: "required",
					userVerification: "required"
				},
				authentication: { afterVerification: ({ verification }) => requirePasskeyUserVerification(verification.authenticationInfo.userVerified) }
			}),
			setupSignIn(verifiers)
		]
	});
}
//#endregion
//#region src/lib/server/billing/provider.ts
function parseCreemSubscriptionEvent(rawBody) {
	let payload;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		throw new AppError(400, "WEBHOOK_PAYLOAD_INVALID", "The webhook payload is not JSON.");
	}
	const type = String(payload.eventType ?? payload.event_type ?? "");
	if (!type.startsWith("subscription.")) return null;
	const object = payload.object ?? {};
	const product = object.product ?? {};
	const customer = object.customer ?? {};
	const metadata = object.metadata ?? {};
	const priceCents = Number(product.price ?? object.amount ?? NaN);
	const subscriptionId = String(object.id ?? "");
	if (!subscriptionId) return null;
	return {
		id: String(payload.id ?? ""),
		type,
		providerSubscriptionId: subscriptionId,
		providerCustomerId: typeof customer === "string" ? customer : customer.id ?? object.customer_id ?? null,
		email: typeof customer === "object" ? customer.email ?? null : null,
		userId: typeof metadata.userId === "string" ? metadata.userId : null,
		tier: typeof metadata.tier === "string" ? metadata.tier : typeof product.metadata?.tier === "string" ? String(product.metadata.tier) : null,
		status: String(object.status ?? ""),
		currentPeriodEnd: object.current_period_end_date ?? object.currentPeriodEndDate ?? object.current_period_end ?? null,
		cancelAtPeriodEnd: object.status === "scheduled_cancel" || Boolean(object.canceled_at ?? object.cancel_at_period_end),
		priceCents: Number.isFinite(priceCents) ? priceCents : null
	};
}
function signWebhookPayload(rawBody, secret) {
	return createHmac("sha256", secret).update(rawBody).digest("hex");
}
function assertWebhookSignature(rawBody, signature, secret) {
	if (!signature) throw new AppError(400, "WEBHOOK_SIGNATURE_MISSING", "The webhook signature header is missing.");
	const expected = Buffer.from(signWebhookPayload(rawBody, secret), "hex");
	const provided = Buffer.from(/^[0-9a-f]+$/i.test(signature) ? signature : "00", "hex");
	if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new AppError(400, "WEBHOOK_SIGNATURE_INVALID", "The webhook signature is invalid.");
}
function parseCreemEvent(rawBody) {
	let payload;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		throw new AppError(400, "WEBHOOK_PAYLOAD_INVALID", "The webhook payload is not JSON.");
	}
	const object = payload.object ?? {};
	const order = object.order ?? {};
	const amountCents = Number(order.amount ?? object.amount ?? NaN);
	return {
		id: String(payload.id ?? ""),
		type: String(payload.eventType ?? payload.event_type ?? ""),
		checkoutId: object.checkout_id ?? object.checkout?.id ?? (String(payload.eventType ?? "").startsWith("checkout") ? object.id ?? null : null),
		orderId: order.id ?? object.order_id ?? null,
		email: object.customer?.email ?? order.customer?.email ?? null,
		amountEur: Number.isFinite(amountCents) ? amountCents / 100 : null,
		metadata: object.metadata ?? {}
	};
}
//#endregion
//#region src/lib/server/billing/creem.ts
var CreemProvider = class {
	config;
	kind = "creem";
	constructor(config) {
		this.config = config;
	}
	base() {
		if (this.config.CREEM_API_BASE) return this.config.CREEM_API_BASE.replace(/\/$/, "");
		return this.config.CREEM_API_KEY.startsWith("creem_test_") ? "https://test-api.creem.io" : "https://api.creem.io";
	}
	async createCheckout(input) {
		const response = await fetch(`${this.base()}/v1/checkouts`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.config.CREEM_API_KEY
			},
			body: JSON.stringify({
				product_id: this.config.CREEM_PRODUCT_ID,
				request_id: input.holdId,
				success_url: input.successUrl,
				customer: { email: input.email },
				metadata: {
					holdId: input.holdId,
					name: input.name
				}
			})
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			throw new AppError(502, "CHECKOUT_CREATE_FAILED", `The payment provider rejected the checkout (${response.status}).`, detail.slice(0, 300));
		}
		const body = await response.json();
		const checkoutUrl = body.checkoutUrl ?? body.checkout_url;
		if (!body.id || !checkoutUrl) throw new AppError(502, "CHECKOUT_CREATE_FAILED", "The payment provider returned an incomplete checkout.");
		return {
			checkoutId: body.id,
			checkoutUrl
		};
	}
	/** One place for every authenticated Creem call: the x-api-key header
	* never leaves this module, and error surfaces read the same. */
	async api(method, path, body) {
		const response = await fetch(`${this.base()}${path}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.config.CREEM_API_KEY
			},
			...body === void 0 ? {} : { body: JSON.stringify(body) }
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			throw new AppError(502, "BILLING_PROVIDER_ERROR", `The payment provider rejected ${method} ${path} (${response.status}).`, detail.slice(0, 300));
		}
		return await response.json();
	}
	async ensureSubscriptionProducts(seeds) {
		const pinned = {
			avenme: this.config.CREEM_PRODUCT_AVENME || void 0,
			avenceo: this.config.CREEM_PRODUCT_AVENCEO || void 0
		};
		const map = {};
		let existing = null;
		for (const seed of seeds) {
			const pin = pinned[seed.tier];
			if (pin) {
				map[seed.tier] = pin;
				continue;
			}
			if (existing === null) existing = (await this.api("GET", "/v1/products/search?page_size=100")).items ?? [];
			const named = existing.find((product) => product.name === seed.name && product.id);
			if (named) {
				map[seed.tier] = String(named.id);
				continue;
			}
			const created = await this.api("POST", "/v1/products", {
				name: seed.name,
				description: seed.description,
				price: seed.priceCents,
				currency: "EUR",
				billing_type: "recurring",
				billing_period: "every-month",
				tax_mode: "exclusive",
				tax_category: "saas"
			});
			map[seed.tier] = created.id;
		}
		return map;
	}
	/** The provider's customer record for an email, if one exists — how a
	* member who bought BEFORE we started storing customer ids (the one-off
	* avenID) gets their history connected. */
	async findCustomerByEmail(email) {
		try {
			return (await this.api("GET", `/v1/customers?email=${encodeURIComponent(email)}`)).id ?? null;
		} catch {
			return null;
		}
	}
	async createSubscriptionCheckout(input) {
		const body = await this.api("POST", "/v1/checkouts", {
			product_id: input.productId,
			success_url: input.successUrl,
			customer: { email: input.email },
			metadata: {
				userId: input.userId,
				tier: input.tier
			}
		});
		const checkoutUrl = body.checkoutUrl ?? body.checkout_url;
		if (!body.id || !checkoutUrl) throw new AppError(502, "CHECKOUT_CREATE_FAILED", "The payment provider returned an incomplete checkout.");
		return {
			checkoutId: body.id,
			checkoutUrl
		};
	}
	async changeSubscription(providerSubscriptionId, productId) {
		await this.api("POST", `/v1/subscriptions/${providerSubscriptionId}/upgrade`, {
			product_id: productId,
			update_behavior: "proration-charge-immediately"
		});
	}
	async cancelSubscription(providerSubscriptionId, immediate) {
		await this.api("POST", `/v1/subscriptions/${providerSubscriptionId}/cancel`, { mode: immediate ? "immediately" : "scheduled_cancel" });
	}
	async resumeSubscription(providerSubscriptionId) {
		await this.api("POST", `/v1/subscriptions/${providerSubscriptionId}/resume`, {});
	}
	async listInvoices(providerCustomerId) {
		return ((await this.api("GET", `/v1/transactions/search?customer_id=${encodeURIComponent(providerCustomerId)}&page_size=100`)).items ?? []).map((tx) => ({
			id: String(tx.id ?? ""),
			createdAt: new Date(Number(tx.created_at ?? tx.createdAt ?? 0)).toISOString(),
			amountCents: Number(tx.amount ?? 0),
			taxCents: Number(tx.tax_amount ?? tx.taxAmount ?? 0),
			currency: String(tx.currency ?? "EUR"),
			status: String(tx.status ?? ""),
			periodStart: tx.period_start ? new Date(Number(tx.period_start)).toISOString() : null,
			periodEnd: tx.period_end ? new Date(Number(tx.period_end)).toISOString() : null
		}));
	}
	async listOrders(providerCustomerId) {
		return ((await this.api("GET", `/v1/customers/${encodeURIComponent(providerCustomerId)}/orders?page_size=100`)).items ?? []).map((order) => ({
			id: String(order.id ?? ""),
			createdAt: new Date(Number(order.created_at ?? order.createdAt ?? 0)).toISOString(),
			productId: String(order.product ?? order.product_id ?? ""),
			subTotalCents: Number(order.sub_total ?? order.subTotal ?? order.amount ?? 0),
			taxCents: Number(order.tax_amount ?? order.taxAmount ?? 0),
			discountCents: Number(order.discount_amount ?? order.discountAmount ?? 0),
			amountPaidCents: Number(order.amount_paid ?? order.amountPaid ?? order.amount ?? 0),
			currency: String(order.currency ?? "EUR"),
			status: String(order.status ?? "")
		}));
	}
	async pauseSubscription(providerSubscriptionId) {
		await this.api("POST", `/v1/subscriptions/${providerSubscriptionId}/pause`, {});
	}
	async checkoutStatus(providerCheckoutId) {
		const result = await this.api("GET", `/v1/checkouts?checkout_id=${encodeURIComponent(providerCheckoutId)}`);
		return String(result.status ?? "pending");
	}
	verifyWebhook(rawBody, signature) {
		assertWebhookSignature(rawBody, signature, this.config.CREEM_WEBHOOK_SECRET);
		return parseCreemEvent(rawBody);
	}
};
//#endregion
//#region src/lib/server/billing/fake.ts
var FakePaymentProvider = class {
	config;
	kind = "fake";
	constructor(config) {
		this.config = config;
	}
	async createCheckout(input) {
		const checkoutId = `fake_${randomUUID()}`;
		const url = new URL("/purchase/fake-checkout", this.config.PUBLIC_BASE_URL);
		url.searchParams.set("checkoutId", checkoutId);
		url.searchParams.set("holdId", input.holdId);
		url.searchParams.set("name", input.name);
		url.searchParams.set("email", input.email);
		url.searchParams.set("successUrl", input.successUrl);
		return {
			checkoutId,
			checkoutUrl: url.toString()
		};
	}
	verifyWebhook(rawBody, signature) {
		assertWebhookSignature(rawBody, signature, this.config.CREEM_WEBHOOK_SECRET);
		return parseCreemEvent(rawBody);
	}
	async ensureSubscriptionProducts(seeds) {
		return Object.fromEntries(seeds.map((seed) => [seed.tier, `fake_prod_${seed.tier}`]));
	}
	async createSubscriptionCheckout(input) {
		const checkoutId = `fake_${randomUUID()}`;
		const url = new URL("/purchase/fake-checkout", this.config.PUBLIC_BASE_URL);
		url.searchParams.set("checkoutId", checkoutId);
		url.searchParams.set("tier", input.tier);
		url.searchParams.set("userId", input.userId);
		url.searchParams.set("email", input.email);
		url.searchParams.set("successUrl", input.successUrl);
		return {
			checkoutId,
			checkoutUrl: url.toString()
		};
	}
	async changeSubscription() {}
	async cancelSubscription() {}
	async resumeSubscription() {}
	async listInvoices() {
		return [];
	}
	async findCustomerByEmail() {
		return null;
	}
	async listOrders() {
		return [];
	}
	async pauseSubscription() {}
	async checkoutStatus() {
		return "pending";
	}
	buildCompletedWebhookBody(input) {
		return JSON.stringify({
			id: `evt_fake_${randomUUID()}`,
			eventType: "checkout.completed",
			object: {
				id: input.checkoutId,
				order: {
					id: `ord_fake_${randomUUID()}`,
					amount: Math.round(input.amountEur * 100),
					customer: { email: input.email }
				},
				customer: { email: input.email },
				metadata: {
					holdId: input.holdId,
					name: input.name
				}
			}
		});
	}
};
function createPaymentProvider(config) {
	return config.CREEM_API_KEY ? new CreemProvider(config) : new FakePaymentProvider(config);
}
//#endregion
//#region ../../libs/aven-website/src/lib/pricing/plans-data.ts
/** Ascending: each plan includes everything from the ones before it. */
var PLANS = [
	{
		id: "avenid",
		name: "avenID",
		role: "Dein Name — der Anfang von allem",
		eurPrice: 25,
		billing: "once",
		platformFeePct: 0,
		reinvestPct: 0,
		features: [
			"Dein avenID‑Name — für 1 Jahr für dich gesichert",
			"Dein Platz auf der Warteliste",
			"20 Min Test‑Zugang — sobald du eingeladen bist"
		]
	},
	{
		id: "avenme",
		name: "avenME",
		role: "Dein Leben — organisiert, jeden Tag",
		eurPrice: 42,
		billing: "monthly",
		referralPct: 10,
		runtime: {
			hoursPerDay: 1,
			centsPerExtraMinute: 10
		},
		platformFeePct: 0,
		reinvestPct: 0,
		features: [
			"Persönliche Live‑Organisation: Aufgaben, Termine, Erinnerungen",
			{
				skill: "inbox-router",
				label: "Ein Eingang für alles"
			},
			{
				skill: "email-manager",
				label: "E‑Mail‑Inbox"
			},
			"Digitaler Briefkasten — deine Papierpost digitalisiert (exkl. Nachsendeauftrag der Deutschen Post: 31,90 € / 6 Monate, inkl. USt.)",
			{
				skill: "docs-organizer",
				label: "Dokumentenverwaltung"
			},
			{
				skill: "brain-memorizer",
				label: "Notizen, Kontakte, Beziehungen"
			},
			{
				skill: "human-reviewer",
				label: "Du entscheidest, wenn es zählt"
			},
			{
				skill: "calendar-organizer",
				label: "Dein Kalender denkt mit"
			},
			{
				skill: "todo-shuffler",
				label: "Deine Liste sortiert sich selbst"
			},
			{
				skill: "bookmark-champion",
				label: "Links und Lesezeichen, wiederfindbar"
			},
			"1 Personal Spark"
		]
	},
	{
		id: "avenceo",
		name: "avenCEO",
		role: "Deine Firma — alles Geschäftliche",
		eurPrice: 326,
		billing: "monthly",
		referralPct: 15,
		runtime: {
			hoursPerDay: 4,
			centsPerExtraMinute: 8
		},
		platformFeePct: 6,
		reinvestPct: 6,
		highlight: true,
		features: [
			{
				skill: "book-keeper",
				label: "Vorbuchhaltung"
			},
			{
				skill: "finance-brain",
				label: "Finanz‑Dashboard und Rechnungen"
			},
			"Agent‑API‑Auth‑Proxy",
			{
				skill: "website-creator",
				label: "Website und Landingpages"
			},
			{
				skill: "checkout-builder",
				label: "Produkt‑Checkout und Shop"
			},
			{
				skill: "blog-writer",
				label: "Blog"
			},
			"Digitaler Briefkasten für Geschäftskunden (exkl. Nachsendeauftrag der Deutschen Post: 51,90 € / 6 Monate, inkl. USt.)",
			"Dein Aven und deine Produkte im aven Marketplace gelistet",
			"3 Company Sparks — zusätzlich zu deinem Personal Spark"
		]
	},
	{
		id: "avencoop",
		name: "avenCOOP",
		role: "Wir werden dein technischer Co‑Founder",
		eurPrice: 1895,
		billing: "monthly",
		referralPct: 20,
		runtime: {
			hoursPerDay: 12,
			centsPerExtraMinute: 5
		},
		platformFeePct: 6,
		reinvestPct: 12,
		equitySharePct: 5,
		applyOnly: true,
		features: [
			"1× avenCEO inklusive — avenCEO gilt pro Mensch, avenCOOP pro Firma",
			"10 Company Sparks",
			"Wir bauen aktiv an deinem Produkt mit — faktisch dein externer CTO und Co‑Founder",
			"Begleitung durch die deutsche Gründungs‑Bürokratie: GmbH oder UG",
			"Du wählst selbst, in welche avenCOOPs dein Reinvest fließt — unsere avenCEO GmbH steht mit zur Wahl",
			{
				href: "https://beel.com/de",
				label: "Wir führen dein beel‑Syndikat an — mit Community‑Investments deiner Unterstützer"
			}
		]
	}
];
PLANS.map((p) => p.id);
//#endregion
//#region src/lib/server/audit.ts
async function writeAudit(connection, input) {
	const id = randomUUID();
	await connection.query(`INSERT INTO audit_events (id,event_type,actor_user_id,target_user_id,email_queue_id,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
		id,
		input.eventType,
		input.actorUserId ?? null,
		input.targetUserId ?? null,
		input.emailQueueId ?? null,
		JSON.stringify(input.metadata ?? {}),
		/* @__PURE__ */ new Date()
	]);
	return id;
}
//#endregion
//#region src/lib/server/identity.ts
async function findUserByEmail(connection, email) {
	return (await connection.query("SELECT id, name, email FROM \"user\" WHERE lower(email)=lower($1)", [email])).rows[0] ?? null;
}
async function isActiveUser(connection, userId) {
	return Boolean((await connection.query("SELECT 1 FROM \"user\" WHERE id=$1", [userId])).rows[0]);
}
async function ensureVerifiedUser(connection, email, source) {
	const existing = await findUserByEmail(connection, email);
	if (existing) return existing;
	const id = randomUUID();
	const name = email.split("@")[0] ?? email;
	if ((await connection.query("INSERT INTO \"user\" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now()) ON CONFLICT (email) DO NOTHING", [
		id,
		name,
		email
	])).rowCount !== 1) {
		const concurrent = await findUserByEmail(connection, email);
		if (!concurrent) throw new Error("Concurrent account creation failed.");
		return concurrent;
	}
	await writeAudit(connection, {
		eventType: "user.created",
		targetUserId: id,
		metadata: { source }
	});
	return {
		id,
		name,
		email
	};
}
//#endregion
//#region src/lib/server/billing/subscriptions.ts
/** The tiers that exist at the provider: recurring, self-serve. avenID is a
* one-off (the names flow owns it) and avenCOOP is not a product at all —
* that relationship is handled individually, outside this system. */
var SUBSCRIPTION_TIERS = ["avenme", "avenceo"];
function isSubscriptionTier(value) {
	return SUBSCRIPTION_TIERS.includes(value);
}
function subscriptionPlanSeeds() {
	return SUBSCRIPTION_TIERS.map((tier) => {
		const plan = PLANS.find((p) => p.id === tier);
		return {
			tier,
			name: plan.name,
			description: plan.role,
			priceCents: Math.round(plan.eurPrice * 100)
		};
	});
}
var SubscriptionService = class {
	pool;
	config;
	payments;
	products = null;
	constructor(pool, config, payments) {
		this.pool = pool;
		this.config = config;
		this.payments = payments;
	}
	/** The caller's provider customer id — from our table first, and for
	* members who paid before we stored customer ids (the one-off avenID), by
	* asking the provider for the SESSION's own email. Found ids are stored,
	* so the lookup happens once. */
	async customerId(user) {
		const known = (await this.pool.query("SELECT creem_customer_id FROM billing_customers WHERE user_id=$1", [user.id])).rows[0]?.creem_customer_id;
		if (known) return known;
		const found = await this.payments.findCustomerByEmail(user.email.toLowerCase());
		if (!found) return null;
		await this.pool.query(`INSERT INTO billing_customers (user_id, creem_customer_id) VALUES ($1,$2)
			 ON CONFLICT (user_id) DO UPDATE SET creem_customer_id=EXCLUDED.creem_customer_id`, [user.id, found]);
		return found;
	}
	/** Ensure the recurring products exist at the provider; cached per process. */
	ensureProducts() {
		this.products ??= this.payments.ensureSubscriptionProducts(subscriptionPlanSeeds());
		return this.products;
	}
	async productId(tier) {
		const id = (await this.ensureProducts())[tier];
		if (!id) throw new AppError(502, "BILLING_PRODUCT_MISSING", `No provider product exists for ${tier}.`);
		return id;
	}
	async mine(userId) {
		return (await this.pool.query("SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1", [userId])).rows[0] ?? null;
	}
	/** The caller's standing — the session is the only selector. */
	async me(userId) {
		const row = await this.mine(userId);
		if (!row) return null;
		return {
			tier: row.tier,
			status: row.status,
			priceEurCents: row.price_eur_cents,
			currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
			cancelAtPeriodEnd: row.cancel_at_period_end
		};
	}
	/** Start a checkout for a tier. With a live subscription the answer is
	* `change()`, not a second checkout. */
	async subscribe(user, tier) {
		if (!isSubscriptionTier(tier)) throw new AppError(400, "VALIDATION_ERROR", "Unknown subscription tier.");
		const existing = await this.mine(user.id);
		if (existing && !["canceled", "expired"].includes(existing.status)) throw new AppError(409, "SUBSCRIPTION_EXISTS", "You already have a subscription — change the plan instead.");
		const session = await this.payments.createSubscriptionCheckout({
			productId: await this.productId(tier),
			tier,
			userId: user.id,
			email: user.email,
			successUrl: new URL("/dashboard", this.config.PUBLIC_BASE_URL).toString()
		});
		await this.pool.query("INSERT INTO billing_checkouts (user_id, checkout_id) VALUES ($1,$2)", [user.id, session.checkoutId]);
		return { checkoutUrl: session.checkoutUrl };
	}
	/** Up- or downgrade to the other tier. Proration is charged immediately;
	* the row flips when the provider's event arrives. */
	async change(userId, tier) {
		if (!isSubscriptionTier(tier)) throw new AppError(400, "VALIDATION_ERROR", "Unknown subscription tier.");
		const row = await this.requireActive(userId);
		if (row.tier === tier) throw new AppError(409, "SUBSCRIPTION_UNCHANGED", "You are already on this plan.");
		await this.payments.changeSubscription(row.creem_subscription_id, await this.productId(tier));
	}
	async cancel(userId, immediate = false) {
		const row = await this.requireActive(userId);
		await this.payments.cancelSubscription(row.creem_subscription_id, immediate);
	}
	async resume(userId) {
		const row = await this.mine(userId);
		if (!row) throw new AppError(404, "SUBSCRIPTION_MISSING", "There is no subscription to resume.");
		await this.payments.resumeSubscription(row.creem_subscription_id);
	}
	/** The caller's invoice history, straight from the provider — including
	* one-off purchases like the avenID, since the customer is resolved by
	* the session's own email when our table does not know them yet. */
	async invoices(user) {
		const providerCustomerId = await this.customerId(user);
		if (!providerCustomerId) return [];
		return this.payments.listInvoices(providerCustomerId);
	}
	/** The caller's orders — the one-off avenID and every subscription
	* charge — resolved through the same session-only customer lookup. */
	async orders(user) {
		const providerCustomerId = await this.customerId(user);
		if (!providerCustomerId) return [];
		return this.payments.listOrders(providerCustomerId);
	}
	async pause(userId) {
		const row = await this.requireActive(userId);
		await this.payments.pauseSubscription(row.creem_subscription_id);
	}
	/** Where the session's LATEST checkout stands. The checkout id comes
	* from our own row, never from the client — the pane polls this while
	* the inline embed runs, so it does not depend on the iframe message. */
	async checkoutStatus(userId) {
		const checkoutId = (await this.pool.query("SELECT checkout_id FROM billing_checkouts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [userId])).rows[0]?.checkout_id;
		if (!checkoutId) return null;
		return { status: await this.payments.checkoutStatus(checkoutId) };
	}
	async requireActive(userId) {
		const row = await this.mine(userId);
		if (!row || ["canceled", "expired"].includes(row.status)) throw new AppError(404, "SUBSCRIPTION_MISSING", "There is no active subscription.");
		return row;
	}
	/** Apply one verified `subscription.*` webhook. Idempotent: keyed on the
	* provider's subscription id, replays converge on the same row. The buyer
	* is resolved from checkout metadata (userId) first, their email second —
	* the same trust chain the names grant uses. */
	async applyEvent(event) {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			let userId = event.userId;
			if (userId) {
				if (!(await client.query("SELECT id FROM \"user\" WHERE id=$1", [userId])).rows[0]) userId = null;
			}
			if (!userId && event.email) userId = (await ensureVerifiedUser(client, event.email.toLowerCase(), "subscription")).id;
			if (!userId) {
				await writeAudit(client, {
					eventType: "billing.subscription_unmatched",
					metadata: {
						eventId: event.id,
						subscriptionId: event.providerSubscriptionId
					}
				});
				await client.query("COMMIT");
				return { applied: false };
			}
			if (event.providerCustomerId) await client.query(`INSERT INTO billing_customers (user_id, creem_customer_id) VALUES ($1,$2)
					 ON CONFLICT (user_id) DO UPDATE SET creem_customer_id=EXCLUDED.creem_customer_id`, [userId, event.providerCustomerId]);
			await client.query(`INSERT INTO subscriptions
				   (id, user_id, creem_subscription_id, tier, status, current_period_end,
				    cancel_at_period_end, price_eur_cents)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				 ON CONFLICT (creem_subscription_id) DO UPDATE SET
				   status=EXCLUDED.status,
				   tier=COALESCE(NULLIF(EXCLUDED.tier,''), subscriptions.tier),
				   current_period_end=COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
				   cancel_at_period_end=EXCLUDED.cancel_at_period_end,
				   price_eur_cents=CASE WHEN EXCLUDED.price_eur_cents > 0
				     THEN EXCLUDED.price_eur_cents ELSE subscriptions.price_eur_cents END,
				   updated_at=now()`, [
				randomUUID(),
				userId,
				event.providerSubscriptionId,
				event.tier ?? "",
				event.status,
				event.currentPeriodEnd,
				event.cancelAtPeriodEnd,
				event.priceCents ?? 0
			]);
			await writeAudit(client, {
				eventType: "billing.subscription_applied",
				metadata: {
					eventId: event.id,
					type: event.type,
					subscriptionId: event.providerSubscriptionId,
					status: event.status,
					tier: event.tier
				}
			});
			await client.query("COMMIT");
			return { applied: true };
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}
};
//#endregion
//#region src/lib/server/config.ts
var bool = z.enum(["true", "false"]).transform((value) => value === "true");
var positiveInt = z.coerce.number().int().positive();
var postgresUrl = z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres URL");
var validEncryptionKey = (value) => {
	try {
		return Buffer.from(value, "base64").length === 32;
	} catch {
		return false;
	}
};
var serverConfigSchema = z.object({
	NODE_ENV: z.enum([
		"development",
		"test",
		"production"
	]).default("development"),
	PUBLIC_BASE_URL: z.url(),
	WEBAUTHN_RP_ID: z.string().min(1),
	REQUIRE_PASSKEY_PRF: bool.default(false),
	DOWNLOAD_URL: z.string().default(""),
	LOG_LEVEL: z.enum([
		"fatal",
		"error",
		"warn",
		"info",
		"debug",
		"trace"
	]).default("info"),
	APPLICATION_VERSION: z.string().min(1).default("0.1.0"),
	DATABASE_URL: postgresUrl,
	MIGRATOR_DATABASE_URL: postgresUrl.optional(),
	EMAIL_WORKER_DATABASE_URL: postgresUrl.optional(),
	ENVIRONMENT_WORKER_DATABASE_URL: postgresUrl.optional(),
	PROVISIONER_DATABASE_URL: postgresUrl.optional(),
	BETTER_AUTH_SECRET: z.string().default(""),
	BETTER_AUTH_SESSION_MAX_AGE_SECONDS: positiveInt.default(43200),
	BETTER_AUTH_SESSION_UPDATE_AGE_SECONDS: positiveInt.default(3600),
	POW_DIFFICULTY_BITS: z.coerce.number().int().min(8).max(28).default(16),
	POW_CHALLENGE_TTL_SECONDS: positiveInt.default(300),
	EMAIL_QUEUE_ENCRYPTION_KEY: z.string().default(""),
	EMAIL_MAX_ATTEMPTS: positiveInt.default(10),
	EMAIL_WORKER_STALE_SECONDS: positiveInt.default(45),
	SMTP_URL: z.string().default(""),
	SMTP_FROM: z.string().default(""),
	SMTP_REPLY_TO: z.string().optional().or(z.literal("")),
	EMAIL_WORKER_POLL_INTERVAL_MS: positiveInt.default(1e3),
	EMAIL_WORKER_BATCH_SIZE: positiveInt.default(10),
	EMAIL_WORKER_LEASE_SECONDS: positiveInt.default(120),
	EMAIL_WORKER_HEARTBEAT_SECONDS: positiveInt.default(10),
	EMAIL_RETRY_BASE_SECONDS: positiveInt.default(30),
	EMAIL_RETRY_MAX_SECONDS: positiveInt.default(21600),
	ENVIRONMENT_WORKER_POLL_INTERVAL_MS: positiveInt.default(1e3),
	ENVIRONMENT_WORKER_LEASE_SECONDS: positiveInt.default(300),
	ENVIRONMENT_WORKER_HEARTBEAT_SECONDS: positiveInt.default(10),
	ENVIRONMENT_WORKER_STALE_SECONDS: positiveInt.default(45),
	ENVIRONMENT_MAX_ATTEMPTS: positiveInt.default(10),
	ENVIRONMENT_RETRY_BASE_SECONDS: positiveInt.default(30),
	ENVIRONMENT_RETRY_MAX_SECONDS: positiveInt.default(21600),
	ALLOW_FAKE_PAYMENTS: bool.default(false),
	NAME_PRICE_EUR: z.coerce.number().positive().default(25),
	NAME_HOLD_TTL_HOURS: positiveInt.default(24),
	NAME_RESERVATION_TTL_MINUTES: positiveInt.default(5),
	CREEM_API_KEY: z.string().default(""),
	CREEM_API_BASE: z.string().default(""),
	CREEM_PRODUCT_ID: z.string().default(""),
	CREEM_PRODUCT_AVENME: z.string().default(""),
	CREEM_PRODUCT_AVENCEO: z.string().default(""),
	CREEM_WEBHOOK_SECRET: z.string().min(8).default("dev-fake-webhook-secret")
}).superRefine((config, context) => {
	const publicUrl = new URL(config.PUBLIC_BASE_URL);
	if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) context.addIssue({
		code: "custom",
		path: ["PUBLIC_BASE_URL"],
		message: "must be an origin"
	});
	if (config.WEBAUTHN_RP_ID !== publicUrl.hostname) context.addIssue({
		code: "custom",
		path: ["WEBAUTHN_RP_ID"],
		message: "must equal the public hostname"
	});
	if (config.NODE_ENV === "production") {
		if (publicUrl.protocol !== "https:") context.addIssue({
			code: "custom",
			path: ["PUBLIC_BASE_URL"],
			message: "must use HTTPS"
		});
	}
});
function loadServerConfig(env = process.env) {
	return serverConfigSchema.parse(env);
}
function loadApiConfig(env = process.env) {
	const config = loadServerConfig(env);
	if (config.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET is required.");
	if (!validEncryptionKey(config.EMAIL_QUEUE_ENCRYPTION_KEY)) throw new Error("EMAIL_QUEUE_ENCRYPTION_KEY must decode to 32 bytes.");
	if (!config.DOWNLOAD_URL && config.NODE_ENV === "production") throw new Error("DOWNLOAD_URL is required.");
	if (config.NODE_ENV === "production" && Buffer.from(config.EMAIL_QUEUE_ENCRYPTION_KEY, "base64").every((byte) => byte === 0)) throw new Error("EMAIL_QUEUE_ENCRYPTION_KEY must not be the all-zero key.");
	if (config.NODE_ENV === "production" && !config.CREEM_API_KEY && !config.ALLOW_FAKE_PAYMENTS) throw new Error("CREEM_API_KEY is required.");
	if (config.CREEM_API_KEY && !config.CREEM_PRODUCT_ID) throw new Error("CREEM_PRODUCT_ID is required.");
	if (config.CREEM_API_KEY && config.CREEM_WEBHOOK_SECRET === "dev-fake-webhook-secret") throw new Error("CREEM_WEBHOOK_SECRET is required.");
	return config;
}
//#endregion
//#region src/lib/server/crypto.ts
function sha256Hex(value) {
	return createHash("sha256").update(value).digest("hex");
}
function randomToken(bytes = 32) {
	return randomBytes(bytes).toString("base64url");
}
var BEARER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
function isBearerToken(value) {
	return BEARER_TOKEN_PATTERN.test(value.trim());
}
function decodeEncryptionKey(value) {
	const key = Buffer.from(value, "base64");
	if (key.length !== 32) throw new Error("encryption key must decode to exactly 32 bytes");
	return key;
}
function encryptPayload(value, key) {
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, nonce);
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
	const envelope = {
		version: 1,
		nonce: nonce.toString("base64"),
		ciphertext: ciphertext.toString("base64"),
		authenticationTag: cipher.getAuthTag().toString("base64")
	};
	return JSON.stringify(envelope);
}
//#endregion
//#region src/lib/server/db.ts
pg.types.setTypeParser(20, Number);
function openDatabase(connectionString, options = {}) {
	const pool = new pg.Pool({
		connectionString,
		max: options.max ?? 5
	});
	pool.on("error", (error) => options.onError?.(error));
	return {
		pool,
		db: drizzle(pool, { schema })
	};
}
async function withTransaction(pool, fn) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await fn(client);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}
//#endregion
//#region src/lib/server/environments/naming.ts
var NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
function environmentNames(name) {
	const normalized = name.toLowerCase();
	if (!NAME_PATTERN.test(normalized)) throw new Error(`Invalid customer name: ${JSON.stringify(name)}`);
	const identifier = normalized.replaceAll("-", "_");
	return {
		name: normalized,
		databaseName: `cust_${identifier}`,
		ownerRole: `cust_${identifier}_owner`,
		stackName: `customer-${normalized}`
	};
}
//#endregion
//#region src/lib/server/environments/service.ts
var EnvironmentService = class {
	pool;
	constructor(pool) {
		this.pool = pool;
	}
	async enqueueProvision(connection, input) {
		const names = environmentNames(input.name);
		const existing = (await connection.query("SELECT id,owner_user_id FROM customer_environments WHERE name=$1 FOR UPDATE", [names.name])).rows[0];
		if (existing && existing.owner_user_id !== input.userId) throw new Error("Customer environment owner conflict.");
		const environmentId = existing?.id ?? randomUUID();
		const now = /* @__PURE__ */ new Date();
		if (!existing) {
			const effectiveConfig = {
				contractVersion: 1,
				name: names.name,
				databaseName: names.databaseName,
				stackName: names.stackName,
				applications: []
			};
			await connection.query(`INSERT INTO customer_environments
          (id,owner_user_id,name,database_name,owner_role,stack_name,contract_version,effective_config,status,last_operation,queued_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,1,$7,'queued','provision',$8,$8)`, [
				environmentId,
				input.userId,
				names.name,
				names.databaseName,
				names.ownerRole,
				names.stackName,
				JSON.stringify(effectiveConfig),
				now
			]);
		}
		await this.enqueueJob(connection, environmentId, "provision", now);
		await writeAudit(connection, {
			eventType: "environment.provision_queued",
			targetUserId: input.userId,
			metadata: {
				environmentId,
				name: names.name
			}
		});
		return environmentId;
	}
	async enqueueSuspension(connection, input) {
		const row = (await connection.query("SELECT id FROM customer_environments WHERE name=$1 AND owner_user_id=$2 FOR UPDATE", [environmentNames(input.name).name, input.userId])).rows[0];
		if (!row) return;
		const now = /* @__PURE__ */ new Date();
		await connection.query("UPDATE customer_environments SET status='queued',last_operation='suspend',queued_at=$1,updated_at=$1 WHERE id=$2", [now, row.id]);
		if ((await connection.query("UPDATE customer_environment_jobs SET operation='suspend',available_at=$1 WHERE environment_id=$2 AND status='queued'", [now, row.id])).rowCount === 0) await this.enqueueJob(connection, row.id, "suspend", now);
		await writeAudit(connection, {
			eventType: "environment.suspend_queued",
			targetUserId: input.userId,
			metadata: {
				environmentId: row.id,
				name: input.name
			}
		});
	}
	async enqueueJob(connection, environmentId, operation, now) {
		await connection.query(`INSERT INTO customer_environment_jobs (id,environment_id,operation,status,attempt,available_at,created_at)
       VALUES ($1,$2,$3,'queued',0,$4,$4) ON CONFLICT DO NOTHING`, [
			randomUUID(),
			environmentId,
			operation,
			now
		]);
	}
	async status(name) {
		const row = (await this.pool.query(`SELECT id,name,database_name,owner_role,stack_name,contract_version,status,last_operation,
              last_error_code,last_error_message,queued_at,provisioning_at,ready_at,suspended_at,failed_at,updated_at
       FROM customer_environments WHERE name=$1`, [environmentNames(name).name])).rows[0];
		if (!row) throw new AppError(404, "ENVIRONMENT_NOT_FOUND", "Environment not found.");
		return row;
	}
	async retry(name) {
		await withTransaction(this.pool, async (client) => {
			const row = (await client.query("SELECT id,status,last_operation FROM customer_environments WHERE name=$1 FOR UPDATE", [environmentNames(name).name])).rows[0];
			if (!row) throw new AppError(404, "ENVIRONMENT_NOT_FOUND", "Environment not found.");
			if (row.status !== "failed") throw new AppError(409, "ENVIRONMENT_STATE_CONFLICT", "Only a failed environment can be retried.");
			const operation = row.last_operation ?? "provision";
			const now = /* @__PURE__ */ new Date();
			await client.query("UPDATE customer_environments SET status='queued',queued_at=$1,updated_at=$1,last_error_code=NULL,last_error_message=NULL WHERE id=$2", [now, row.id]);
			await this.enqueueJob(client, row.id, operation, now);
			await writeAudit(client, {
				eventType: "environment.retried",
				metadata: {
					environmentId: row.id,
					name,
					operation
				}
			});
		});
	}
	async reconcile() {
		return (await this.pool.query(`UPDATE customer_environment_jobs SET status='queued',lease_owner=NULL,lease_expires_at=NULL,available_at=now()
       WHERE status='running' AND lease_expires_at < now()`)).rowCount ?? 0;
	}
};
//#endregion
//#region src/lib/validation.ts
var emailAddress = z.email({ pattern: z.regexes.unicodeEmail }).refine((value) => (value.split("@").pop() ?? "").includes("."), { message: "Enter a full email address." }).transform((value) => value.trim().toLowerCase().normalize("NFC"));
var namePattern = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
var reservedNames = /* @__PURE__ */ new Set([
	"admin",
	"administrator",
	"api",
	"app",
	"aven",
	"billing",
	"dashboard",
	"help",
	"id",
	"login",
	"logout",
	"mail",
	"name",
	"names",
	"official",
	"pay",
	"payment",
	"root",
	"security",
	"signup",
	"smtp",
	"staff",
	"status",
	"support",
	"system",
	"tasks",
	"test",
	"webmail",
	"www"
]);
function normalizeName(value) {
	return value.trim().toLowerCase();
}
function validateName(value) {
	if (!namePattern.test(value)) return "NAME_INVALID";
	return reservedNames.has(value) ? "NAME_RESERVED" : null;
}
var secureNameSchema = z.object({
	name: z.string().trim().toLowerCase().min(3).max(32),
	email: emailAddress,
	tier: z.enum([
		"avenid",
		"avenme",
		"avenceo",
		"avencoop"
	]).optional(),
	salutation: z.string().trim().max(120).optional(),
	idea: z.string().trim().max(2e3).optional()
});
//#endregion
//#region src/lib/server/names/service.ts
var NameService = class {
	pool;
	config;
	notifier;
	payments;
	issueSetupLink;
	onGranted;
	onRevoked;
	constructor(pool, config, notifier, payments, issueSetupLink, onGranted, onRevoked) {
		this.pool = pool;
		this.config = config;
		this.notifier = notifier;
		this.payments = payments;
		this.issueSetupLink = issueSetupLink;
		this.onGranted = onGranted;
		this.onRevoked = onRevoked;
	}
	baseAvailability(name) {
		return {
			name,
			available: true,
			priceEur: this.config.NAME_PRICE_EUR,
			reservationMinutes: this.config.NAME_RESERVATION_TTL_MINUTES
		};
	}
	async availability(raw) {
		const name = normalizeName(raw);
		const result = this.baseAvailability(name);
		const invalid = validateName(name);
		if (invalid) return {
			...result,
			available: false,
			reason: invalid
		};
		await this.pool.query("DELETE FROM name_holds WHERE name=$1 AND expires_at < now()", [name]);
		const owned = (await this.pool.query("SELECT status FROM names WHERE name=$1", [name])).rows[0];
		if (owned) return {
			...result,
			available: false,
			reason: owned.status === "owned" ? "NAME_TAKEN" : "NAME_LOCKED"
		};
		if ((await this.pool.query("SELECT 1 FROM name_holds WHERE name=$1 AND reserved_until >= now()", [name])).rows[0]) return {
			...result,
			available: false,
			reason: "NAME_HELD"
		};
		return result;
	}
	claimUrl(token) {
		const url = new URL("/purchase/checkout", this.config.PUBLIC_BASE_URL);
		url.searchParams.set("token", token);
		return url.toString();
	}
	mintSuccessUrl(name) {
		const token = randomToken(32);
		const url = new URL("/purchase/success", this.config.PUBLIC_BASE_URL);
		url.searchParams.set("name", name);
		url.searchParams.set("pt", token);
		return {
			token,
			hash: sha256Hex(token),
			url: url.toString()
		};
	}
	async lockName(client, name) {
		await client.query("SELECT pg_advisory_xact_lock(hashtext('name:' || $1))", [name]);
	}
	async emailOwnsName(connection, email) {
		const user = await findUserByEmail(connection, email);
		if (!user) return false;
		return Boolean((await connection.query("SELECT 1 FROM names WHERE owner_user_id=$1 AND status='owned' LIMIT 1", [user.id])).rows[0]);
	}
	async secure(raw, email, origin = {}) {
		const name = normalizeName(raw);
		const check = await this.availability(name);
		if (!check.available && check.reason !== "NAME_HELD") throw new AppError(409, check.reason ?? "NAME_UNAVAILABLE", "That name is not available.");
		if (await this.emailOwnsName(this.pool, email)) throw new AppError(409, "NAME_LIMIT_REACHED", "This email already owns a name.");
		const token = randomToken(32);
		const result = {
			name,
			expiresAt: "",
			priceEur: this.config.NAME_PRICE_EUR,
			reservationMinutes: this.config.NAME_RESERVATION_TTL_MINUTES
		};
		return withTransaction(this.pool, async (client) => {
			await this.lockName(client, name);
			let expiresAt = (await client.query(`UPDATE name_holds SET claim_token_hash=$1,
					   tier = COALESCE(NULLIF($4, ''), tier),
					   salutation = COALESCE(NULLIF($5, ''), salutation),
					   idea = COALESCE(NULLIF($6, ''), idea)
					 WHERE name=$2 AND lower(email)=lower($3) AND expires_at >= now() RETURNING expires_at`, [
				sha256Hex(token),
				name,
				email,
				origin.tier ?? "",
				origin.salutation ?? "",
				origin.idea ?? ""
			])).rows[0]?.expires_at;
			if (!expiresAt) {
				expiresAt = new Date(Date.now() + this.config.NAME_HOLD_TTL_HOURS * 36e5);
				const holdId = randomUUID();
				await client.query(`INSERT INTO name_holds (id,name,email,claim_token_hash,created_at,expires_at,tier,salutation,idea)
					 VALUES ($1,$2,$3,$4,now(),$5,$6,$7,$8)`, [
					holdId,
					name,
					email,
					sha256Hex(token),
					expiresAt,
					origin.tier ?? "",
					origin.salutation ?? "",
					origin.idea ?? ""
				]);
				await writeAudit(client, {
					eventType: "name.requested",
					metadata: {
						name,
						holdId,
						tier: origin.tier ?? ""
					}
				});
			}
			await this.notifier.namePurchaseLink(client, {
				email,
				name,
				claimUrl: this.claimUrl(token),
				expiresAt: expiresAt.toISOString()
			});
			return {
				...result,
				expiresAt: expiresAt.toISOString()
			};
		});
	}
	async claim(token) {
		if (!isBearerToken(token)) throw new AppError(400, "CLAIM_TOKEN_INVALID", "The claim link is malformed.");
		const hold = (await this.pool.query("SELECT id,name,email,checkout_id,checkout_url,email_confirmed_at,reserved_until,expires_at,success_token_hash FROM name_holds WHERE claim_token_hash=$1 AND expires_at >= now()", [sha256Hex(token)])).rows[0];
		if (!hold) throw new AppError(410, "CLAIM_LINK_EXPIRED", "This claim link is no longer valid.");
		let checkout = hold.checkout_id && hold.checkout_url ? {
			checkoutId: hold.checkout_id,
			checkoutUrl: hold.checkout_url
		} : null;
		let successHash = "";
		if (!checkout) {
			const success = this.mintSuccessUrl(hold.name);
			successHash = success.hash;
			checkout = await this.payments.createCheckout({
				name: hold.name,
				email: hold.email,
				holdId: hold.id,
				successUrl: success.url
			});
		}
		return withTransaction(this.pool, async (client) => {
			await this.lockName(client, hold.name);
			if ((await client.query("SELECT 1 FROM names WHERE name=$1", [hold.name])).rows[0]) throw new AppError(410, "NAME_UNAVAILABLE", "This name has been purchased in the meantime.");
			if (await this.emailOwnsName(client, hold.email)) throw new AppError(410, "NAME_LIMIT_REACHED", "This email already owns a name.");
			if ((await client.query("SELECT 1 FROM name_holds WHERE name=$1 AND id<>$2 AND reserved_until >= now()", [hold.name, hold.id])).rows[0]) throw new AppError(410, "NAME_HELD", "Someone else is completing a purchase for this name right now.");
			const updated = (await client.query(`UPDATE name_holds SET checkout_id=COALESCE(checkout_id,$1), checkout_url=COALESCE(checkout_url,$2),
           success_token_hash=COALESCE(NULLIF(success_token_hash,''), NULLIF($4,''), ''),
           email_confirmed_at=COALESCE(email_confirmed_at, now()),
           reserved_until=now() + make_interval(mins => $5)
         WHERE id=$3 AND expires_at >= now() RETURNING checkout_url`, [
				checkout.checkoutId,
				checkout.checkoutUrl,
				hold.id,
				successHash,
				this.config.NAME_RESERVATION_TTL_MINUTES
			])).rows[0];
			if (!updated) throw new AppError(410, "CLAIM_LINK_EXPIRED", "This claim link is no longer valid.");
			if (!hold.email_confirmed_at) await writeAudit(client, {
				eventType: "name.email_confirmed",
				metadata: {
					name: hold.name,
					holdId: hold.id
				}
			});
			await writeAudit(client, {
				eventType: "name.reserved",
				metadata: {
					name: hold.name,
					holdId: hold.id,
					minutes: this.config.NAME_RESERVATION_TTL_MINUTES
				}
			});
			return {
				name: hold.name,
				checkoutUrl: updated.checkout_url
			};
		});
	}
	async grantFromEvent(event) {
		const name = normalizeName(String(event.metadata.name ?? ""));
		if (!name) throw new AppError(400, "WEBHOOK_PAYLOAD_INVALID", "The payment event carries no name metadata.");
		if (!event.id) throw new AppError(400, "WEBHOOK_PAYLOAD_INVALID", "The payment event carries no id.");
		return withTransaction(this.pool, async (client) => {
			if ((await client.query(`INSERT INTO payment_events(id,event_type,checkout_id,payload,processed_at)
         VALUES($1,$2,$3,$4,now()) ON CONFLICT(id) DO NOTHING RETURNING id`, [
				event.id,
				event.type,
				event.checkoutId,
				JSON.stringify({
					orderId: event.orderId,
					name
				})
			])).rowCount !== 1) return { granted: false };
			await this.lockName(client, name);
			const existing = (await client.query("SELECT status, checkout_id FROM names WHERE name=$1", [name])).rows[0];
			const hold = (await client.query("SELECT * FROM name_holds WHERE id=$1 OR name=$2 ORDER BY (id=$1) DESC LIMIT 1", [String(event.metadata.holdId ?? ""), name])).rows[0];
			if (existing) {
				if (existing.checkout_id !== event.checkoutId) await writeAudit(client, {
					eventType: "name.purchase_conflict",
					metadata: {
						name,
						eventId: event.id,
						checkoutId: event.checkoutId,
						email: event.email ?? hold?.email ?? null
					}
				});
				return { granted: false };
			}
			const email = (event.email ?? hold?.email ?? "").toLowerCase();
			if (!email) throw new AppError(400, "WEBHOOK_PAYLOAD_INVALID", "The payment event carries no customer email.");
			const user = await ensureVerifiedUser(client, email, "name-purchase");
			await client.query("INSERT INTO names (name,owner_user_id,status,checkout_id,order_id,price_paid_eur,purchased_at,created_at,updated_at) VALUES ($1,$2,'owned',$3,$4,$5,now(),now(),now())", [
				name,
				user.id,
				event.checkoutId,
				event.orderId,
				event.amountEur
			]);
			if (hold?.success_token_hash) await client.query("INSERT INTO purchase_sessions (token_hash, user_id, created_at, expires_at) VALUES ($1,$2,now(),now() + interval '1 hour') ON CONFLICT (token_hash) DO NOTHING", [hold.success_token_hash, user.id]);
			await client.query("DELETE FROM name_holds WHERE name=$1", [name]);
			await writeAudit(client, {
				eventType: "name.purchased",
				targetUserId: user.id,
				metadata: {
					name,
					eventId: event.id,
					checkoutId: event.checkoutId
				}
			});
			if (this.onGranted) await this.onGranted(client, {
				userId: user.id,
				name
			});
			const setupToken = await this.issueSetupLink(client, user.id);
			const accessUrl = setupToken ? (() => {
				const url = new URL("/api/auth/sign-in/setup-token", this.config.PUBLIC_BASE_URL);
				url.searchParams.set("token", setupToken);
				return url.toString();
			})() : void 0;
			await this.notifier.namePurchased(client, {
				name,
				ownerEmail: email,
				accessUrl
			});
			return { granted: true };
		});
	}
	async revokeFromEvent(event) {
		const metadataName = normalizeName(String(event.metadata.name ?? ""));
		if (!event.id) throw new AppError(400, "WEBHOOK_PAYLOAD_INVALID", "The payment event carries no id.");
		return withTransaction(this.pool, async (client) => {
			if ((await client.query(`INSERT INTO payment_events(id,event_type,checkout_id,payload,processed_at)
         VALUES($1,$2,$3,$4,now()) ON CONFLICT(id) DO NOTHING RETURNING id`, [
				event.id,
				event.type,
				event.checkoutId,
				JSON.stringify({
					orderId: event.orderId,
					name: metadataName || null
				})
			])).rowCount !== 1) return { revoked: false };
			const row = (await client.query("SELECT name, owner_user_id FROM names WHERE status='owned' AND (name=$1 OR ($2::text IS NOT NULL AND checkout_id=$2) OR ($3::text IS NOT NULL AND order_id=$3)) FOR UPDATE", [
				metadataName || null,
				event.checkoutId,
				event.orderId
			])).rows[0];
			if (!row) return { revoked: false };
			await client.query("UPDATE names SET status='revoked', revoked_at=now(), revoke_reason=$1, updated_at=now() WHERE name=$2", [event.type, row.name]);
			await writeAudit(client, {
				eventType: "name.revoked",
				targetUserId: row.owner_user_id,
				metadata: {
					name: row.name,
					eventId: event.id,
					reason: event.type
				}
			});
			if (this.onRevoked) await this.onRevoked(client, {
				userId: row.owner_user_id,
				name: row.name
			});
			return { revoked: true };
		});
	}
	async verifyPurchaseSession(token) {
		if (!isBearerToken(token)) return null;
		await this.pool.query("DELETE FROM purchase_sessions WHERE expires_at < now()");
		const row = (await this.pool.query("DELETE FROM purchase_sessions WHERE token_hash=$1 AND expires_at >= now() RETURNING user_id", [sha256Hex(token.trim())])).rows[0];
		if (!row || !await isActiveUser(this.pool, row.user_id)) return null;
		await writeAudit(this.pool, {
			eventType: "name.purchase_session_redeemed",
			targetUserId: row.user_id
		});
		return { userId: row.user_id };
	}
	async listForUser(userId) {
		return (await this.pool.query("SELECT name,status,purchased_at FROM names WHERE owner_user_id=$1 AND status='owned' ORDER BY purchased_at DESC", [userId])).rows;
	}
	async ownsAny(userId) {
		return Boolean((await this.pool.query("SELECT 1 FROM names WHERE owner_user_id=$1 AND status='owned' LIMIT 1", [userId])).rows[0]);
	}
};
//#endregion
//#region src/lib/server/email/queue.ts
async function enqueueSystemEmail(settings, connection, input) {
	const id = randomUUID();
	const now = /* @__PURE__ */ new Date();
	await connection.query(`INSERT INTO email_queue (id, template_key, to_address, payload_encrypted, status, priority, attempts, max_attempts, available_at, idempotency_key, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'queued',$5,0,$6,$7,$8,$9,$9) ON CONFLICT (idempotency_key) DO NOTHING`, [
		id,
		input.template,
		input.to,
		encryptPayload(input.data, settings.key),
		input.priority ?? 0,
		settings.maxAttempts,
		input.availableAt ?? now,
		input.idempotencyKey ?? null,
		now
	]);
	return id;
}
//#endregion
//#region src/lib/server/notifications.ts
function createNotifier(_config, settings) {
	return {
		async namePurchaseLink(connection, input) {
			await enqueueSystemEmail(settings, connection, {
				template: "name.purchase-link",
				to: input.email,
				data: {
					name: input.name,
					claimUrl: input.claimUrl,
					expiresAt: new Date(input.expiresAt).toUTCString()
				},
				priority: 10
			});
		},
		async namePurchased(connection, input) {
			await enqueueSystemEmail(settings, connection, {
				template: "name.purchased",
				to: input.ownerEmail,
				data: {
					name: input.name,
					accessUrl: input.accessUrl ?? ""
				},
				idempotencyKey: `name-purchased:${input.name}`
			});
		}
	};
}
//#endregion
//#region src/lib/server/passkeys.ts
var PasskeyService = class {
	pool;
	requirePrf;
	constructor(pool, requirePrf) {
		this.pool = pool;
		this.requirePrf = requirePrf;
	}
	async enrollmentComplete(connection, userId) {
		const predicate = this.requirePrf ? "AND prf_enabled=true" : "";
		return Boolean((await connection.query(`SELECT 1 FROM passkey WHERE user_id=$1 ${predicate} LIMIT 1`, [userId])).rows[0]);
	}
	async status(userId) {
		return { passkeys: (await this.pool.query("SELECT id,name,device_type,backed_up,prf_enabled,created_at FROM passkey WHERE user_id=$1 ORDER BY created_at ASC", [userId])).rows };
	}
	async issueSetupLink(connection, userId) {
		if (await this.enrollmentComplete(connection, userId)) return null;
		const token = randomToken(32);
		await connection.query("INSERT INTO setup_links (user_id,token_hash,created_at) VALUES ($1,$2,now()) ON CONFLICT (user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=EXCLUDED.created_at,last_used_at=NULL", [userId, sha256Hex(token)]);
		await writeAudit(connection, {
			eventType: "passkey.setup_link_issued",
			targetUserId: userId
		});
		return token;
	}
	async verifySetupLogin(token) {
		if (!isBearerToken(token)) return null;
		return withTransaction(this.pool, async (client) => {
			const row = (await client.query("SELECT user_id FROM setup_links WHERE token_hash=$1 FOR UPDATE", [sha256Hex(token.trim())])).rows[0];
			if (!row || !await isActiveUser(client, row.user_id)) return null;
			if (await this.enrollmentComplete(client, row.user_id)) {
				await client.query("DELETE FROM setup_links WHERE user_id=$1", [row.user_id]);
				return null;
			}
			await client.query("UPDATE setup_links SET last_used_at=now() WHERE user_id=$1", [row.user_id]);
			await writeAudit(client, {
				eventType: "passkey.setup_link_used",
				targetUserId: row.user_id
			});
			return { userId: row.user_id };
		});
	}
	async finishEnrollment(userId, prfEnabled, credentialId) {
		await withTransaction(this.pool, async (client) => {
			const passkey = credentialId ? (await client.query("SELECT id FROM passkey WHERE user_id=$1 AND credential_id=$2", [userId, credentialId])).rows[0] : (await client.query("SELECT id FROM passkey WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [userId])).rows[0];
			if (!passkey) throw new Error("Registered passkey not found.");
			await client.query("UPDATE passkey SET prf_enabled=$1 WHERE id=$2", [prfEnabled, passkey.id]);
			await client.query("DELETE FROM setup_links WHERE user_id=$1", [userId]);
			await writeAudit(client, {
				eventType: "passkey.enrolled",
				targetUserId: userId
			});
		});
	}
};
//#endregion
//#region src/lib/server/proof-of-work.ts
var proofOfWorkPurposes = /* @__PURE__ */ new Set(["sign-in", "secure-name"]);
var protectedAuthPaths = /* @__PURE__ */ new Map([["/api/auth/passkey/verify-authentication", "sign-in"]]);
var ProofOfWorkError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
function hasLeadingZeroBits(digest, bits) {
	const completeBytes = Math.floor(bits / 8);
	for (let index = 0; index < completeBytes; index += 1) if (digest[index] !== 0) return false;
	const remainingBits = bits % 8;
	return remainingBits === 0 || ((digest[completeBytes] ?? 255) & 255 << 8 - remainingBits) === 0;
}
function proofDigest(id, nonce, purpose, counter) {
	return createHash("sha256").update(`${id}:${nonce}:${purpose}:${counter}`, "utf8").digest();
}
var ProofOfWorkService = class {
	pool;
	difficultyBits;
	ttlSeconds;
	constructor(pool, difficultyBits, ttlSeconds) {
		this.pool = pool;
		this.difficultyBits = difficultyBits;
		this.ttlSeconds = ttlSeconds;
	}
	async issue(purpose, now = Date.now()) {
		await this.pool.query("DELETE FROM proof_of_work_challenges WHERE expires_at < $1 OR (used_at IS NOT NULL AND used_at < $2)", [now, now - this.ttlSeconds * 1e3]);
		const challenge = {
			id: randomUUID(),
			nonce: randomBytes(32).toString("base64url"),
			purpose,
			difficultyBits: this.difficultyBits,
			expiresAt: now + this.ttlSeconds * 1e3
		};
		await this.pool.query("INSERT INTO proof_of_work_challenges(id,nonce,purpose,difficulty_bits,expires_at,used_at,created_at) VALUES($1,$2,$3,$4,$5,NULL,$6)", [
			challenge.id,
			challenge.nonce,
			challenge.purpose,
			challenge.difficultyBits,
			challenge.expiresAt,
			now
		]);
		return challenge;
	}
	async verifyAndConsume(purpose, proof, now = Date.now()) {
		if (!proof) throw new ProofOfWorkError("PROOF_OF_WORK_REQUIRED", "Complete the local proof-of-work challenge and retry.");
		const separator = proof.lastIndexOf(".");
		const id = separator > 0 ? proof.slice(0, separator) : "";
		const counterText = separator > 0 ? proof.slice(separator + 1) : "";
		if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d{1,16}$/.test(counterText)) throw new ProofOfWorkError("PROOF_OF_WORK_INVALID", "The proof-of-work response is malformed.");
		const counter = Number(counterText);
		if (!Number.isSafeInteger(counter) || counter < 0) throw new ProofOfWorkError("PROOF_OF_WORK_INVALID", "The proof-of-work counter is invalid.");
		await withTransaction(this.pool, async (client) => {
			const row = (await client.query("SELECT id,nonce,purpose,difficulty_bits,expires_at,used_at FROM proof_of_work_challenges WHERE id=$1 FOR UPDATE", [id])).rows[0];
			if (!row || row.purpose !== purpose) throw new ProofOfWorkError("PROOF_OF_WORK_INVALID", "The proof-of-work challenge is invalid for this operation.");
			if (row.used_at !== null) throw new ProofOfWorkError("PROOF_OF_WORK_USED", "The proof-of-work challenge has already been used. Retry to create a new challenge.");
			if (row.expires_at < now) throw new ProofOfWorkError("PROOF_OF_WORK_EXPIRED", "The proof-of-work challenge expired. Retry to create a new challenge.");
			if (!hasLeadingZeroBits(proofDigest(row.id, row.nonce, purpose, counter), row.difficulty_bits)) throw new ProofOfWorkError("PROOF_OF_WORK_INVALID", "The proof-of-work response does not satisfy the challenge.");
			if ((await client.query("UPDATE proof_of_work_challenges SET used_at=$1 WHERE id=$2 AND used_at IS NULL", [now, id])).rowCount !== 1) throw new ProofOfWorkError("PROOF_OF_WORK_USED", "The proof-of-work challenge has already been used. Retry to create a new challenge.");
		});
	}
};
//#endregion
//#region src/lib/server/runtime.ts
var KEY = Symbol.for("aven.api.runtime");
async function create() {
	const config = loadApiConfig();
	const logger = pino({
		level: config.LOG_LEVEL,
		redact: {
			paths: [
				"password",
				"token",
				"secret",
				"authorization",
				"cookie"
			],
			censor: "[REDACTED]"
		}
	});
	const database = openDatabase(config.DATABASE_URL, { onError: (error) => logger.warn({ err: error.message }, "database connection error") });
	const queueSettings = {
		key: decodeEncryptionKey(config.EMAIL_QUEUE_ENCRYPTION_KEY),
		maxAttempts: config.EMAIL_MAX_ATTEMPTS
	};
	const notifier = createNotifier(config, queueSettings);
	const proofOfWork = new ProofOfWorkService(database.pool, config.POW_DIFFICULTY_BITS, config.POW_CHALLENGE_TTL_SECONDS);
	const payments = createPaymentProvider(config);
	const subscriptions = new SubscriptionService(database.pool, config, payments);
	const passkeys = new PasskeyService(database.pool, config.REQUIRE_PASSKEY_PRF);
	const environments = new EnvironmentService(database.pool);
	const names = new NameService(database.pool, config, notifier, payments, (connection, userId) => passkeys.issueSetupLink(connection, userId), async (connection, input) => {
		await environments.enqueueProvision(connection, input);
	}, (connection, input) => environments.enqueueSuspension(connection, input));
	const auth = createAuth(config, database, {
		verifySetupLogin: (token) => passkeys.verifySetupLogin(token),
		verifyPurchaseLogin: (token) => names.verifyPurchaseSession(token)
	});
	if (payments.kind === "fake") logger.warn("fake payments enabled");
	return {
		config,
		logger,
		database,
		queueSettings,
		notifier,
		auth,
		proofOfWork,
		payments,
		names,
		subscriptions,
		passkeys,
		environments,
		async shutdown() {
			await database.pool.end();
		}
	};
}
function runtime() {
	const holder = globalThis;
	if (!holder[KEY]) holder[KEY] = create();
	return holder[KEY];
}
//#endregion
export { emailAddress as a, FakePaymentProvider as c, AppError as d, protectedAuthPaths as i, parseCreemSubscriptionEvent as l, ProofOfWorkError as n, secureNameSchema as o, proofOfWorkPurposes as r, writeAudit as s, runtime as t, signWebhookPayload as u };
