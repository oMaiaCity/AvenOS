import "./exports.js";
import { C as derived } from "./server2.js";
import { a as isSafeUrlScheme, i as defu, n as createFetch, s as getBaseURL } from "./dist.js";
import { n as toKebabCase, t as capitalizeFirstLetter } from "./string.js";
import { passkeyClient } from "@better-auth/passkey/client";
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/parser.mjs
var PROTO_POLLUTION_PATTERNS = {
	proto: /"(?:_|\\u0{2}5[Ff]){2}(?:p|\\u0{2}70)(?:r|\\u0{2}72)(?:o|\\u0{2}6[Ff])(?:t|\\u0{2}74)(?:o|\\u0{2}6[Ff])(?:_|\\u0{2}5[Ff]){2}"\s*:/,
	constructor: /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/,
	protoShort: /"__proto__"\s*:/,
	constructorShort: /"constructor"\s*:/
};
var JSON_SIGNATURE = /^\s*["[{]|^\s*-?\d{1,16}(\.\d{1,17})?([Ee][+-]?\d+)?\s*$/;
var SPECIAL_VALUES = {
	true: true,
	false: false,
	null: null,
	undefined: void 0,
	nan: NaN,
	infinity: Number.POSITIVE_INFINITY,
	"-infinity": Number.NEGATIVE_INFINITY
};
var ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
function isValidDate(date) {
	return date instanceof Date && !isNaN(date.getTime());
}
function parseISODate(value) {
	const match = ISO_DATE_REGEX.exec(value);
	if (!match) return null;
	const [, year, month, day, hour, minute, second, ms, offsetSign, offsetHour, offsetMinute] = match;
	const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10), ms ? parseInt(ms.padEnd(3, "0"), 10) : 0));
	if (offsetSign) {
		const offset = (parseInt(offsetHour, 10) * 60 + parseInt(offsetMinute, 10)) * (offsetSign === "+" ? -1 : 1);
		date.setUTCMinutes(date.getUTCMinutes() + offset);
	}
	return isValidDate(date) ? date : null;
}
function betterJSONParse(value, options = {}) {
	const { strict = false, warnings = false, reviver, parseDates = true } = options;
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	const lowerValue = trimmed.toLowerCase();
	if (lowerValue.length <= 9 && lowerValue in SPECIAL_VALUES) return SPECIAL_VALUES[lowerValue];
	if (!JSON_SIGNATURE.test(trimmed)) {
		if (strict) throw new SyntaxError("[better-json] Invalid JSON");
		return value;
	}
	if (Object.entries(PROTO_POLLUTION_PATTERNS).some(([key, pattern]) => {
		const matches = pattern.test(trimmed);
		if (matches && warnings) console.warn(`[better-json] Detected potential prototype pollution attempt using ${key} pattern`);
		return matches;
	}) && strict) throw new Error("[better-json] Potential prototype pollution attempt detected");
	try {
		const secureReviver = (key, value) => {
			if (key === "__proto__" || key === "constructor" && value && typeof value === "object" && "prototype" in value) {
				if (warnings) console.warn(`[better-json] Dropping "${key}" key to prevent prototype pollution`);
				return;
			}
			if (parseDates && typeof value === "string") {
				const date = parseISODate(value);
				if (date) return date;
			}
			return reviver ? reviver(key, value) : value;
		};
		return JSON.parse(trimmed, secureReviver);
	} catch (error) {
		if (strict) throw error;
		return value;
	}
}
function parseJSON(value, options = { strict: true }) {
	return betterJSONParse(value, options);
}
//#endregion
//#region src/lib/api.ts
var ApiClientError = class extends Error {
	status;
	body;
	constructor(status, body) {
		super(body.message);
		this.status = status;
		this.body = body;
	}
};
async function api(path, options = {}) {
	const response = await fetch(`/api${path}`, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...options.headers ?? {}
		}
	});
	if (!response.ok) throw new ApiClientError(response.status, await response.json());
	return response.json();
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/fetch-plugins.mjs
var redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: { onSuccess(context) {
		if (context.data?.url && context.data?.redirect && isSafeUrlScheme(context.data.url)) {
			if (typeof window !== "undefined" && window.location) {
				if (window.location) try {
					window.location.href = context.data.url;
				} catch {}
			}
		}
	} }
};
//#endregion
//#region ../../node_modules/.bun/nanostores@1.5.2/node_modules/nanostores/clean-stores/index.js
var clean = Symbol("clean");
//#endregion
//#region ../../node_modules/.bun/nanostores@1.5.2/node_modules/nanostores/atom/index.js
var listenerQueue = [];
var lqIndex = 0;
var batchSeen = null;
var QUEUE_ITEMS_PER_LISTENER = 4;
var nanostoresGlobal = globalThis.nanostoresGlobal ||= { epoch: 0 };
var drainQueue = () => {
	let thrown;
	for (lqIndex = 0; lqIndex < listenerQueue.length; lqIndex += QUEUE_ITEMS_PER_LISTENER) try {
		listenerQueue[lqIndex](listenerQueue[lqIndex + 1].value, listenerQueue[lqIndex + 2], listenerQueue[lqIndex + 3]);
	} catch (e) {
		thrown = e;
	}
	listenerQueue.length = 0;
	if (thrown) throw thrown;
};
var atom = /* @__NO_SIDE_EFFECTS__ */ (initialValue) => {
	let listeners = [];
	let $atom = {
		eq: Object.is,
		get() {
			if (!$atom.lc) $atom.listen(() => {})();
			return $atom.value;
		},
		init: initialValue,
		lc: 0,
		listen(listener) {
			$atom.lc = listeners.push(listener);
			return () => {
				for (let i = lqIndex + QUEUE_ITEMS_PER_LISTENER; i < listenerQueue.length;) if (listenerQueue[i] === listener) listenerQueue.splice(i, QUEUE_ITEMS_PER_LISTENER);
				else i += QUEUE_ITEMS_PER_LISTENER;
				let index = listeners.indexOf(listener);
				if (~index) {
					listeners.splice(index, 1);
					if (!--$atom.lc) $atom.off();
				}
			};
		},
		notify(oldValue, changedKey) {
			nanostoresGlobal.epoch++;
			let runListenerQueue = !listenerQueue.length && !batchSeen;
			for (let listener of listeners) {
				if (batchSeen?.has(listener)) continue;
				batchSeen?.add(listener);
				listenerQueue.push(listener, $atom, oldValue, batchSeen ? void 0 : changedKey);
			}
			if (runListenerQueue) drainQueue();
		},
		off() {},
		set(newValue) {
			let oldValue = $atom.value;
			if (!$atom.eq(oldValue, newValue)) {
				$atom.value = newValue;
				$atom.notify(oldValue);
			}
		},
		subscribe(listener) {
			let unbind = $atom.listen(listener);
			listener($atom.value);
			return unbind;
		},
		value: initialValue
	};
	if (process.env.NODE_ENV !== "production") $atom[clean] = () => {
		listeners = [];
		$atom.lc = 0;
		$atom.off();
	};
	return $atom;
};
//#endregion
//#region ../../node_modules/.bun/nanostores@1.5.2/node_modules/nanostores/lifecycle/index.js
var SET = 2;
var MOUNT = 5;
var UNMOUNT = 6;
var REVERT_MUTATION = 10;
var on = (object, listener, eventKey, mutateStore) => {
	object.events = object.events || {};
	if (!object.events[eventKey + REVERT_MUTATION]) object.events[eventKey + REVERT_MUTATION] = mutateStore((eventProps) => {
		object.events[eventKey].reduceRight((event, l) => (l(event), event), {
			shared: {},
			...eventProps
		});
	});
	object.events[eventKey] = object.events[eventKey] || [];
	object.events[eventKey].push(listener);
	return () => {
		let currentListeners = object.events[eventKey];
		let index = currentListeners.indexOf(listener);
		currentListeners.splice(index, 1);
		if (!currentListeners.length) {
			delete object.events[eventKey];
			object.events[eventKey + REVERT_MUTATION]();
			delete object.events[eventKey + REVERT_MUTATION];
		}
	};
};
var onSet = ($store, listener) => on($store, listener, SET, (runListeners) => {
	let originSet = $store.set;
	let originSetKey = $store.setKey;
	if ($store.setKey) $store.setKey = (changed, changedValue) => {
		let isAborted;
		let abort = () => {
			isAborted = true;
		};
		runListeners({
			abort,
			changed,
			newValue: {
				...$store.value,
				[changed]: changedValue
			}
		});
		if (!isAborted) return originSetKey(changed, changedValue);
	};
	$store.set = (newValue) => {
		let isAborted;
		let abort = () => {
			isAborted = true;
		};
		runListeners({
			abort,
			newValue
		});
		if (!isAborted) return originSet(newValue);
	};
	return () => {
		$store.set = originSet;
		$store.setKey = originSetKey;
	};
});
var STORE_UNMOUNT_DELAY = 1e3;
var onMount = ($store, initialize) => {
	let listener = (payload) => {
		let destroy = initialize(payload);
		if (destroy) $store.events[UNMOUNT].push(destroy);
	};
	return on($store, listener, MOUNT, (runListeners) => {
		let originListen = $store.listen;
		$store.listen = (...args) => {
			if (!$store.lc && !$store.active) {
				$store.active = true;
				runListeners();
			}
			return originListen(...args);
		};
		let originOff = $store.off;
		$store.events[UNMOUNT] = [];
		$store.off = () => {
			originOff();
			setTimeout(() => {
				if ($store.active && !$store.lc) {
					$store.active = false;
					for (let destroy of $store.events[UNMOUNT]) destroy();
					$store.events[UNMOUNT] = [];
				}
			}, STORE_UNMOUNT_DELAY);
		};
		if (process.env.NODE_ENV !== "production") {
			let originClean = $store[clean];
			$store[clean] = () => {
				for (let destroy of $store.events[UNMOUNT]) destroy();
				$store.events[UNMOUNT] = [];
				$store.active = false;
				originClean();
			};
		}
		return () => {
			$store.listen = originListen;
			$store.off = originOff;
		};
	});
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/equality.mjs
function isPlainObject(value) {
	if (typeof value !== "object" || value === null) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
/**
* Deep structural equality for JSON-serializable values.
* Handles: primitives, null, arrays, and plain objects.
* Short-circuits on referential equality at every recursion level.
*/
function isJsonEqual(a, b) {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!isJsonEqual(a[i], b[i])) return false;
		return true;
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) return false;
		for (const key of keysA) if (!(key in b) || !isJsonEqual(a[key], b[key])) return false;
		return true;
	}
	return false;
}
/**
* Attach an equality gate to a nanostores atom via `onSet`.
* When `isEqual(currentValue, newValue)` returns true, the `set()` call
* is aborted: no listeners fire, no framework re-renders occur.
*
* Returns the unsubscribe function from `onSet`.
*/
function withEquality(store, isEqual) {
	return onSet(store, ({ newValue, abort }) => {
		if (isEqual(store.value, newValue)) abort();
	});
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/broadcast-channel.mjs
var kBroadcastChannel = Symbol.for("better-auth:broadcast-channel");
var now$1 = () => Math.floor(Date.now() / 1e3);
var WindowBroadcastChannel = class {
	listeners = /* @__PURE__ */ new Set();
	name;
	constructor(name = "better-auth.message") {
		this.name = name;
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	post(message) {
		if (typeof window === "undefined") return;
		try {
			localStorage.setItem(this.name, JSON.stringify({
				...message,
				timestamp: now$1()
			}));
		} catch {}
	}
	setup() {
		if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {};
		const handler = (event) => {
			if (event.key !== this.name) return;
			const message = JSON.parse(event.newValue ?? "{}");
			if (message?.event !== "session" || !message?.data) return;
			this.listeners.forEach((listener) => listener(message));
		};
		window.addEventListener("storage", handler);
		return () => {
			window.removeEventListener("storage", handler);
		};
	}
};
function getGlobalBroadcastChannel(name = "better-auth.message") {
	if (!globalThis[kBroadcastChannel]) globalThis[kBroadcastChannel] = new WindowBroadcastChannel(name);
	return globalThis[kBroadcastChannel];
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/focus-manager.mjs
var kFocusManager = Symbol.for("better-auth:focus-manager");
var WindowFocusManager = class {
	listeners = /* @__PURE__ */ new Set();
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	setFocused(focused) {
		this.listeners.forEach((listener) => listener(focused));
	}
	setup() {
		if (typeof window === "undefined" || typeof document === "undefined" || typeof window.addEventListener === "undefined") return () => {};
		const visibilityHandler = () => {
			if (document.visibilityState === "visible") this.setFocused(true);
		};
		document.addEventListener("visibilitychange", visibilityHandler, false);
		return () => {
			document.removeEventListener("visibilitychange", visibilityHandler, false);
		};
	}
};
function getGlobalFocusManager() {
	if (!globalThis[kFocusManager]) globalThis[kFocusManager] = new WindowFocusManager();
	return globalThis[kFocusManager];
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/online-manager.mjs
var kOnlineManager = Symbol.for("better-auth:online-manager");
var WindowOnlineManager = class {
	listeners = /* @__PURE__ */ new Set();
	isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	setOnline(online) {
		this.isOnline = online;
		this.listeners.forEach((listener) => listener(online));
	}
	setup() {
		if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {};
		const onOnline = () => this.setOnline(true);
		const onOffline = () => this.setOnline(false);
		window.addEventListener("online", onOnline, false);
		window.addEventListener("offline", onOffline, false);
		return () => {
			window.removeEventListener("online", onOnline, false);
			window.removeEventListener("offline", onOffline, false);
		};
	}
};
function getGlobalOnlineManager() {
	if (!globalThis[kOnlineManager]) globalThis[kOnlineManager] = new WindowOnlineManager();
	return globalThis[kOnlineManager];
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/session-refresh.mjs
var now = () => Math.floor(Date.now() / 1e3);
/**
* Rate limit: don't refetch on focus if a session request was made within this many seconds
*/
var FOCUS_REFETCH_RATE_LIMIT_SECONDS = 5;
function createSessionRefreshManager(opts) {
	const { fetchSession, shouldPollSession = () => true, sessionSignal, options = {} } = opts;
	const refetchInterval = options.sessionOptions?.refetchInterval ?? 0;
	const refetchOnWindowFocus = options.sessionOptions?.refetchOnWindowFocus ?? true;
	const refetchWhenOffline = options.sessionOptions?.refetchWhenOffline ?? false;
	const state = {
		isInitialized: false,
		lastSessionRequest: 0
	};
	const shouldRefetch = () => {
		return refetchWhenOffline || getGlobalOnlineManager().isOnline;
	};
	const triggerRefetch = (event) => {
		if (!shouldRefetch()) return;
		if (event?.event === "storage") {
			fetchSession();
			return;
		}
		if (event?.event === "poll") {
			state.lastSessionRequest = now();
			fetchSession();
			return;
		}
		if (event?.event === "visibilitychange") {
			if (now() - state.lastSessionRequest < FOCUS_REFETCH_RATE_LIMIT_SECONDS) return;
			state.lastSessionRequest = now();
			fetchSession();
			return;
		}
		fetchSession();
	};
	const broadcastSessionUpdate = (trigger) => {
		getGlobalBroadcastChannel().post({
			event: "session",
			data: { trigger },
			clientId: Math.random().toString(36).substring(7)
		});
	};
	const setupPolling = () => {
		if (refetchInterval && refetchInterval > 0) state.pollInterval = setInterval(() => {
			if (shouldPollSession()) triggerRefetch({ event: "poll" });
		}, refetchInterval * 1e3);
	};
	const setupBroadcast = () => {
		state.unsubscribeBroadcast = getGlobalBroadcastChannel().subscribe(() => {
			triggerRefetch({ event: "storage" });
		});
	};
	const setupFocusRefetch = () => {
		if (!refetchOnWindowFocus) return;
		state.unsubscribeFocus = getGlobalFocusManager().subscribe(() => {
			triggerRefetch({ event: "visibilitychange" });
		});
	};
	const setupOnlineRefetch = () => {
		state.unsubscribeOnline = getGlobalOnlineManager().subscribe((online) => {
			if (online) triggerRefetch({ event: "visibilitychange" });
		});
	};
	const setupSignalSubscription = () => {
		state.unsubscribeSignal = sessionSignal.listen(() => {
			fetchSession();
		});
	};
	const init = () => {
		if (state.isInitialized) return;
		state.isInitialized = true;
		setupPolling();
		setupBroadcast();
		setupFocusRefetch();
		setupOnlineRefetch();
		setupSignalSubscription();
		state.cleanupBroadcastSetup = getGlobalBroadcastChannel().setup();
		state.cleanupFocusSetup = getGlobalFocusManager().setup();
		state.cleanupOnlineSetup = getGlobalOnlineManager().setup();
	};
	const cleanup = () => {
		if (!state.isInitialized) return;
		if (state.pollInterval) {
			clearInterval(state.pollInterval);
			state.pollInterval = void 0;
		}
		if (state.unsubscribeBroadcast) {
			state.unsubscribeBroadcast();
			state.unsubscribeBroadcast = void 0;
		}
		if (state.unsubscribeFocus) {
			state.unsubscribeFocus();
			state.unsubscribeFocus = void 0;
		}
		if (state.unsubscribeOnline) {
			state.unsubscribeOnline();
			state.unsubscribeOnline = void 0;
		}
		if (state.unsubscribeSignal) {
			state.unsubscribeSignal();
			state.unsubscribeSignal = void 0;
		}
		if (state.cleanupBroadcastSetup) {
			state.cleanupBroadcastSetup();
			state.cleanupBroadcastSetup = void 0;
		}
		if (state.cleanupFocusSetup) {
			state.cleanupFocusSetup();
			state.cleanupFocusSetup = void 0;
		}
		if (state.cleanupOnlineSetup) {
			state.cleanupOnlineSetup();
			state.cleanupOnlineSetup = void 0;
		}
		state.isInitialized = false;
		state.lastSessionRequest = 0;
	};
	return {
		init,
		cleanup,
		triggerRefetch,
		broadcastSessionUpdate
	};
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/session-atom.mjs
var isServer = () => typeof window === "undefined";
/**
* Normalize $fetch response: `throw: true` returns data directly,
* otherwise `{ data, error }`.
*/
function normalizeSessionResponse(res) {
	if (typeof res === "object" && res !== null && "data" in res && "error" in res) return res;
	return {
		data: res,
		error: null
	};
}
function normalizeSessionData(data) {
	if (!data) return null;
	if (data.session === null && data.user === null) return null;
	return data;
}
function isSessionAtomEqual(a, b) {
	return isJsonEqual(a.data, b.data) && a.error === b.error && a.isPending === b.isPending && a.isRefetching === b.isRefetching && a.refetch === b.refetch;
}
function getSessionAtom($fetch, options) {
	const $signal = /* @__PURE__ */ atom(false);
	let abortController;
	const refetch = (queryParams) => fetchSession(queryParams);
	const session = /* @__PURE__ */ atom({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch
	});
	withEquality(session, isSessionAtomEqual);
	const settleAbortedFetch = (controller) => {
		if (abortController !== controller) return;
		const current = session.get();
		abortController = void 0;
		if (!current.isPending && !current.isRefetching) return;
		session.set({
			...current,
			isPending: false,
			isRefetching: false,
			refetch
		});
	};
	const fetchSession = async (queryParams) => {
		abortController?.abort();
		const controller = new AbortController();
		abortController = controller;
		const current = session.get();
		session.set({
			...current,
			isPending: current.data === null,
			isRefetching: true,
			error: null,
			refetch
		});
		try {
			const res = await $fetch("/get-session", {
				method: "GET",
				query: queryParams?.query,
				signal: controller.signal
			});
			if (controller.signal.aborted) {
				settleAbortedFetch(controller);
				return;
			}
			let { data, error } = normalizeSessionResponse(res);
			if (data?.needsRefresh) try {
				const refreshRes = await $fetch("/get-session", {
					method: "POST",
					signal: controller.signal
				});
				if (controller.signal.aborted) {
					settleAbortedFetch(controller);
					return;
				}
				({data, error} = normalizeSessionResponse(refreshRes));
			} catch {
				if (controller.signal.aborted) {
					settleAbortedFetch(controller);
					return;
				}
			}
			if (error) {
				const latest = session.get();
				const isUnauthorized = error?.status === 401;
				session.set({
					data: isUnauthorized ? null : latest.data,
					error,
					isPending: false,
					isRefetching: false,
					refetch
				});
				return;
			}
			const sessionData = normalizeSessionData(data);
			const current = session.get();
			const stableData = current.data != null && sessionData != null && isJsonEqual(current.data, sessionData) ? current.data : sessionData;
			session.set({
				data: stableData,
				error: null,
				isPending: false,
				isRefetching: false,
				refetch
			});
		} catch (fetchError) {
			if (controller.signal.aborted) {
				settleAbortedFetch(controller);
				return;
			}
			const latest = session.get();
			session.set({
				data: latest.data,
				error: fetchError,
				isPending: false,
				isRefetching: false,
				refetch
			});
		}
	};
	let broadcastSessionUpdate = () => {};
	onMount(session, () => {
		let timeoutId;
		if (!isServer()) timeoutId = setTimeout(() => {
			fetchSession();
		}, 0);
		const refreshManager = createSessionRefreshManager({
			fetchSession,
			shouldPollSession: () => session.get().data != null,
			sessionSignal: $signal,
			options
		});
		refreshManager.init();
		broadcastSessionUpdate = refreshManager.broadcastSessionUpdate;
		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			const controller = abortController;
			controller?.abort();
			if (controller) settleAbortedFetch(controller);
			refreshManager.cleanup();
		};
	});
	return {
		session,
		$sessionSignal: $signal,
		broadcastSessionUpdate: (trigger) => broadcastSessionUpdate(trigger)
	};
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/config.mjs
var resolvePublicAuthUrl = (basePath) => {
	if (typeof process === "undefined") return void 0;
	const path = basePath ?? "/api/auth";
	if (process.env.NEXT_PUBLIC_AUTH_URL) return process.env.NEXT_PUBLIC_AUTH_URL;
	if (typeof window === "undefined") {
		if (process.env.NEXTAUTH_URL) try {
			return process.env.NEXTAUTH_URL;
		} catch {}
		if (process.env.VERCEL_URL) try {
			const protocol = process.env.VERCEL_URL.startsWith("http") ? "" : "https://";
			return `${new URL(`${protocol}${process.env.VERCEL_URL}`).origin}${path}`;
		} catch {}
	}
};
var getClientConfig = (options, loadEnv) => {
	const isCredentialsSupported = "credentials" in Request.prototype;
	const baseURL = getBaseURL(options?.baseURL, options?.basePath, void 0, loadEnv) ?? resolvePublicAuthUrl(options?.basePath) ?? "/api/auth";
	const pluginsFetchPlugins = options?.plugins?.flatMap((plugin) => plugin.fetchPlugins).filter((pl) => pl !== void 0) || [];
	const lifeCyclePlugin = {
		id: "lifecycle-hooks",
		name: "lifecycle-hooks",
		hooks: {
			onSuccess: options?.fetchOptions?.onSuccess,
			onError: options?.fetchOptions?.onError,
			onRequest: options?.fetchOptions?.onRequest,
			onResponse: options?.fetchOptions?.onResponse
		}
	};
	const { onSuccess: _onSuccess, onError: _onError, onRequest: _onRequest, onResponse: _onResponse, ...restOfFetchOptions } = options?.fetchOptions || {};
	const $fetch = createFetch({
		baseURL,
		...isCredentialsSupported ? { credentials: "include" } : {},
		method: "GET",
		jsonParser(text) {
			if (!text) return null;
			return parseJSON(text, { strict: false });
		},
		customFetchImpl: fetch,
		...restOfFetchOptions,
		plugins: [
			lifeCyclePlugin,
			...restOfFetchOptions.plugins || [],
			...options?.disableDefaultFetchPlugins ? [] : [redirectPlugin],
			...pluginsFetchPlugins
		]
	});
	const { $sessionSignal, session, broadcastSessionUpdate } = getSessionAtom($fetch, options);
	const plugins = options?.plugins || [];
	let pluginsActions = {};
	const pluginsAtoms = {
		$sessionSignal,
		session
	};
	const pluginPathMethods = {
		"/sign-out": "POST",
		"/revoke-sessions": "POST",
		"/revoke-other-sessions": "POST",
		"/delete-user": "POST"
	};
	const atomListeners = [{
		signal: "$sessionSignal",
		matcher(path) {
			return path === "/sign-out" || path === "/update-user" || path === "/update-session" || path === "/sign-up/email" || path === "/sign-in/email" || path === "/delete-user" || path === "/verify-email" || path === "/revoke-sessions" || path === "/revoke-session" || path === "/revoke-other-sessions" || path === "/change-email" || path === "/change-password";
		},
		callback(path) {
			if (path === "/sign-out") broadcastSessionUpdate("signout");
			else if (path === "/update-user" || path === "/update-session") broadcastSessionUpdate("updateUser");
		}
	}];
	for (const plugin of plugins) {
		if (plugin.getAtoms) Object.assign(pluginsAtoms, plugin.getAtoms?.($fetch));
		if (plugin.pathMethods) Object.assign(pluginPathMethods, plugin.pathMethods);
		if (plugin.atomListeners) atomListeners.push(...plugin.atomListeners);
	}
	const $store = {
		notify: (signal) => {
			pluginsAtoms[signal].set(!pluginsAtoms[signal].get());
		},
		listen: (signal, listener) => {
			pluginsAtoms[signal].subscribe(listener);
		},
		atoms: pluginsAtoms
	};
	for (const plugin of plugins) if (plugin.getActions) pluginsActions = defu(plugin.getActions?.($fetch, $store, options) ?? {}, pluginsActions);
	return {
		get baseURL() {
			return baseURL;
		},
		pluginsActions,
		pluginsAtoms,
		pluginPathMethods,
		atomListeners,
		$fetch,
		$store
	};
};
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/utils/is-atom.mjs
function isAtom(value) {
	return typeof value === "object" && value !== null && "get" in value && typeof value.get === "function" && "lc" in value && typeof value.lc === "number";
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/proxy.mjs
function getMethod(path, knownPathMethods, args) {
	const method = knownPathMethods[path];
	const { fetchOptions, query: _query, ...body } = args || {};
	if (method) return method;
	if (fetchOptions?.method) return fetchOptions.method;
	if (body && Object.keys(body).length > 0) return "POST";
	return "GET";
}
function createDynamicPathProxy(routes, client, knownPathMethods, atoms, atomListeners) {
	function createProxy(path = []) {
		return new Proxy(function() {}, {
			get(_, prop) {
				if (typeof prop !== "string") return;
				if (prop === "then" || prop === "catch" || prop === "finally") return;
				const fullPath = [...path, prop];
				let current = routes;
				for (const segment of fullPath) if (current && typeof current === "object" && segment in current) current = current[segment];
				else {
					current = void 0;
					break;
				}
				if (typeof current === "function") return current;
				if (isAtom(current)) return current;
				return createProxy(fullPath);
			},
			apply: async (_, __, args) => {
				const routePath = "/" + path.map(toKebabCase).join("/");
				const arg = args[0] || {};
				const fetchOptions = args[1] || {};
				const { query, fetchOptions: argFetchOptions, ...body } = arg;
				const options = {
					...fetchOptions,
					...argFetchOptions
				};
				const method = getMethod(routePath, knownPathMethods, arg);
				return await client(routePath, {
					...options,
					body: method === "GET" ? void 0 : {
						...body,
						...options?.body || {}
					},
					query: query || options?.query,
					method,
					async onSuccess(context) {
						await options?.onSuccess?.(context);
						if (!atomListeners || options.disableSignal) return;
						/**
						* We trigger listeners
						*/
						const matches = atomListeners.filter((s) => s.matcher(routePath));
						if (!matches.length) return;
						const visited = /* @__PURE__ */ new Set();
						for (const match of matches) {
							const signal = atoms[match.signal];
							if (!signal) return;
							if (visited.has(match.signal)) continue;
							visited.add(match.signal);
							/**
							* To avoid race conditions we set the signal in a setTimeout
							*/
							const val = signal.get();
							setTimeout(() => {
								signal.set(!val);
							}, 10);
							match.callback?.(routePath);
						}
					}
				});
			}
		});
	}
	return createProxy();
}
//#endregion
//#region ../../node_modules/.bun/better-auth@1.6.23+2226be1a6fba2a93/node_modules/better-auth/dist/client/svelte/index.mjs
function createAuthClient(options) {
	const { pluginPathMethods, pluginsActions, pluginsAtoms, $fetch, atomListeners, $store } = getClientConfig(options);
	const resolvedHooks = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) resolvedHooks[`use${capitalizeFirstLetter(key)}`] = () => value;
	return createDynamicPathProxy({
		...pluginsActions,
		...resolvedHooks,
		$fetch,
		$store
	}, $fetch, pluginPathMethods, pluginsAtoms, atomListeners);
}
//#endregion
//#region src/lib/passkey-diagnostics.ts
function text(value) {
	return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function status(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function passkeyPlatform(context) {
	return context.android ? "android" : context.firefoxLinux ? "firefox-linux" : "other";
}
function passkeyProcessTrace(stage, details = {}) {
	console.info(`[passkey] ${stage}`, details);
}
function guidance(code, context, httpStatus) {
	switch (code) {
		case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
			if (context.firefoxLinux) return "Firefox oder der Sicherheitsschlüssel hat die Passkey-Anfrage abgebrochen, abgelehnt oder nicht rechtzeitig bestätigt. Die PIN-Abfrage bestätigt, dass Firefox den Schlüssel gefunden hat. Gib die PIN ein und berühre den YubiKey anschließend, sobald Firefox dazu auffordert.";
			if (context.android) return "Androids Passkey-Dienst hat die Anfrage abgebrochen, abgelehnt oder nicht rechtzeitig abgeschlossen. Öffne den ursprünglichen Link direkt in Chrome statt in einem eingebetteten Browser und prüfe, ob Displaysperre und Passkey-Anbieter aktiv sind.";
			return "Der Browser oder Passkey-Anbieter hat die Anfrage abgebrochen, abgelehnt oder nicht rechtzeitig bestätigt.";
		case "ERROR_CEREMONY_ABORTED": return "Die Passkey-Anfrage wurde abgebrochen, möglicherweise weil eine zweite Anfrage gestartet wurde. Versuche es erneut und schließe nur die aktuelle Abfrage ab.";
		case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED": return "Dieser Passkey ist für dieses Aven-Konto bereits registriert. Verwende einen anderen Passkey oder melde dich mit dem vorhandenen an.";
		case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT": return "Der gewählte Sicherheitsschlüssel unterstützt keine auffindbaren FIDO2-Anmeldedaten oder sein Speicher ist nicht verfügbar. Für die Anmeldung in avenOS wird ein discoverable credential benötigt.";
		case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT": return "Der gewählte Passkey-Anbieter unterstützt die erforderliche Benutzerbestätigung per PIN oder Biometrie nicht.";
		case "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE": return "Der Passkey-Anbieter konnte die erforderliche Bestätigung per PIN oder Biometrie nicht durchführen.";
		case "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG": return "Der gewählte Sicherheitsschlüssel unterstützt keinen der vom Identitätsdienst angebotenen Signaturalgorithmen.";
		case "ERROR_AUTHENTICATOR_GENERAL_ERROR": return "Der Sicherheitsschlüssel oder Passkey-Anbieter konnte die Registrierung nicht verarbeiten. Prüfe insbesondere freien Passkey-Speicher, PIN und die abschließende Berührung des Schlüssels.";
		case "ERROR_INVALID_DOMAIN":
		case "ERROR_INVALID_RP_ID": return "Browser und Identitätsdienst verwenden nicht dieselbe Passkey-Domain. Das ist ein Konfigurationsfehler des Dienstes.";
		case "ERROR_INVALID_USER_ID_LENGTH":
		case "ERROR_MALFORMED_PUBKEYCREDPARAMS": return "Der Identitätsdienst hat ungültige WebAuthn-Registrierungsdaten geliefert.";
	}
	if (httpStatus === 401 || httpStatus === 403) return "Der Identitätsdienst hat die Registrierung abgelehnt. Der Einrichtungslink oder die Anmeldung ist möglicherweise nicht mehr gültig.";
	if (httpStatus === 429) return "Zu viele Passkey-Versuche in kurzer Zeit. Warte einen Moment und versuche es erneut.";
	if (httpStatus && httpStatus >= 500) return "Der Identitätsdienst konnte die Passkey-Registrierung nicht abschließen.";
	return "Die Passkey-Registrierung ist fehlgeschlagen.";
}
function passkeyRegistrationDiagnostic(error, context) {
	const code = text(error.code) ?? "UNKNOWN_PASSKEY_ERROR";
	const message = text(error.message);
	const httpStatus = status(error.status);
	const diagnostic = [code, httpStatus ? `HTTP ${httpStatus}` : void 0].filter(Boolean).join(", ");
	const detail = message ? ` Browsermeldung: ${message}` : "";
	return /* @__PURE__ */ new Error(`${guidance(code, context, httpStatus)}${detail} [Diagnose: ${diagnostic}]`);
}
function passkeyDiagnosticLog(error, context) {
	return {
		stage: "webauthn-registration",
		code: text(error.code) ?? "UNKNOWN_PASSKEY_ERROR",
		message: text(error.message),
		status: status(error.status),
		statusText: text(error.statusText),
		platform: passkeyPlatform(context)
	};
}
//#endregion
//#region src/lib/sha256.ts
var K = new Uint32Array([
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
var INIT = new Uint32Array([
	1779033703,
	3144134277,
	1013904242,
	2773480762,
	1359893119,
	2600822924,
	528734635,
	1541459225
]);
var rotr = (x, n) => x >>> n | x << 32 - n;
function compress(h, w, view, byteLength) {
	for (let offset = 0; offset < byteLength; offset += 64) {
		for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
		for (let i = 16; i < 64; i += 1) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
			w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
		}
		let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
		for (let i = 0; i < 64; i += 1) {
			const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (e & f ^ ~e & g) + K[i] + w[i] >>> 0;
			const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
			hh = g;
			g = f;
			f = e;
			e = d + t1 >>> 0;
			d = c;
			c = b;
			b = a;
			a = t1 + t2 >>> 0;
		}
		h[0] = h[0] + a >>> 0;
		h[1] = h[1] + b >>> 0;
		h[2] = h[2] + c >>> 0;
		h[3] = h[3] + d >>> 0;
		h[4] = h[4] + e >>> 0;
		h[5] = h[5] + f >>> 0;
		h[6] = h[6] + g >>> 0;
		h[7] = h[7] + hh >>> 0;
	}
}
function createCounterHasher(prefix) {
	const digest = /* @__PURE__ */ new Uint8Array(32);
	const out = new DataView(digest.buffer);
	const h = /* @__PURE__ */ new Uint32Array(8);
	const w = /* @__PURE__ */ new Uint32Array(64);
	let padded = /* @__PURE__ */ new Uint8Array(0);
	let view = new DataView(padded.buffer);
	let currentLength = -1;
	return (suffix) => {
		const length = prefix.length + suffix.length;
		if (length !== currentLength) {
			const size = (length + 8 >> 6 << 6) + 64;
			if (padded.length !== size) {
				padded = new Uint8Array(size);
				view = new DataView(padded.buffer);
				padded.set(prefix);
			} else padded.fill(0, length);
			padded[length] = 128;
			view.setUint32(size - 4, length << 3 >>> 0);
			currentLength = length;
		}
		for (let i = 0; i < suffix.length; i += 1) padded[prefix.length + i] = suffix.charCodeAt(i);
		h.set(INIT);
		compress(h, w, view, padded.length);
		for (let i = 0; i < 8; i += 1) out.setUint32(i * 4, h[i]);
		return digest;
	};
}
//#endregion
//#region src/lib/proof-of-work.ts
function hasLeadingZeroBits(digest, bits) {
	const completeBytes = Math.floor(bits / 8);
	for (let index = 0; index < completeBytes; index += 1) if (digest[index] !== 0) return false;
	const remainingBits = bits % 8;
	return remainingBits === 0 || ((digest[completeBytes] ?? 255) & 255 << 8 - remainingBits) === 0;
}
async function getChallenge(purpose) {
	const response = await fetch(`/api/pow/challenge?purpose=${encodeURIComponent(purpose)}`, { cache: "no-store" });
	if (!response.ok) {
		const body = await response.json().catch(() => ({ message: "Could not create a local proof-of-work challenge." }));
		throw new Error(body.message ?? "Could not create a local proof-of-work challenge.");
	}
	const challenge = await response.json();
	if (challenge.purpose !== purpose || !Number.isInteger(challenge.difficultyBits) || challenge.difficultyBits < 1) throw new Error("The server returned an invalid proof-of-work challenge.");
	return challenge;
}
async function solveChallenge(challenge, deadline = () => Date.now() < challenge.expiresAt) {
	const hash = createCounterHasher(new TextEncoder().encode(`${challenge.id}:${challenge.nonce}:${challenge.purpose}:`));
	const chunkSize = 5e4;
	let counter = 0;
	while (deadline()) {
		for (const end = counter + chunkSize; counter < end; counter += 1) if (hasLeadingZeroBits(hash(String(counter)), challenge.difficultyBits)) return counter;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("The local proof-of-work challenge expired. Please retry.");
}
async function createProofOfWorkHeader(purpose) {
	const challenge = await getChallenge(purpose);
	const counter = await solveChallenge(challenge);
	return { "x-proof-of-work": `${challenge.id}.${counter}` };
}
//#endregion
//#region src/lib/auth-client.ts
var protectedPaths = ["/passkey/verify-authentication"];
var registrationEndpoints = /* @__PURE__ */ new Map([["/passkey/generate-register-options", "registration-options"], ["/passkey/verify-registration", "registration-verification"]]);
async function powFetch(input, init) {
	const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
	const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
	const registrationEndpoint = [...registrationEndpoints].find(([path]) => url.includes(path))?.[1];
	const startedAt = Date.now();
	if (registrationEndpoint) passkeyProcessTrace("HTTP request", {
		endpoint: registrationEndpoint,
		method: method === "POST" ? "POST" : "GET"
	});
	if (method === "POST" && protectedPaths.some((path) => url.includes(path))) {
		const proofValue = (await createProofOfWorkHeader("sign-in"))["x-proof-of-work"];
		if (!proofValue) throw new Error("Proof-of-work did not return a sign-in proof.");
		const headers = new Headers(init?.headers);
		headers.set("x-proof-of-work", proofValue);
		init = {
			...init,
			headers
		};
	}
	try {
		const response = await fetch(input, init);
		if (registrationEndpoint) passkeyProcessTrace("HTTP response", {
			endpoint: registrationEndpoint,
			method: method === "POST" ? "POST" : "GET",
			status: response.status,
			durationMs: Date.now() - startedAt
		});
		return response;
	} catch (error) {
		if (registrationEndpoint) console.error("[passkey] HTTP request failed", {
			endpoint: registrationEndpoint,
			method: method === "POST" ? "POST" : "GET",
			durationMs: Date.now() - startedAt,
			errorName: error instanceof Error ? error.name : "UnknownError"
		});
		throw error;
	}
}
var authClient = createAuthClient({
	fetchOptions: { customFetchImpl: powFetch },
	plugins: [passkeyClient()]
});
//#endregion
//#region src/lib/app-runtime/runtime.production.ts
var sessionStore;
function responseJson(response) {
	return response.json().catch(() => ({}));
}
async function deviceResponse(response) {
	const body = await responseJson(response);
	if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : typeof body.error_description === "string" ? body.error_description : "Device authorization failed.");
	return body;
}
var appRuntime = {
	session() {
		if (!sessionStore) sessionStore = derived(authClient.useSession(), ($session) => ({
			authenticated: Boolean($session.data),
			...$session.data?.user ? { user: {
				name: $session.data.user.name,
				email: $session.data.user.email
			} } : {}
		}));
		return sessionStore;
	},
	initial: {
		nameSearch: () => ({
			name: "",
			busy: false,
			result: null,
			error: ""
		}),
		secureName: (url) => ({
			name: (url.searchParams.get("name") ?? "").toLowerCase(),
			email: "",
			info: null,
			hold: null,
			loading: false,
			error: ""
		}),
		login: (url) => ({
			busy: false,
			error: "",
			message: url.searchParams.get("access") === "invalid" ? "Link unavailable. Sign in with a passkey." : ""
		}),
		device: () => ({
			signedIn: false,
			busy: false,
			approved: false,
			message: ""
		}),
		passkey: () => ({
			name: "",
			busy: false,
			error: ""
		}),
		checkout: () => ({
			state: "loading",
			error: ""
		}),
		payment: () => ({
			busy: false,
			error: ""
		})
	},
	names: {
		check: (name) => api(`/names/check?name=${encodeURIComponent(name.trim().toLowerCase())}`),
		loadInfo: (name) => name ? api(`/names/check?name=${encodeURIComponent(name)}`).catch(() => null) : Promise.resolve(null),
		async mine() {
			return (await api("/names/mine")).names.map((entry) => entry.name);
		},
		async hold(name, email, origin) {
			return (await api("/names/hold", {
				method: "POST",
				headers: await createProofOfWorkHeader("secure-name"),
				body: JSON.stringify({
					name,
					email,
					...origin
				})
			})).hold;
		}
	},
	auth: {
		async signIn() {
			const result = await authClient.signIn.passkey();
			if (result?.error) throw new Error(result.error.message ?? "Login failed.");
		},
		async signOut() {
			await authClient.signOut();
		},
		async createPasskey(name, firefoxLinux) {
			const context = {
				firefoxLinux,
				android: /Android/.test(navigator.userAgent)
			};
			const platform = passkeyPlatform(context);
			const webAuthnAvailable = Boolean(window.PublicKeyCredential);
			passkeyProcessTrace("Registration started", { platform });
			passkeyProcessTrace("Capability check", {
				platform,
				webAuthnAvailable
			});
			if (!webAuthnAvailable) throw new Error("Passkeys unavailable.");
			passkeyProcessTrace("Loading server policy", { platform });
			const meta = await api("/meta");
			passkeyProcessTrace("Server policy loaded", {
				platform,
				prfRequired: meta.requirePasskeyPrf
			});
			passkeyProcessTrace("Starting browser and authenticator ceremony", { platform });
			const result = await authClient.passkey.addPasskey({
				name: name.trim() || void 0,
				...meta.requirePasskeyPrf ? {
					extensions: { prf: {} },
					returnWebAuthnResponse: true
				} : {}
			});
			if (result?.error) {
				console.error("[passkey] Registration failed", passkeyDiagnosticLog(result.error, context));
				throw passkeyRegistrationDiagnostic(result.error, context);
			}
			const extensions = "webauthn" in result ? result.webauthn.clientExtensionResults : void 0;
			const credentialId = result.data?.credentialID;
			const credentialReturned = typeof credentialId === "string";
			const prfEnabled = extensions?.prf?.enabled === true;
			passkeyProcessTrace("Credential created and verified", {
				platform,
				credentialReturned,
				prfEnabled
			});
			passkeyProcessTrace("Finalizing enrollment", {
				platform,
				endpoint: "enrollment-finalization",
				method: "POST"
			});
			const startedAt = Date.now();
			try {
				await api("/passkeys", {
					method: "POST",
					body: JSON.stringify({
						credentialId: credentialReturned ? credentialId : void 0,
						prfEnabled
					})
				});
			} catch (error) {
				console.error("[passkey] Enrollment finalization failed", {
					stage: "enrollment-finalization",
					platform,
					durationMs: Date.now() - startedAt,
					errorName: error instanceof Error ? error.name : "UnknownError",
					message: error instanceof Error ? error.message : String(error)
				});
				throw error;
			}
			passkeyProcessTrace("Enrollment finalized", {
				platform,
				endpoint: "enrollment-finalization",
				method: "POST",
				durationMs: Date.now() - startedAt
			});
			passkeyProcessTrace("Registration completed", { platform });
		},
		passkeyWarning: () => /Firefox\//.test(navigator.userAgent) && /Linux/.test(navigator.userAgent)
	},
	device: { async approve(userCode) {
		await deviceResponse(await fetch(`/api/auth/device?user_code=${encodeURIComponent(userCode)}`, { credentials: "same-origin" }));
		await deviceResponse(await fetch("/api/auth/device/approve", {
			method: "POST",
			credentials: "same-origin",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ userCode })
		}));
	} },
	dashboard: {
		async queue() {
			return null;
		},
		async load() {
			const [status, meta] = await Promise.all([api("/passkeys"), api("/meta")]);
			return {
				downloadUrl: meta.downloadUrl,
				needsPasskey: !status.passkeys.some((passkey) => !meta.requirePasskeyPrf || passkey.prf_enabled)
			};
		}
	},
	billing: { pay: (input) => api("/billing/fake-pay", {
		method: "POST",
		body: JSON.stringify(input)
	}) },
	purchase: { async waitForSession(token) {
		const deadline = Date.now() + 6e4;
		while (token && Date.now() <= deadline) {
			try {
				if ((await fetch("/api/auth/sign-in/purchase-token", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ token })
				})).ok) return true;
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}
		return false;
	} },
	meta: () => api("/meta")
};
//#endregion
export { appRuntime as t };
