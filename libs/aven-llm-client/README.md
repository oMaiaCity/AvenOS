# `@avenos/llm-client`

Provider- and transport-neutral contracts for clients of the authenticated Aven LLM
gateway.

The package defines model descriptors, capability names, multimodal messages,
structured-output requests, normalized responses and receipts, plus the minimal
`LlmGatewayClient` port:

```ts
interface LlmGatewayClient {
  discover(requiredCapabilities: string[]): Promise<LlmModelDescriptor[]>
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>
}
```

It contains no HTTP, authentication, Tauri, retry, model-selection, or task-specific
prompt logic. A browser, desktop, server, or test adapter implements the port and keeps
credentials in its own security boundary. Consumers use `supportsCapabilities` and a
stable model `id`; `label` is presentation text only.

The Tauri adapter remains in `app/src/lib/models/gateway.ts`. Document-specific model
selection and request construction live in `@avenos/document-ingest`.
