export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["aven-logo.svg","favicon.svg"]),
	mimeTypes: {".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.DOoaFidP.js",app:"_app/immutable/entry/app.B3IBhyq-.js",imports:["_app/immutable/entry/start.DOoaFidP.js","_app/immutable/chunks/C8WBPWZ5.js","_app/immutable/chunks/BzqGBSpB.js","_app/immutable/entry/app.B3IBhyq-.js","_app/immutable/chunks/BzqGBSpB.js","_app/immutable/chunks/xihTtKlq.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js')),
			__memo(() => import('./nodes/7.js')),
			__memo(() => import('./nodes/8.js')),
			__memo(() => import('./nodes/9.js')),
			__memo(() => import('./nodes/10.js')),
			__memo(() => import('./nodes/11.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/.well-known/apple-app-site-association",
				pattern: /^\/\.well-known\/apple-app-site-association\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/.well-known/apple-app-site-association/_server.ts.js'))
			},
			{
				id: "/api/billing/cancel",
				pattern: /^\/api\/billing\/cancel\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/cancel/_server.ts.js'))
			},
			{
				id: "/api/billing/checkout",
				pattern: /^\/api\/billing\/checkout\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/checkout/_server.ts.js'))
			},
			{
				id: "/api/billing/fake-pay",
				pattern: /^\/api\/billing\/fake-pay\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/fake-pay/_server.ts.js'))
			},
			{
				id: "/api/billing/invoices",
				pattern: /^\/api\/billing\/invoices\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/invoices/_server.ts.js'))
			},
			{
				id: "/api/billing/me",
				pattern: /^\/api\/billing\/me\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/me/_server.ts.js'))
			},
			{
				id: "/api/billing/orders",
				pattern: /^\/api\/billing\/orders\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/orders/_server.ts.js'))
			},
			{
				id: "/api/billing/pause",
				pattern: /^\/api\/billing\/pause\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/pause/_server.ts.js'))
			},
			{
				id: "/api/billing/resume",
				pattern: /^\/api\/billing\/resume\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/resume/_server.ts.js'))
			},
			{
				id: "/api/billing/subscribe",
				pattern: /^\/api\/billing\/subscribe\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/subscribe/_server.ts.js'))
			},
			{
				id: "/api/billing/upgrade",
				pattern: /^\/api\/billing\/upgrade\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/billing/upgrade/_server.ts.js'))
			},
			{
				id: "/api/health/live",
				pattern: /^\/api\/health\/live\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/health/live/_server.ts.js'))
			},
			{
				id: "/api/health/ready",
				pattern: /^\/api\/health\/ready\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/health/ready/_server.ts.js'))
			},
			{
				id: "/api/health/status",
				pattern: /^\/api\/health\/status\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/health/status/_server.ts.js'))
			},
			{
				id: "/api/meta",
				pattern: /^\/api\/meta\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/meta/_server.ts.js'))
			},
			{
				id: "/api/names/check",
				pattern: /^\/api\/names\/check\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/names/check/_server.ts.js'))
			},
			{
				id: "/api/names/claim",
				pattern: /^\/api\/names\/claim\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/names/claim/_server.ts.js'))
			},
			{
				id: "/api/names/hold",
				pattern: /^\/api\/names\/hold\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/names/hold/_server.ts.js'))
			},
			{
				id: "/api/names/mine",
				pattern: /^\/api\/names\/mine\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/names/mine/_server.ts.js'))
			},
			{
				id: "/api/passkeys",
				pattern: /^\/api\/passkeys\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/passkeys/_server.ts.js'))
			},
			{
				id: "/api/pow/challenge",
				pattern: /^\/api\/pow\/challenge\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/pow/challenge/_server.ts.js'))
			},
			{
				id: "/api/webhooks/creem",
				pattern: /^\/api\/webhooks\/creem\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/webhooks/creem/_server.ts.js'))
			},
			{
				id: "/dashboard",
				pattern: /^\/dashboard\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/device",
				pattern: /^\/device\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/passkey/create",
				pattern: /^\/passkey\/create\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/purchase/checkout",
				pattern: /^\/purchase\/checkout\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/purchase/expired",
				pattern: /^\/purchase\/expired\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/purchase/fake-checkout",
				pattern: /^\/purchase\/fake-checkout\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/purchase/success",
				pattern: /^\/purchase\/success\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 10 },
				endpoint: null
			},
			{
				id: "/secure",
				pattern: /^\/secure\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 11 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
