import type {
	LlmCompletionRequest,
	LlmCompletionResponse,
	LlmModelDescriptor,
	OpenAiChatCompletionRequest
} from '@avenos/llm-client'
import { Channel, invoke } from '@tauri-apps/api/core'

export * from '@avenos/llm-client'

/** Returns every model containing all required capabilities, in operator order. */
export async function discoverLlmModels(
	requiredCapabilities: string[] = []
): Promise<LlmModelDescriptor[]> {
	const response = await invoke<{ models: LlmModelDescriptor[] }>('llm_model_list', {
		capabilities: requiredCapabilities
	})
	return response.models
}

/** Completes with the exact selected id; the gateway never silently substitutes a model. */
export function completeWithLlm(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
	return invoke<LlmCompletionResponse>('llm_complete', { request })
}

/**
 * Raw OpenAI-compatible request. `model` is an Aven catalog id; all other
 * standard/provider-compatible fields are transported unchanged.
 */
export function completeOpenAiChat<T extends Record<string, unknown> = Record<string, unknown>>(
	request: OpenAiChatCompletionRequest
): Promise<T> {
	return invoke<T>('llm_openai_complete', { request: { ...request, stream: false } })
}

/**
 * Streams raw OpenAI-compatible SSE text. This preserves reasoning deltas,
 * tool-call fragments, usage frames and provider extensions byte-for-byte.
 */
export async function* streamOpenAiChat(
	request: OpenAiChatCompletionRequest,
	signal?: AbortSignal
): AsyncGenerator<string> {
	const requestId = crypto.randomUUID()
	const chunks: string[] = []
	let settled = false
	let failure: unknown
	let wake: (() => void) | undefined
	const notify = () => {
		wake?.()
		wake = undefined
	}
	const channel = new Channel<string>((chunk) => {
		chunks.push(chunk)
		notify()
	})
	const completion = invoke<void>('llm_openai_stream', {
		requestId,
		request: { ...request, stream: true },
		onChunk: channel
	})
		.catch((error) => {
			failure = error
		})
		.finally(() => {
			settled = true
			notify()
		})
	const cancel = () => {
		void invoke('llm_openai_stream_cancel', { requestId }).catch(() => {})
	}
	if (signal?.aborted) cancel()
	else signal?.addEventListener('abort', cancel, { once: true })
	try {
		while (!settled || chunks.length > 0) {
			const chunk = chunks.shift()
			if (chunk !== undefined) {
				yield chunk
				continue
			}
			await new Promise<void>((resolve) => {
				wake = resolve
			})
		}
		await completion
		if (failure !== undefined && !signal?.aborted) throw failure
	} finally {
		signal?.removeEventListener('abort', cancel)
		if (!settled) cancel()
	}
}
