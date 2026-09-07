import terminalKitImport from 'terminal-kit'

interface FormResult {
	submit: string
	fields?: Record<string, unknown>
}

interface TerminalDocument {
	destroy(): void
	giveFocusTo(element: unknown): void
}

interface TerminalTextBox {
	setContent(content: string, hasMarkup?: boolean, dontDraw?: boolean): void
}

interface TerminalForm {
	on(event: 'submit', listener: (result: FormResult) => void): void
	getValue(): FormResult
	labeledInputs: Array<{
		on(event: 'submit', listener: () => void): void
		off(event: 'submit', listener: () => void): void
	}>
}

interface TerminalMultiMenu {
	on(
		event: 'submit',
		listener: (
			value: Record<string, boolean>,
			action?: unknown,
			menu?: unknown,
			button?: unknown
		) => void
	): void
	getValue(): Record<string, boolean>
}

interface TerminalApi {
	width: number
	height: number
	clear(): void
	hideCursor(hidden?: boolean): void
	grabInput(enabled: boolean | { mouse?: string }): void
	styleReset(): void
	on(event: 'key', listener: (key: string) => void): void
	off(event: 'key', listener: (key: string) => void): void
	createDocument(): TerminalDocument
}

interface TerminalKitApi {
	terminal: TerminalApi
	TextBox: new (options: Record<string, unknown>) => unknown
	Form: new (options: Record<string, unknown>) => TerminalForm
	ColumnMenuMulti: new (options: Record<string, unknown>) => TerminalMultiMenu
}

const terminalKit = terminalKitImport as unknown as TerminalKitApi

export interface TuiNavigationResult {
	direction: 'back' | 'next'
	value: string
}

export interface TuiField {
	key: string
	label: string
	initialValue?: string
	secret?: boolean
}

export interface TuiButton {
	content: string
	value: string
}

export interface TuiProgressUpdate {
	status: 'active' | 'complete'
	current: number
	total: number
	label: string
	detail?: string
}

export interface TuiProgress {
	current: number
	total: number
	stations?: readonly TuiStation[]
}

export interface TuiStation {
	chapter: string
	subchapter?: string
	item: string
}

export interface StationTreeRow {
	kind: 'chapter' | 'subchapter' | 'station' | 'ellipsis'
	index?: number
	label?: string
	current?: boolean
}

export const TUI_TEXT_INPUT_KEY_BINDINGS = { ENTER: 'submit', KP_ENTER: 'submit' } as const
export const TUI_PROGRESS_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

export function progressChipText(label: string, frame: number): string {
	const normalizedFrame = Math.abs(frame) % TUI_PROGRESS_FRAMES.length
	return ` ${TUI_PROGRESS_FRAMES[normalizedFrame]} ${cleanLine(label)} `
}

export function navigationButtons(allowBack: boolean): TuiButton[] {
	return [
		{ content: 'Next >', value: 'next' },
		...(allowBack ? [{ content: '< Back', value: 'back' }] : [])
	]
}

export function choiceButtons(options: TuiButton[], allowBack: boolean): TuiButton[] {
	return [...options, ...(allowBack ? [{ content: '< Back', value: 'back' }] : [])]
}

export function addChapterEvidence(existing: readonly string[], message: string): string[] {
	const normalized = cleanLine(message)
	if (!normalized) return [...existing]
	return [...existing.filter((entry) => entry !== normalized), normalized].slice(-3)
}

export function isProviderNameLine(value: string): boolean {
	return /^(Description|Name):\s+\S/.test(value)
}

