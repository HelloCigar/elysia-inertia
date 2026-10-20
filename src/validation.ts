import { ValidationError } from 'elysia'

interface ValidationIssue {
	path?: string
	message?: string
	schemaPath?: string
	params?: { requiredProperties?: string[] }
}

export const isValidationError = (error: unknown): error is ValidationError =>
	error instanceof ValidationError ||
	(typeof error === 'object' && error !== null && '~verr' in error)

/** Follow `#/properties/name/items` into the route schema */
const schemaAt = (schema: unknown, pointer: string | undefined) => {
	if (!pointer?.startsWith('#')) return

	let node = schema as Record<string, unknown> | undefined
	for (const segment of pointer.slice(1).split('/').filter(Boolean)) {
		if (typeof node !== 'object' || node === null) return
		node = node[decodeURIComponent(segment)] as Record<string, unknown>
	}

	return node
}

/** A schema's own `error` option, when it is a plain message */
const customMessage = (schema: unknown) => {
	const error = (schema as { error?: unknown } | undefined)?.error

	return typeof error === 'string' ? error : undefined
}

/**
 * Turn a failed request validation into Inertia's `{ field: message }`.
 * Keys use the client's dot paths (`address.city`, `tags.0`); the first
 * issue per field wins, and a schema's `error` option replaces the default
 */
export const validationErrors = (
	error: ValidationError
): Record<string, string> => {
	const errors: Record<string, string> = {}
	const add = (path: string, message: string) => {
		errors[path] ??= message
	}

	for (const issue of error.all as ValidationIssue[]) {
		// Elysia reports top-level issues at `root`
		const path = (issue.path ?? '').replace(/^root(\.|$)/, '')
		const missing = issue.params?.requiredProperties

		if (missing?.length) {
			for (const field of missing) {
				const fieldPath = path ? `${path}.${field}` : field
				const schema = schemaAt(
					error.schema,
					`${issue.schemaPath ?? '#'}/properties/${field}`
				)
				add(fieldPath, customMessage(schema) ?? 'This field is required.')
			}
			continue
		}

		add(
			path,
			customMessage(schemaAt(error.schema, issue.schemaPath)) ??
				issue.message ??
				'This value is invalid.'
		)
	}

	return errors
}
