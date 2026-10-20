// formBody(): one schema validates the body, types it for the handler and
// the client, and keys errors()
import { Elysia, t } from 'elysia'
import { formBody, inertia } from '../src'
import type { BodyOf } from '../src/client'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

const app = new Elysia()
	.use(inertia())
	.post(
		'/users',
		formBody(t.Object({ email: t.String(), address: t.Object({ city: t.String() }) })),
		({ body, errors }) => {
			body.email satisfies string
			body.address.city satisfies string
			// @ts-expect-error not a field of the schema
			body.emial
			errors({ email: 'Taken.', 'address.city': 'Unknown.' }, 'createUser')
			// @ts-expect-error misspelt field
			errors({ emial: 'Taken.' })
			// @ts-expect-error messages are strings
			errors({ email: 1 })
			return errors({ email: 'Taken.' }).back()
		}
	)
	// Spread to add other route options
	.put('/users/:id', { ...formBody(t.Object({ age: t.Number() })), detail: { summary: 'Update' } }, ({ body, errors }) => {
		body.age satisfies number
		// @ts-expect-error not a field of the schema
		errors({ email: 'x' })
		return errors({ age: 'Too young.' }).back()
	})

expect<Equal<BodyOf<typeof app, 'post', '/users'>, { email: string; address: { city: string } }>>()
expect<Equal<BodyOf<typeof app, 'put', '/users/:id'>, { age: number }>>()
