// inertia.errors() keys checked against the route's body
import { Elysia, t } from 'elysia'
import { inertia, type FieldPath, type FormErrors } from '../src'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

type Body = {
	name: string
	address?: { city: string; zip: string | null }
	tags: string[]
	avatar?: File
	joined: Date
}
expect<Equal<
	FieldPath<Body>,
	'name' | 'address' | 'address.city' | 'address.zip' | 'tags' | `tags.${number}` | 'avatar' | 'joined'
>>()
expect<Equal<FieldPath<Record<string, unknown>>, string>>()
expect<Equal<FormErrors, Partial<Record<string, string>>>>()

new Elysia()
	.use(inertia())
	.post(
		'/users',
		{ body: t.Object({ email: t.String(), address: t.Object({ city: t.String() }) }) },
		({ inertia, body }) => {
			inertia.errors<typeof body>({ email: 'Taken.', 'address.city': 'Unknown.' }, 'createUser')
			// @ts-expect-error misspelt field
			inertia.errors<typeof body>({ emial: 'Taken.' })
			// @ts-expect-error messages are strings
			inertia.errors<typeof body>({ email: 1 })
			// Without the body type any key goes
			return inertia.errors({ anything: 'ok' }).back()
		}
	)
