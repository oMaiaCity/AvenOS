import { GoldenInvoiceModel } from '../../services/actor-runner/tests/support/golden-document-model'

const encoder = new TextEncoder()

Bun.serve({
	port: 8090,
	fetch: async (request) => {
		const url = new URL(request.url)
		if (url.pathname === '/health') return Response.json({ status: 'ok' })
		if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions')
			return Response.json({ error: { message: 'not found' } }, { status: 404 })
		const body = (await request.json()) as {
			stream?: boolean
			model?: string
			messages?: Array<{ role?: string; content?: string | Array<{ type: string; text?: string }> }>
			response_format?: { json_schema?: { name?: string } }
		}
		if (body.model === 'e2e-document') {
			const name = body.response_format?.json_schema?.name
			const procedures = {
				analyze_page: 'analyze-page',
				classify_document: 'classify-document',
				extract_invoice: 'extract-invoice',
				extract_account_statement: 'extract-statement'
			} as const
			const procedure = procedures[name as keyof typeof procedures]
			if (!procedure)
				return Response.json(
					{ error: { message: 'Unknown document fixture procedure.' } },
					{ status: 400 }
				)
			const text = (body.messages ?? [])
				.flatMap((message) =>
					typeof message.content === 'string'
						? [message.content]
						: (message.content ?? [])
								.filter((part) => part.type === 'text')
								.map((part) => part.text ?? '')
				)
				.join('\n')
			const documentText = text.match(/<document_text>\s*([\s\S]*?)\s*<\/document_text>/)?.[1] ?? ''
			const marketInvoice =
				documentText.includes('SYNTHETIC / FIKTIV') &&
				documentText.includes('RE-DE-1001') &&
				documentText.includes('Musterwerk Bürobedarf GmbH')
			if (!documentText.includes('Synthetic test document') && !marketInvoice)
				return Response.json(
					{ error: { message: 'Only the explicit synthetic document fixtures are supported.' } },
					{ status: 400 }
				)
			const model = new GoldenInvoiceModel(
				documentText.includes('ACCOUNT STATEMENT') ? 'bank-statement' : 'invoice'
			)
			const response = await model.complete({
				procedure,
				prompt: '',
				schema: {},
				images: [],
				documentText
			})
			if (marketInvoice && procedure === 'extract-invoice') {
				const value = response.structured as Record<string, unknown>
				const candidate = value.candidate as Record<string, unknown>
				const details = value.details as Record<string, unknown>
				Object.assign(candidate, {
					supplier: 'Musterwerk Bürobedarf GmbH',
					invoiceNumber: 'RE-DE-1001',
					dueDate: '2026-09-15',
					summary: 'Synthetic office invoice RE-DE-1001 for EUR 119.00.'
				})
				details.issueDate = '2026-09-01'
				;(details.supplier as Record<string, unknown>).name = 'Musterwerk Bürobedarf GmbH'
			}
			const structured =
				procedure === 'analyze-page'
					? {
							...response.structured,
							text: documentText,
							blocks: [{ text: documentText, x: 50000, y: 50000, width: 900000, height: 850000 }]
						}
					: response.structured
			return Response.json({
				id: `document-e2e-${name}`,
				model: body.model,
				choices: [
					{
						message: { role: 'assistant', content: JSON.stringify(structured) },
						finish_reason: 'stop'
					}
				],
				usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }
			})
		}
		if (body.stream) {
			const lastUser = body.messages?.findLast((message) => message.role === 'user')?.content
			if (lastUser === 'Start E2E narrated answer') {
				let tail: ReturnType<typeof setTimeout> | undefined
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({ id: 'chat-e2e-slow', model: body.model, choices: [{ delta: { content: 'E2E narration begins. ' }, finish_reason: null }] })}\n\n`
							)
						)
						tail = setTimeout(() => {
							controller.enqueue(
								encoder.encode(
									`data: ${JSON.stringify({ id: 'chat-e2e-slow', model: body.model, choices: [{ delta: { content: 'E2E narration tail must be cancelled.' }, finish_reason: null }] })}\n\n`
								)
							)
							controller.enqueue(encoder.encode('data: [DONE]\n\n'))
							controller.close()
						}, 2_000)
					},
					cancel() {
						if (tail) clearTimeout(tail)
					}
				})
				return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
			}
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ id: 'chat-e2e', model: body.model, choices: [{ delta: { content: 'E2E chat reply.' }, finish_reason: null }] })}\n\n`
						)
					)
					controller.enqueue(encoder.encode('data: [DONE]\n\n'))
					controller.close()
				}
			})
			return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
		}
		return Response.json({
			id: 'completion-e2e',
			model: body.model,
			choices: [
				{ message: { role: 'assistant', content: 'E2E chat reply.' }, finish_reason: 'stop' }
			],
			usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 }
		})
	}
})
