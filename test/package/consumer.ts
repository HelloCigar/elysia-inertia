// Resolve the public exports and emitted declarations, without source aliases.
import { Elysia, t } from 'elysia'
import { inertia, type PageProps } from 'elysia-inertia'
import { createRoutes } from 'elysia-inertia/client'
import { buildPage } from 'elysia-inertia/internal'
import { inertiaPages } from 'elysia-inertia/vite'

declare module 'elysia-inertia' {
	interface Register { app: typeof app }
	interface InertiaPages { 'users/index': { users: { id: number; name: string }[] } }
}

const app = new Elysia()
	.use(inertia())
	.get('/users', { inertia: 'users/index' }, ({ render }) =>
		render({ users: [{ id: 1, name: 'Ada' }] }))
	.post('/users', { body: t.Object({ name: t.String() }) }, () => 'ok')

const routes = createRoutes()
routes.url('/users')
routes.action('post', '/users').fields({ name: 'Ada' })
// @ts-expect-error unknown route
routes.url('/missing')
// @ts-expect-error body must match the schema
routes.action('post', '/users').fields({ name: 123 })

const props: PageProps<'users/index'> = { users: [{ id: 1, name: 'Ada' }] }
// @ts-expect-error the page declares users
new Elysia().use(inertia()).get('/', { inertia: 'users/index' }, ({ render }) => render({ posts: [] }))
// @ts-expect-error unknown page
type Missing = PageProps<'missing'>

void [props, buildPage, inertiaPages]
