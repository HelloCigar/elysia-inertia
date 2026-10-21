// Typed redirects from InertiaRoutes, inside the registered app's own
// handlers (separate program, since augmentations are global)
import { Elysia, t } from 'elysia'
import { inertia } from 'elysia-inertia'

declare module 'elysia-inertia' {
	interface Register {
		app: typeof app
	}
}

declare const returnTo: string

export const app = new Elysia()
	.use(inertia())
	.get('/users', () => 'users')
	.get('/users/:id', () => 'user')
	.get('/posts/:id?', () => 'posts')
	.get('/files/*', () => 'file')
	.post('/users', { body: t.Object({ name: t.String() }) }, ({ inertia }) =>
		inertia.redirect('/users/:id', { params: { id: 1 }, query: { tab: 'info' } })
	)
	.put('/users/:id', ({ inertia, params }) => inertia.redirect('/users/:id', { params }))
	.delete('/users/:id', ({ inertia: { redirect } }) => redirect('/users'))
	.post('/login', ({ inertia }) => inertia.redirect(returnTo))
	.post('/posts', ({ inertia }) => {
		inertia.redirect('/posts/:id?')
		inertia.redirect('/posts/:id?', { params: { id: 2 } })
		inertia.redirect('/files/*', { params: { '*': 'a/b' } })
		const id = 1 as number
		inertia.redirect(`/users/${id}`)
		inertia.redirect(`/users/${String(id)}?tab=info`)
		// @ts-expect-error a route without params takes none
		inertia.redirect('/users', { params: { bogus: 1 } })
		// @ts-expect-error not a route
		inertia.redirect('/userz')
		// @ts-expect-error missing params
		inertia.redirect('/users/:id')
		// @ts-expect-error wrong param name
		inertia.redirect('/users/:id', { params: { userId: 1 } })
		// @ts-expect-error not a GET route
		inertia.redirect('/login')
		return inertia.back()
	})

type IsAny<T> = 0 extends 1 & T ? true : false
const notAny: IsAny<typeof app> = false
const notAnyRoutes: IsAny<(typeof app)['~Routes']> = false
