import {
	type DocumentLlmClient,
	LlmDocumentModelGateway as HeadlessDocumentModelGateway
} from '@avenos/document-ingest/llm-gateway'
import { completeWithLlm, discoverLlmModels } from '$lib/models/gateway'

const defaultClient: DocumentLlmClient = {
	discover: discoverLlmModels,
	complete: completeWithLlm
}

/** Desktop adapter which supplies the Tauri-backed authenticated LLM client. */
export class LlmDocumentModelGateway extends HeadlessDocumentModelGateway {
	constructor(preferredModelId?: string, client: DocumentLlmClient = defaultClient) {
		super(client, preferredModelId)
	}
}

export type { DocumentLlmClient } from '@avenos/document-ingest/llm-gateway'
export { documentLlmRequest } from '@avenos/document-ingest/llm-gateway'
