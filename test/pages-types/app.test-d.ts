import type { SharedPageProps } from '@inertiajs/core'
import { Elysia } from 'elysia'
import { always, defer, inertia, merge, once, optional, scroll, type InertiaConfigOf, type PageProps } from 'elysia-inertia'
import type { PageName } from 'elysia-inertia/client'

// Register as a real app does: the pages read shared props through it, while
// the routes are typed by the pages. The two must not form a type cycle
declare module 'elysia-inertia' {
	interface Register {
		app: typeof app
	}
}

declare module '@inertiajs/core' {
	interface InertiaConfig extends InertiaConfigOf {}
}

const users = [{ id: 1, name: 'Ada', joined: '2026-01-01' }]
const filters = { search: null, role: 'admin' }

const app = new Elysia()
	.use(inertia({ share: () => ({ appName: 'demo' }) }))
	.get('/', { inertia: 'home' }, ({ render }) => render({ message: 'Ready' }))
	.get('/about', { inertia: 'about' }, ({ render }) => render())
	.get('/users', { inertia: 'users/index' }, ({ render }) =>
		render({ users, total: 1, filters })
	)
	.get('/users/:id', ({ inertia }) => inertia.render('users/show', { user: { id: 1 } }))
	.get('/settings', { inertia: 'settings' }, ({ render }) => render({ anything: new Date() }))

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

expect<Equal<PageName, 'about' | 'home' | 'settings' | 'users/index' | 'users/show'>>()
expect<Equal<PageProps<'home'>, { message: string }>>()
expect<Equal<PageProps<'about'>, {}>>()
expect<Equal<PageProps<'users/show'>, { user: { id: number }; range?: [string, number] }>>()
expect<Equal<SharedPageProps, { appName: string }>>()

const pages = new Elysia().use(inertia({ share: () => ({ appName: 'demo' }) }))

// Names
// @ts-expect-error no page file for this name
pages.get('/gone', { inertia: 'users/edit' }, ({ render }) => render())
// @ts-expect-error no page file for this name
pages.get('/typo', ({ inertia }) => inertia.render('user/index'))

// Missing, mistyped and excess props, with the macro and the context API
// @ts-expect-error message is required
pages.get('/', { inertia: 'home' }, ({ render }) => render())
// @ts-expect-error message is required
pages.get('/', { inertia: 'home' }, ({ render }) => render({}))
// @ts-expect-error message is a string
pages.get('/', { inertia: 'home' }, ({ render }) => render({ message: 1 }))
// @ts-expect-error the page doesn't declare it
pages.get('/', { inertia: 'home' }, ({ render }) => render({ message: 'x', passwordHash: 'x' }))
// @ts-expect-error message is required
pages.get('/', ({ inertia }) => inertia.render('home'))
// @ts-expect-error the page doesn't declare it
pages.get('/', ({ inertia }) => inertia.render('home', { message: 'x', extra: 1 }))
// @ts-expect-error a page without props takes none
pages.get('/', ({ inertia }) => inertia.render('about', { x: 1 }))
// Destructured render is checked the same way
pages.get('/', ({ inertia: { render } }) => render('home', { message: 'x' }))
// @ts-expect-error message is required
pages.get('/', ({ inertia: { render } }) => render('home'))
// @ts-expect-error class component props are checked too
pages.get('/', ({ inertia }) => inertia.render('users/show', { user: { id: '1' } }))

// Only the client's own types pass: a Date is not the string the page gets
// @ts-expect-error a Date for a string prop
pages.get('/', { inertia: 'users/index' }, ({ render }) => render({ users: [{ id: 1, name: 'a', joined: new Date() }], total: 1, filters }))

// Functions and promises resolve, also nested and inside arrays
pages.get('/', { inertia: 'users/index' }, ({ render }) =>
	render({
		users: async () => users,
		total: () => 1,
		filters: { search: Promise.resolve(null), role: () => 'admin' }
	})
)
pages.get('/', { inertia: 'users/index' }, ({ render }) =>
	// @ts-expect-error a function's result is checked too
	render({ users, total: async () => 'one', filters })
)

// Lazy helpers only where the page lets the prop be missing
pages.get('/', { inertia: 'users/index' }, ({ render }) =>
	render({
		users: merge(() => users).matchOn('id'),
		total: always(1),
		filters: { search: null, role: optional(() => 'admin') },
		stats: defer(async () => ({ visits: 1 }))
	})
)
pages.get('/', { inertia: 'users/index' }, ({ render }) =>
	// @ts-expect-error users is required, so it can't be deferred
	render({ users: defer(() => users), total: 1, filters })
)
pages.get('/', { inertia: 'users/index' }, ({ render }) =>
	// @ts-expect-error a helper's value is checked too
	render({ users: once(() => [{ id: '1' }]), total: 1, filters })
)
pages.get('/', { inertia: 'users/index' }, ({ render }) =>
	render({ users: scroll(() => users), total: 1, filters, stats: optional(() => ({ visits: 2 })) })
)

// Shared props and errors are not required, but a shared one can be overridden
pages.get('/', { inertia: 'users/index' }, ({ render }) => render({ users, total: 1, filters, appName: 'other' }))
// @ts-expect-error an override must still match the page
pages.get('/', { inertia: 'users/index' }, ({ render }) => render({ users, total: 1, filters, appName: 2 }))
// Without the shared prop configured, the page's appName is required
// @ts-expect-error appName is required
new Elysia().use(inertia()).get('/', { inertia: 'users/index' }, ({ render }) => render({ users, total: 1, filters }))

// A shared prop covers a page prop only when it always provides a type the page accepts
// @ts-expect-error appName is shared as a number, so the page's string is still required
new Elysia().use(inertia({ share: () => ({ appName: 1 }) })).get('/', { inertia: 'users/index' }, ({ render }) => render({ users, total: 1, filters }))
// @ts-expect-error a lazy shared prop may be missing, so it doesn't cover it
new Elysia().use(inertia({ share: () => ({ appName: optional(() => 'demo') }) })).get('/', { inertia: 'users/index' }, ({ render }) => render({ users, total: 1, filters }))
new Elysia().use(inertia({ share: () => ({ appName: always('demo') }) })).get('/', { inertia: 'users/index' }, ({ render }) => render({ users, total: 1, filters }))

// Tuples keep their length and positions
pages.get('/', { inertia: 'users/show' }, ({ render }) => render({ user: { id: 1 }, range: ['a', () => 2] }))
// @ts-expect-error a tuple's length is checked
pages.get('/', { inertia: 'users/show' }, ({ render }) => render({ user: { id: 1 }, range: ['a'] }))
// @ts-expect-error and its positions
pages.get('/', { inertia: 'users/show' }, ({ render }) => render({ user: { id: 1 }, range: [2, 'a'] }))

// A page `tsc` can't read takes any props
pages.get('/', ({ inertia }) => inertia.render('settings'))

export { app }
