import type { AnySchema } from 'elysia'

/**
 * Route options for a form submission. The schema validates and types
 * `body`, types the route's body for the client, and adds `errors()` with
 * keys checked against its fields. Spread it to add other options
 *
 * ```ts
 * .put('/users/:id/email', formBody(t.Object({ email: t.String() })),
 *   ({ body, errors }) => errors({ email: 'Taken.' }).back())
 * ```
 */
export const formBody = <const Schema extends AnySchema>(schema: Schema) => ({
	body: schema,
	form: schema
})
