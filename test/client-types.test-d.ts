// The client helpers against Inertia's own React types
import { useForm } from '@inertiajs/react'
import type { UrlMethodPair } from '@inertiajs/core'
import { Elysia, t } from 'elysia'
import { createRoutes, type BodyOf, type PathsOf } from '../src/client'

const app = new Elysia()
	.get('/users', { query: t.Object({ page: t.Optional(t.Number()) }) }, () => 'users')
	.get('/users/:id', () => 'user')
	.post('/users', { body: t.Object({ name: t.String(), age: t.Number(), address: t.Object({ city: t.String() }) }) }, () => 'ok')

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

const { url, action } = createRoutes<typeof app>()

expect<Equal<PathsOf<typeof app, 'get'>, '/users' | '/users/:id'>>()
expect<Equal<BodyOf<typeof app, 'post', '/users'>, { name: string; age: number; address: { city: string } }>>()

url('/users', { query: { page: 2 } })
url('/users/:id', { params: { id: '1' } })
// @ts-expect-error unknown path
url('/user')
// @ts-expect-error query value of the wrong type
url('/users', { query: { page: 'two' } })
// @ts-expect-error unknown query key
url('/users', { query: { sort: 'name' } })
// @ts-expect-error missing params
url('/users/:id')
// @ts-expect-error there is no POST route at /users/:id
action('post', '/users/:id')

function Form() {
	const store = action('post', '/users')
	store satisfies UrlMethodPair

	const form = useForm(store.fields({ name: '', age: 0, address: { city: '' } }))
	form.data.address.city satisfies string
	form.errors.name satisfies string | undefined
	form.errors['address.city'] satisfies string | undefined
	// @ts-expect-error not a field of the body schema
	form.errors.nmae
	// @ts-expect-error wrong value type for a field
	form.setData('age', 'old')
	// @ts-expect-error missing a required field
	store.fields({ name: '', age: 0 })

	form.submit(store)
}
void Form
