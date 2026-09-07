
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/.well-known" | "/.well-known/apple-app-site-association" | "/.well-known/assetlinks.json" | "/api" | "/api/artifacts" | "/api/artifacts/client-runs" | "/api/artifacts/client-runs/[publicationId]" | "/api/artifacts/files" | "/api/artifacts/files/[publicationId]" | "/api/artifacts/[artifactId]" | "/api/artifacts/[artifactId]/content" | "/api/artifacts/[artifactId]/evidence" | "/api/artifacts/[artifactId]/processing" | "/api/billing" | "/api/billing/cancel" | "/api/billing/checkout" | "/api/billing/fake-pay" | "/api/billing/invoices" | "/api/billing/me" | "/api/billing/orders" | "/api/billing/pause" | "/api/billing/resume" | "/api/billing/subscribe" | "/api/health" | "/api/health/live" | "/api/health/ready" | "/api/health/status" | "/api/intents" | "/api/intents/[intentId]" | "/api/intents/[intentId]/[action]" | "/api/llm" | "/api/llm/completions" | "/api/llm/models" | "/api/llm/v1" | "/api/llm/v1/chat" | "/api/llm/v1/chat/completions" | "/api/llm/v1/models" | "/api/meta" | "/api/names" | "/api/names/check" | "/api/names/claim" | "/api/names/hold" | "/api/names/mine" | "/api/passkeys" | "/api/pow" | "/api/pow/challenge" | "/api/sites" | "/api/sites/[siteId]" | "/api/webhooks" | "/api/webhooks/polar" | "/dashboard" | "/device" | "/internal" | "/internal/v1" | "/internal/v1/artifact-processing" | "/internal/v1/artifact-processing/tenants" | "/internal/v1/intents" | "/internal/v1/intents/tenants" | "/internal/v1/static-sites" | "/internal/v1/static-sites/bindings" | "/internal/v1/static-sites/status" | "/login" | "/passkey" | "/passkey/create" | "/purchase" | "/purchase/checkout" | "/purchase/expired" | "/purchase/fake-checkout" | "/purchase/success" | "/secure" | "/sites";
		RouteParams(): {
			"/api/artifacts/client-runs/[publicationId]": { publicationId: string };
			"/api/artifacts/files/[publicationId]": { publicationId: string };
			"/api/artifacts/[artifactId]": { artifactId: string };
			"/api/artifacts/[artifactId]/content": { artifactId: string };
			"/api/artifacts/[artifactId]/evidence": { artifactId: string };
			"/api/artifacts/[artifactId]/processing": { artifactId: string };
			"/api/intents/[intentId]": { intentId: string };
			"/api/intents/[intentId]/[action]": { intentId: string; action: string };
			"/api/sites/[siteId]": { siteId: string }
		};
		LayoutParams(): {
			"/": { publicationId?: string | undefined; artifactId?: string | undefined; intentId?: string | undefined; action?: string | undefined; siteId?: string | undefined };
			"/.well-known": Record<string, never>;
			"/.well-known/apple-app-site-association": Record<string, never>;
			"/.well-known/assetlinks.json": Record<string, never>;
			"/api": { publicationId?: string | undefined; artifactId?: string | undefined; intentId?: string | undefined; action?: string | undefined; siteId?: string | undefined };
			"/api/artifacts": { publicationId?: string | undefined; artifactId?: string | undefined };
			"/api/artifacts/client-runs": { publicationId?: string | undefined };
			"/api/artifacts/client-runs/[publicationId]": { publicationId: string };
			"/api/artifacts/files": { publicationId?: string | undefined };
			"/api/artifacts/files/[publicationId]": { publicationId: string };
			"/api/artifacts/[artifactId]": { artifactId: string };
			"/api/artifacts/[artifactId]/content": { artifactId: string };
			"/api/artifacts/[artifactId]/evidence": { artifactId: string };
			"/api/artifacts/[artifactId]/processing": { artifactId: string };
			"/api/billing": Record<string, never>;
			"/api/billing/cancel": Record<string, never>;
			"/api/billing/checkout": Record<string, never>;
			"/api/billing/fake-pay": Record<string, never>;
			"/api/billing/invoices": Record<string, never>;
			"/api/billing/me": Record<string, never>;
			"/api/billing/orders": Record<string, never>;
			"/api/billing/pause": Record<string, never>;
			"/api/billing/resume": Record<string, never>;
			"/api/billing/subscribe": Record<string, never>;
			"/api/health": Record<string, never>;
			"/api/health/live": Record<string, never>;
			"/api/health/ready": Record<string, never>;
			"/api/health/status": Record<string, never>;
			"/api/intents": { intentId?: string | undefined; action?: string | undefined };
			"/api/intents/[intentId]": { intentId: string; action?: string | undefined };
			"/api/intents/[intentId]/[action]": { intentId: string; action: string };
			"/api/llm": Record<string, never>;
			"/api/llm/completions": Record<string, never>;
			"/api/llm/models": Record<string, never>;
			"/api/llm/v1": Record<string, never>;
			"/api/llm/v1/chat": Record<string, never>;
			"/api/llm/v1/chat/completions": Record<string, never>;
			"/api/llm/v1/models": Record<string, never>;
			"/api/meta": Record<string, never>;
			"/api/names": Record<string, never>;
			"/api/names/check": Record<string, never>;
			"/api/names/claim": Record<string, never>;
			"/api/names/hold": Record<string, never>;
			"/api/names/mine": Record<string, never>;
			"/api/passkeys": Record<string, never>;
			"/api/pow": Record<string, never>;
			"/api/pow/challenge": Record<string, never>;
			"/api/sites": { siteId?: string | undefined };
			"/api/sites/[siteId]": { siteId: string };
			"/api/webhooks": Record<string, never>;
			"/api/webhooks/polar": Record<string, never>;
			"/dashboard": Record<string, never>;
			"/device": Record<string, never>;
			"/internal": Record<string, never>;
			"/internal/v1": Record<string, never>;
			"/internal/v1/artifact-processing": Record<string, never>;
			"/internal/v1/artifact-processing/tenants": Record<string, never>;
			"/internal/v1/intents": Record<string, never>;
			"/internal/v1/intents/tenants": Record<string, never>;
			"/internal/v1/static-sites": Record<string, never>;
			"/internal/v1/static-sites/bindings": Record<string, never>;
			"/internal/v1/static-sites/status": Record<string, never>;
			"/login": Record<string, never>;
			"/passkey": Record<string, never>;
			"/passkey/create": Record<string, never>;
			"/purchase": Record<string, never>;
			"/purchase/checkout": Record<string, never>;
			"/purchase/expired": Record<string, never>;
			"/purchase/fake-checkout": Record<string, never>;
			"/purchase/success": Record<string, never>;
			"/secure": Record<string, never>;
			"/sites": Record<string, never>
		};
		Pathname(): "/" | "/.well-known/apple-app-site-association" | "/.well-known/assetlinks.json" | "/api/artifacts" | `/api/artifacts/client-runs/${string}` & {} | `/api/artifacts/files/${string}` & {} | `/api/artifacts/${string}` & {} | `/api/artifacts/${string}/content` & {} | `/api/artifacts/${string}/evidence` & {} | `/api/artifacts/${string}/processing` & {} | "/api/billing/cancel" | "/api/billing/checkout" | "/api/billing/fake-pay" | "/api/billing/invoices" | "/api/billing/me" | "/api/billing/orders" | "/api/billing/pause" | "/api/billing/resume" | "/api/billing/subscribe" | "/api/health/live" | "/api/health/ready" | "/api/health/status" | "/api/intents" | `/api/intents/${string}` & {} | `/api/intents/${string}/${string}` & {} | "/api/llm/completions" | "/api/llm/models" | "/api/llm/v1/chat/completions" | "/api/llm/v1/models" | "/api/meta" | "/api/names/check" | "/api/names/claim" | "/api/names/hold" | "/api/names/mine" | "/api/passkeys" | "/api/pow/challenge" | "/api/sites" | `/api/sites/${string}` & {} | "/api/webhooks/polar" | "/dashboard" | "/device" | "/internal/v1/artifact-processing/tenants" | "/internal/v1/intents/tenants" | "/internal/v1/static-sites/bindings" | "/internal/v1/static-sites/status" | "/login" | "/passkey/create" | "/purchase/checkout" | "/purchase/expired" | "/purchase/fake-checkout" | "/purchase/success" | "/secure" | "/sites";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/aven-logo.svg" | "/email/aven-logo.png" | "/favicon.svg" | string & {};
	}
}