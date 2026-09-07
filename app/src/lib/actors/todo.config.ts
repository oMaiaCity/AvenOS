import type { Manifest } from './actor'
import { loadMachine } from './machine'
import todoMachineSource from './todo-machine.pl?raw'
import { composeTodoProgram } from './views/todo/logic'
import { todoStyle } from './views/todo/style'
import { todoBoardView, todoListView } from './views/todo/view'

/**
 * The todo actor as DATA — the whole manifest (tools, views, machine-injected
 * logic) is a config value, not a class. A generic actor consumes it; nothing
 * about "todo" lives in code. This is the "author once" keystone (0143): the
 * SAME `.pl` gates the sandbox AND draws the canvas, and the actor around it
 * is now data too. Add a new skill by adding a config, not a subclass.
 */

export type TodoStatus = 'open' | 'doing' | 'done'

export interface Spark {
	id: string
	name: string
	color: string
}

export const SPARKS: Spark[] = [
	{ id: 'me', name: 'Me', color: 'var(--color-info)' },
	{ id: 'team', name: 'Team', color: 'var(--color-quiet)' }
]

export interface Todo {
	id: string
	title: string
	status: TodoStatus
	spark: string
}

const SPARK_PARAM = {
	type: 'string',
	enum: SPARKS.map((s) => s.id),
	description:
		'The spark (context). OMIT this unless the user explicitly names one — ' +
		'without it the currently ACTIVE spark applies, which is almost always ' +
		'right. "me" = personal, "team" = shared.'
}

const IDS_PARAM = {
	type: 'array',
	items: { type: 'string' },
	description: 'One or more ids, exactly as todo_list returned them.'
}

/** The machine (todo-machine.pl) injected into the sandbox program as data. */
const todoProgram = composeTodoProgram(loadMachine(todoMachineSource))

export const todoConfig: Manifest = {
	id: 'todo',
	authority: 'ceo.aven',
	namespace: 'productivity.todos',
	version: '1',
	name: 'Todos',
	description:
		'Keeps the task list: create, change status, delete, show. Every task ' +
		'belongs to exactly one spark and has one of three statuses.',
	tags: ['todo'],
	// Actor-level contracts come from the machine (`produces(todo(T)).` in
	// the .pl) — one SSOT for flow AND interface.
	machine: todoMachineSource,
	logic: todoProgram,
	view: todoListView,
	style: todoStyle,
	views: [{ key: 'board', name: 'Kanban Board', view: todoBoardView }],
	methods: [
		{
			name: 'todo_list',
			description:
				'Returns every task with id, status and spark — across all sparks. Call this ' +
				'before talking about the list, and always before changing or deleting ' +
				'anything — you need the ids.',
			parameters: { type: 'object', properties: {} },
			event: { send: 'LIST' }
		},
		{
			name: 'todo_create',
			description:
				'Creates one or more new tasks. Multiple tasks always go in one single ' +
				'call, never one after another.',
			parameters: {
				type: 'object',
				properties: {
					titles: {
						type: 'array',
						items: { type: 'string' },
						description: 'The titles, short, in the language the user spoke.'
					},
					tags: {
						type: 'array',
						items: { type: 'string' },
						description: 'Short lowercase tags, e.g. ["household", "urgent"].'
					},
					due: {
						type: 'object',
						description:
							'When it is due: {date} for one datetime (ISO), or {start, end} for a range.',
						properties: {
							date: { type: 'string' },
							start: { type: 'string' },
							end: { type: 'string' }
						}
					},
					responsible: {
						type: 'string',
						description: 'The person responsible, by name — "me" if the user themself.'
					},
					spark: SPARK_PARAM
				},
				required: ['titles']
			},
			produces: ['todo(T)'],
			event: { send: 'CREATE' }
		},
		{
			name: 'todo_update',
			description:
				'Changes one or more tasks — status or title. Every task meant goes in one ' +
				'call. "already did it" and "that is done" mean status=done, not delete. ' +
				'"just starting" and "working on it" mean status=in_progress.',
			parameters: {
				type: 'object',
				properties: {
					ids: IDS_PARAM,
					status: {
						type: 'string',
						enum: ['open', 'in_progress', 'done'],
						description: 'The new status of the tasks.'
					},
					done: {
						type: 'boolean',
						description: 'Shorthand: true = done, false = open. status wins.'
					},
					title: {
						type: 'string',
						description: 'The new title. Only sensible with exactly one id.'
					},
					tags: {
						type: 'array',
						items: { type: 'string' },
						description: 'Short lowercase tags, e.g. ["household", "urgent"].'
					},
					due: {
						type: 'object',
						description:
							'When it is due: {date} for one datetime (ISO), or {start, end} for a range.',
						properties: {
							date: { type: 'string' },
							start: { type: 'string' },
							end: { type: 'string' }
						}
					},
					responsible: {
						type: 'string',
						description: 'The person responsible, by name — "me" if the user themself.'
					},
					spark: SPARK_PARAM
				},
				required: ['ids']
			},
			event: { send: 'UPDATE' }
		},
		{
			name: 'todo_delete',
			description:
				'Deletes one or more tasks irreversibly. Only when someone explicitly asks ' +
				'to delete, remove or strike. Having finished something is no reason — that ' +
				'is todo_update with status=done. When in doubt, check off.',
			parameters: {
				type: 'object',
				properties: { ids: IDS_PARAM },
				required: ['ids']
			},
			event: { send: 'DELETE' }
		},
		{
			name: 'todo_show',
			description:
				'Switches the active spark: "show my list" means spark=me, "show the team ' +
				'tasks" means spark=team. Changes no data. The SHAPE (list or board) has its ' +
				'own windows: list_window_toggle and board_window_toggle.',
			parameters: {
				type: 'object',
				properties: {
					spark: SPARK_PARAM
				},
				required: ['spark']
			},
			event: { send: 'SHOW' }
		},
		{
			name: 'todo_clear_done',
			description: 'Deletes every already-done task of the active spark at once. No ids needed.',
			parameters: { type: 'object', properties: {} },
			event: { send: 'CLEAR_DONE' }
		}
	]
}