export function stationTreeRows(
	stations: readonly TuiStation[],
	current: number,
	maxRows: number
): StationTreeRow[] {
	if (!Number.isSafeInteger(current) || current < 1 || current > stations.length)
		throw new Error('Current station is out of range.')
	if (!Number.isSafeInteger(maxRows) || maxRows < 5)
		throw new Error('Station rail needs at least five rows.')
	const currentStation = stations[current - 1] as TuiStation
	const rows: StationTreeRow[] = []
	let previousChapter: string | undefined
	let previousSubchapter: string | undefined
	for (const [index, station] of stations.entries()) {
		if (station.chapter !== previousChapter) {
			rows.push({
				kind: 'chapter',
				label: station.chapter,
				current: station.chapter === currentStation.chapter
			})
			previousChapter = station.chapter
			previousSubchapter = undefined
		}
		if (station.subchapter && station.subchapter !== previousSubchapter) {
			rows.push({
				kind: 'subchapter',
				label: station.subchapter,
				current:
					station.chapter === currentStation.chapter &&
					station.subchapter === currentStation.subchapter
			})
			previousSubchapter = station.subchapter
		}
		rows.push({
			kind: 'station',
			index: index + 1,
			label: station.item,
			current: index + 1 === current
		})
	}
	if (rows.length <= maxRows) return rows

	const currentRow = rows.findIndex((row) => row.kind === 'station' && row.current)
	let chapterRow = currentRow
	let subchapterRow: number | undefined
	for (let index = currentRow; index >= 0; index -= 1) {
		if (subchapterRow === undefined && rows[index]?.kind === 'subchapter') subchapterRow = index
		if (rows[index]?.kind === 'chapter') {
			chapterRow = index
			break
		}
	}
	const contextStart = subchapterRow ?? chapterRow
	const contextPrefix = contextStart === chapterRow ? [] : [rows[chapterRow] as StationTreeRow]
	const hasTop = contextStart > 0
	const available = maxRows - (hasTop ? 1 : 0) - 1
	let body = [
		...contextPrefix,
		...rows.slice(contextStart, contextStart + available - contextPrefix.length)
	]
	if (!body.some((row) => row.kind === 'station' && row.current)) {
		const required = [...contextPrefix, rows[contextStart] as StationTreeRow]
		const stationCapacity = Math.max(1, available - required.length)
		const stationStart = Math.max(contextStart + 1, currentRow - Math.floor(stationCapacity / 2))
		body = [...required, ...rows.slice(stationStart, stationStart + stationCapacity)]
	}
	const lastVisible = rows.indexOf(body.at(-1) as StationTreeRow)
	const hasBottom = lastVisible < rows.length - 1
	return [
		...(hasTop ? [{ kind: 'ellipsis' } as StationTreeRow] : []),
		...body,
		...(hasBottom ? [{ kind: 'ellipsis' } as StationTreeRow] : [])
	]
}

function truncateTerminalText(value: string, width: number): string {
	if (value.length <= width) return value
	return `${value.slice(0, Math.max(1, width - 1))}…`
}

export class TuiInterruptedError extends Error {
	constructor() {
		super('interrupted')
		this.name = 'TuiInterruptedError'
	}
}

function cleanLine(value: string): string {
	return value.replaceAll(/[\r\n\t]+/g, ' ').trim()
}

export function wrapTerminalText(value: string, width: number): string[] {
	if (!Number.isSafeInteger(width) || width < 10)
		throw new Error('Terminal text width is too small.')
	const lines: string[] = []
	for (const source of value.split('\n')) {
		let remaining = source.trimEnd()
		if (!remaining) {
			lines.push('')
			continue
		}
		while (remaining.length > width) {
			const candidate = remaining.slice(0, width + 1)
			const breakAt = candidate.lastIndexOf(' ')
			const take = breakAt > 0 ? breakAt : width
			lines.push(remaining.slice(0, take).trimEnd())
			remaining = remaining.slice(take).trimStart()
		}
		lines.push(remaining)
	}
	return lines
}

export class BootstrapTui {
	readonly #terminal = terminalKit.terminal
	#chapter = 'Welcome'
	#title = 'avenOS deployment bootstrap'
	#context = ''
	#progress = ''
	#progressDetails: TuiProgress | undefined
	#evidence = new Map<string, string[]>()
	#feedback:
		| {
				chapter: string
				title: string
				message: string
				tone: 'info' | 'error'
		  }
		| undefined
	#active = false
	#activeDocument: TerminalDocument | undefined

