import type { ApiError, HealthStatus } from '$lib/types.js'

export class ApiClientError extends Error {
	constructor(
		public status: number,
		public body: ApiError
	) {
		super(body.message)
	}
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
	const response = await fetch(`/api${path}`, {
		...options,
		headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
	})
	if (!response.ok) throw new ApiClientError(response.status, (await response.json()) as ApiError)
	return response.json() as Promise<T>
}

export const getHealth = () => api<HealthStatus>('/health/status')