	isSupported(): boolean {
		return this.#terminal.width >= 60 && this.#terminal.height >= 20
	}

	setContext(
		chapter: string,
		title: string,
		context: string,
		progress: TuiProgress | undefined = undefined
	): void {
		const nextChapter = cleanLine(chapter) || 'Setup'
		const nextTitle = cleanLine(title) || 'avenOS deployment bootstrap'
		if (
			this.#feedback &&
			(this.#feedback.chapter !== nextChapter || this.#feedback.title !== nextTitle)
		)
			this.#feedback = undefined
		this.#chapter = nextChapter
		this.#title = nextTitle
		this.#context = context.trim()
		this.#progress = progress ? `Step ${progress.current} of ${progress.total}` : ''
		this.#progressDetails = progress
	}

	status(
		message: string,
		tone: 'info' | 'success' | 'error' = 'info',
		chapter = this.#chapter
	): void {
		const normalized = cleanLine(message)
		if (!normalized) return
		if (tone === 'success') {
			this.#evidence.set(chapter, addChapterEvidence(this.#evidence.get(chapter) ?? [], normalized))
			this.#feedback = undefined
			return
		}
		this.#feedback = { chapter: this.#chapter, title: this.#title, message: normalized, tone }
	}

	async navigate(input: {
		label: string
		initialValue?: string
		secret?: boolean
		allowBack?: boolean
	}): Promise<TuiNavigationResult> {
		const result = await this.navigateFields({
			label: input.label,
			fields: [
				{
					key: 'answer',
					label: '> ',
					initialValue: input.initialValue,
					secret: input.secret
				}
			],
			allowBack: input.allowBack
		})
		return {
			direction: result.direction,
			value: result.values.answer ?? ''
		}
	}

	async navigateFields(input: {
		label: string
		fields: readonly TuiField[]
		allowBack?: boolean
	}): Promise<{ direction: 'back' | 'next'; values: Record<string, string> }> {
		const result = await this.#showForm({
			label: input.label,
			inputs: input.fields.map((field) => ({
				key: field.key,
				label: field.label,
				content: field.secret ? '' : (field.initialValue ?? ''),
				hiddenContent: Boolean(field.secret)
			})),
			buttons: navigationButtons(Boolean(input.allowBack)),
			help:
				input.fields.length > 1
					? 'Enter moves to the next field, then saves · Tab cycles · Ctrl+C cancels'
					: 'Enter saves and advances · Tab cycles through Back/Next · Ctrl+C cancels'
		})
		return {
			direction: result.submit === 'back' ? 'back' : 'next',
			values: Object.fromEntries(
				Object.entries(result.fields ?? {}).map(([key, value]) => [
					key,
					typeof value === 'string' ? value.trim() : ''
				])
			)
		}
	}

	async chooseMany(input: {
		label: string
		options: Array<{ label: string; value: string }>
		selected: readonly string[]
		allowBack?: boolean
	}): Promise<{ direction: 'back' | 'next'; values: string[] }> {
		if (this.#active) throw new Error('The terminal form is already active.')
		this.#active = true
		const terminal = this.#terminal
		terminal.clear()
		terminal.hideCursor(true)
		terminal.grabInput(true)
		const document = terminal.createDocument()
		this.#activeDocument = document
		const width = Math.max(40, Math.min(100, terminal.width - 4))
		const x = Math.max(2, Math.floor((terminal.width - width) / 2) + 1)
		new terminalKit.TextBox({
			parent: document,
			x,
			y: 2,
			width,
			height: 1,
			content: `avenOS setup  ·  ${this.#chapter}${this.#progress ? `  ·  ${this.#progress}` : ''}`,
			attr: { color: 'brightCyan', bold: true }
		})
		new terminalKit.TextBox({
			parent: document,
			x,
			y: 3,
			width,
			height: 1,
			content: ` ${truncateTerminalText(this.#title, width - 2)} `,
			attr: { color: 'black', bgColor: 'brightCyan', bold: true }
		})
		const bodyLines = wrapTerminalText(this.#context, width)
		const bodyHeight = Math.max(2, Math.min(terminal.height - 13, bodyLines.length))
		bodyLines.slice(0, bodyHeight).forEach((line, offset) => {
			new terminalKit.TextBox({
				parent: document,
				x,
				y: 5 + offset,
				width,
				height: 1,
				content: line,
				attr: { color: 'white' }
			})
		})
		const menuY = 6 + bodyHeight
		new terminalKit.TextBox({
			parent: document,
			x,
			y: menuY,
			width,
			height: 1,
			content: input.label,
			attr: { color: 'brightWhite', bold: true }
		})
		const menu = new terminalKit.ColumnMenuMulti({
			parent: document,
			x,
			y: menuY + 2,
			width,
			value: Object.fromEntries(input.selected.map((value) => [value, true])),
			items: [
				...input.options.map((option) => ({
					content: `☐ ${option.label}`,
					turnedOffBlurContent: `☐ ${option.label}`,
					turnedOffFocusContent: `☐ ${option.label}`,
					turnedOnBlurContent: `☑ ${option.label}`,
					turnedOnFocusContent: `☑ ${option.label}`,
					key: option.value
				})),
				{ type: 'button', content: 'Next >', value: 'next' },
				...(input.allowBack ? [{ type: 'button', content: '< Back', value: 'back' }] : [])
			]
		})
		new terminalKit.TextBox({
			parent: document,
			x,
			y: Math.min(terminal.height - 1, menuY + input.options.length + 4),
			width,
			height: 1,
			content: 'Arrow keys move · Enter checks or continues · Ctrl+C cancels',
			attr: { color: 'gray' }
		})
		return await new Promise((resolve, reject) => {
			let settled = false
			const finish = (callback: () => void) => {
				if (settled) return
				settled = true
				terminal.off('key', onKey)
				document.destroy()
				this.#activeDocument = undefined
				terminal.grabInput(false)
				terminal.hideCursor(false)
				terminal.styleReset()
				this.#active = false
				callback()
			}
			const onKey = (key: string) => {
				if (key === 'CTRL_C' || key === 'ESCAPE') finish(() => reject(new TuiInterruptedError()))
			}
			terminal.on('key', onKey)
			menu.on('submit', (value, _action, _menu, button) => {
				const submitted = button as { def?: { value?: string } } | undefined
				const direction = submitted?.def?.value === 'back' ? 'back' : 'next'
				finish(() =>
					resolve({
						direction,
						values: Object.entries(value)
							.filter(([, enabled]) => enabled)
							.map(([key]) => key)
					})
				)
			})
			document.giveFocusTo(menu)
		})
	}

	async choose(input: {
		label: string
		options: Array<{ label: string; value: string }>
		allowBack?: boolean
	}): Promise<string> {
		const result = await this.#showForm({
			label: input.label,
			inputs: [],
			buttons: choiceButtons(
				input.options.map((option) => ({ content: option.label, value: option.value })),
				Boolean(input.allowBack)
			),
			help: 'Tab/arrow keys choose · Enter selects · Ctrl+C cancels'
		})
		return result.submit
	}

	async acknowledge(label = 'Continue'): Promise<void> {
		await this.choose({ label: '', options: [{ label, value: 'continue' }] })
	}

	async ask(input: { label: string; defaultValue?: string; secret?: boolean }): Promise<string> {
		const result = await this.#showForm({
			label: input.label,
			inputs: [
				{
					key: 'answer',
					label: '> ',
					content: input.secret ? '' : (input.defaultValue ?? ''),
					hiddenContent: Boolean(input.secret)
				}
			],
			buttons: [{ content: 'Confirm', value: 'confirm' }],
			help: 'Type the exact choice · Enter confirms · Ctrl+C cancels'
		})
		return result.fields?.answer?.trim() || input.defaultValue || ''
	}

	async progress<T>(
		label: string,
		action: (update: (event: TuiProgressUpdate) => void) => Promise<T>,
		onInterrupt?: () => void
	): Promise<T> {
		if (this.#active) throw new Error('The terminal form is already active.')
		this.#active = true
		const terminal = this.#terminal
		terminal.clear()
		terminal.hideCursor(true)
		terminal.grabInput(true)
		const document = terminal.createDocument()
		this.#activeDocument = document
		const width = Math.max(40, Math.min(100, terminal.width - 4))
		const x = Math.max(2, Math.floor((terminal.width - width) / 2) + 1)
		new terminalKit.TextBox({
			parent: document,
			x,
			y: 2,
			width,
			height: 1,
			content: `avenOS setup  ·  ${this.#chapter}${this.#progress ? `  ·  ${this.#progress}` : ''}`,
			attr: { color: 'brightCyan', bold: true }
		})
		new terminalKit.TextBox({
			parent: document,
			x,
			y: 3,
			width,
			height: 1,
			content: ` ${truncateTerminalText(this.#title, width - 2)} `,
			attr: { color: 'black', bgColor: 'brightCyan', bold: true }
		})
		const contextLines = wrapTerminalText(this.#context, width).slice(0, 4)
		if (contextLines.length > 0)
			new terminalKit.TextBox({
				parent: document,
				x,
				y: 5,
				width,
				height: contextLines.length,
				content: contextLines.join('\n'),
				attr: { color: 'white' }
			})
		const activityY = 6 + contextLines.length
		const summary = new terminalKit.TextBox({
			parent: document,
			x,
			y: activityY,
			width,
			height: 1,
			content: 'Starting…',
			attr: { color: 'cyan', bold: true }
		}) as TerminalTextBox
		const historyHeight = Math.max(3, Math.min(8, terminal.height - activityY - 6))
		const history = new terminalKit.TextBox({
			parent: document,
			x,
			y: activityY + 2,
			width,
			height: historyHeight,
			content: '',
			attr: { color: 'brightGreen' }
		}) as TerminalTextBox
		let frame = 0
		let currentLabel = label
		let currentDetail = ''
		let current = 0
		let total = 0
		const completed: string[] = []
		const startedAt = Date.now()
		const chipWidth = width
		const progress = new terminalKit.TextBox({
			parent: document,
			x,
			y: activityY + historyHeight + 3,
			width: chipWidth,
			height: 2,
			content: truncateTerminalText(progressChipText(label, frame), chipWidth),
			attr: { color: 'white', bgColor: 'gray', bold: true }
		}) as TerminalTextBox
		const render = () => {
			const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
			const elapsedText = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
			summary.setContent(
				truncateTerminalText(
					total > 0
						? `Overall ${Math.min(current, total)} of ${total}  ·  ${elapsedText}`
						: `Working  ·  ${elapsedText}`,
					width
				)
			)
			history.setContent(
				completed
					.slice(-historyHeight)
					.map((entry) => truncateTerminalText(entry, width))
					.join('\n')
			)
			progress.setContent(
				[
					truncateTerminalText(progressChipText(currentLabel, frame), chipWidth),
					...(currentDetail ? [truncateTerminalText(`  ${currentDetail}`, chipWidth)] : [])
				].join('\n')
			)
		}
		const update = (event: TuiProgressUpdate) => {
			current = event.current
			total = event.total
			currentLabel = event.label
			currentDetail = event.detail ?? ''
			if (event.status === 'complete') {
				const line = `✓ ${event.label}${event.detail ? ` — ${event.detail}` : ''}`
				if (completed.at(-1) !== line) completed.push(line)
			}
			render()
		}
		const interval = setInterval(() => {
			frame = (frame + 1) % TUI_PROGRESS_FRAMES.length
			render()
		}, 90)
		let interrupt: ((error: Error) => void) | undefined
		const interrupted = new Promise<never>((_resolve, reject) => {
			interrupt = reject
		})
		const onKey = (key: string) => {
			if (key !== 'CTRL_C' && key !== 'ESCAPE') return
			onInterrupt?.()
			interrupt?.(new TuiInterruptedError())
		}
		terminal.on('key', onKey)
		try {
			return await Promise.race([action(update), interrupted])
		} finally {
			clearInterval(interval)
			terminal.off('key', onKey)
			document.destroy()
			this.#activeDocument = undefined
			terminal.grabInput(false)
			terminal.hideCursor(false)
			terminal.styleReset()
			this.#active = false
		}
	}

	async #showForm(input: {
		label: string
		inputs: Array<Record<string, unknown>>
		buttons: Array<{ content: string; value: string }>
		help: string
	}): Promise<FormResult> {
		if (this.#active) throw new Error('The terminal form is already active.')
		this.#active = true
		const terminal = this.#terminal
		terminal.clear()
		terminal.hideCursor(true)
		const document = terminal.createDocument()
		this.#activeDocument = document
		const stations = this.#progressDetails?.stations
		const showStationRail = Boolean(stations?.length) && terminal.width >= 118
		const stationWidth = showStationRail ? Math.min(38, Math.floor(terminal.width / 4)) : 0
		const width = Math.max(
			40,
			Math.min(100, terminal.width - (showStationRail ? stationWidth + 8 : 4))
		)
		const x = showStationRail ? 3 : Math.max(2, Math.floor((terminal.width - width) / 2) + 1)
		const bodyLines = wrapTerminalText(this.#context, width)
		const evidenceLines = (this.#evidence.get(this.#chapter) ?? []).flatMap((entry) =>
			wrapTerminalText(entry, width)
		)
		const feedbackLines = this.#feedback ? wrapTerminalText(this.#feedback.message, width) : []
		const reserved =
			12 +
			Math.min(evidenceLines.length, 3) +
			Math.min(feedbackLines.length, 2) +
			(evidenceLines.length ? 1 : 0)
		const bodyHeight = Math.max(2, Math.min(terminal.height - reserved, bodyLines.length))
		const visibleBody = bodyLines.slice(0, bodyHeight)
		if (bodyLines.length > bodyHeight)
			visibleBody[bodyHeight - 1] = '… Resize the terminal to show the remaining details.'

		new terminalKit.TextBox({
			parent: document,
			x,
			y: 2,
			width,
			height: 1,
			content: `avenOS setup  ·  ${this.#chapter}${this.#progress ? `  ·  ${this.#progress}` : ''}`,
			attr: { color: 'brightCyan', bold: true }
		})
		new terminalKit.TextBox({
			parent: document,
			x,
			y: 3,
			width,
			height: 1,
			content: ` ${truncateTerminalText(this.#title, width - 2)} `,
			attr: { color: 'black', bgColor: 'brightCyan', bold: true }
		})
		visibleBody.forEach((line, offset) => {
			new terminalKit.TextBox({
				parent: document,
				x,
				y: 5 + offset,
				width,
				height: 1,
				content: line,
				attr: isProviderNameLine(line) ? { color: 'brightWhite', bold: true } : { color: 'white' }
			})
		})
		let y = 5 + bodyHeight
		const visibleEvidence = evidenceLines.slice(-3)
		if (visibleEvidence.length > 0) {
			new terminalKit.TextBox({
				parent: document,
				x,
				y,
				width,
				height: 1,
				content: 'Verified in this chapter',
				attr: { color: 'cyan', bold: true }
			})
			y += 1
			new terminalKit.TextBox({
				parent: document,
				x,
				y,
				width,
				height: visibleEvidence.length,
				content: visibleEvidence.join('\n'),
				attr: { color: 'brightGreen' }
			})
			y += visibleEvidence.length + 1
		}
		const visibleFeedback = feedbackLines.slice(-2)
		if (visibleFeedback.length > 0) {
			new terminalKit.TextBox({
				parent: document,
				x,
				y,
				width,
				height: visibleFeedback.length,
				content: visibleFeedback.join('\n'),
				attr: { color: this.#feedback?.tone === 'error' ? 'brightRed' : 'yellow' }
			})
			y += visibleFeedback.length + 1
		}
		if (input.label) {
			new terminalKit.TextBox({
				parent: document,
				x,
				y,
				width,
				height: 2,
				content: wrapTerminalText(input.label, width).slice(0, 2).join('\n'),
				attr: { color: 'brightWhite', bold: true }
			})
			y += 2
		}
		const form = new terminalKit.Form({
			parent: document,
			x,
			y,
			width,
			textInputKeyBindings: TUI_TEXT_INPUT_KEY_BINDINGS,
			inputs: input.inputs,
			buttons: input.buttons
		})
		new terminalKit.TextBox({
			parent: document,
			x,
			y: Math.min(terminal.height - 1, y + input.inputs.length + 2),
			width,
			height: 1,
			content: input.help,
			attr: { color: 'gray' }
		})

		if (showStationRail && stations && this.#progressDetails) {
			const stationX = x + width + 3
			const railRows = stationTreeRows(
				stations,
				this.#progressDetails.current,
				Math.max(5, terminal.height - 5)
			)
			new terminalKit.TextBox({
				parent: document,
				x: stationX,
				y: 2,
				width: stationWidth,
				height: 1,
				content: 'SETUP',
				attr: { color: 'cyan', bold: true }
			})
			railRows.forEach((station, offset) => {
				const content = (() => {
					if (station.kind === 'ellipsis') return '  ⋮'
					if (station.kind === 'chapter') return station.label ?? ''
					if (station.kind === 'subchapter') return `  ${station.label ?? ''}`
					return `    ${station.current ? '●' : '○'} ${String(station.index).padStart(2)}  ${station.label ?? ''}`
				})()
				const attr =
					station.kind === 'chapter'
						? { color: station.current ? 'brightCyan' : 'brightWhite', bold: true }
						: station.kind === 'subchapter'
							? { color: station.current ? 'cyan' : 'gray', bold: Boolean(station.current) }
							: station.current
								? { color: 'brightCyan', bold: true }
								: { color: 'gray' }
				new terminalKit.TextBox({
					parent: document,
					x: stationX,
					y: 4 + offset,
					width: stationWidth,
					height: 1,
					content: truncateTerminalText(content, stationWidth),
					attr
				})
			})
		}

		return await new Promise<FormResult>((resolve, reject) => {
			let settled = false
			const inputSubmitHandlers: Array<() => void> = []
			const finish = (callback: () => void) => {
				if (settled) return
				settled = true
				terminal.off('key', onKey)
				form.labeledInputs.forEach((field, index) => {
					field.off('submit', inputSubmitHandlers[index] as () => void)
				})
				document.destroy()
				this.#activeDocument = undefined
				terminal.grabInput(false)
				terminal.hideCursor(false)
				terminal.styleReset()
				this.#active = false
				callback()
			}
			const onKey = (key: string) => {
				if (key === 'CTRL_C' || key === 'ESCAPE') finish(() => reject(new TuiInterruptedError()))
			}
			terminal.on('key', onKey)
			form.labeledInputs.forEach((field, index) => {
				const onInputSubmit = () => {
					const nextField = form.labeledInputs[index + 1]
					if (nextField) {
						document.giveFocusTo(nextField)
						return
					}
					finish(() =>
						resolve({
							...form.getValue(),
							submit: input.buttons[0]?.value ?? 'next'
						})
					)
				}
				inputSubmitHandlers[index] = onInputSubmit
				field.on('submit', onInputSubmit)
			})
			form.on('submit', (result) => finish(() => resolve(result)))
			document.giveFocusTo(form)
		})
	}

	close(): void {
		this.#activeDocument?.destroy()
		this.#activeDocument = undefined
		this.#active = false
		this.#terminal.grabInput(false)
		this.#terminal.hideCursor(false)
		this.#terminal.styleReset()
	}
}
