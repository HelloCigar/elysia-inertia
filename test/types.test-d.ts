import { Elysia } from 'elysia'
import { inertia, type InertiaConfigOf, type InferPages, type PagePropsOf } from '../src'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

const app = new Elysia()
	.use(inertia({ share: () => ({ auth: { user: { id: 1, joined: new Date() } } }) }))
	.get('/users', { inertia: 'users/index' }, ({ render }) =>
		render({ users: [{ id: 1, name: 'a' }], total: async () => 3 })
	)
	.get('/posts/:id', ({ inertia, params }) =>
		inertia.render('posts/show', { id: params.id })
	)
	.get('/', { inertia: 'home' }, ({ render }) => render())
	.get('/api', () => ({ plain: true }))

type Pages = InferPages<typeof app>
expect<Equal<keyof Pages, 'users/index' | 'posts/show' | 'home'>>()
expect<Equal<PagePropsOf<typeof app, 'users/index'>, { users: { id: number; name: string }[]; total: number }>>()
expect<Equal<PagePropsOf<typeof app, 'posts/show'>, { id: string }>>()
expect<Equal<InertiaConfigOf<typeof app>['sharedPageProps'], { auth: { user: { id: number; joined: string } } }>>()

// @ts-expect-error not a page of this app
type Missing = PagePropsOf<typeof app, 'nope'>

// Serialization matches what JSON.stringify sends
import type { Serialized } from '../src'
expect<Equal<Serialized<{ a: (() => number)[]; m: Map<string, number>; d: Date }>, { a: number[]; m: {}; d: string }>>()
expect<Equal<Serialized<{ x: number | undefined; gone: undefined; f: () => Promise<{ y?: string }> }>, { x?: number; f: { y?: string } }>>()

// Lazy props are optional on the client; always props are not
import { always, defer, optional } from '../src'
const lazyApp = new Elysia()
	.use(inertia({ share: () => ({ csrf: always('t') }) }))
	.get('/d', { inertia: 'dashboard' }, ({ render }) =>
		render({
			users: [1],
			report: optional(() => 'big'),
			stats: defer(async () => ({ visits: 1 })),
			perms: defer(() => ['a']).rescue(),
			flags: always({ beta: true }),
			nested: { a: defer(() => 1), b: 2 }
		})
	)
expect<Equal<PagePropsOf<typeof lazyApp, 'dashboard'>, {
	users: number[]
	report?: string
	stats?: { visits: number }
	perms?: string[]
	flags: { beta: boolean }
	nested: { a?: number; b: number }
}>>()
expect<Equal<InertiaConfigOf<typeof lazyApp>['sharedPageProps'], { csrf: string }>>()

// Merge, once and scroll keep their value type; chaining defer() makes it optional
import { deepMerge, merge, once, prepend, scroll } from '../src'
const mergeApp = new Elysia()
	.use(inertia())
	.get('/f', { inertia: 'feed' }, ({ render }) =>
		render({
			feed: merge(() => [{ id: 1 }]).matchOn('id'),
			messages: prepend(['m']),
			settings: deepMerge(async () => ({ theme: 'dark' })),
			lookups: once(() => ({ roles: ['admin'] }), { ttl: 1000 }),
			users: scroll(() => ({ data: [{ id: 1 }], meta: { nextPage: 2 } })),
			posts: scroll(() => ({ data: ['p'] })).defer()
		})
	)
expect<Equal<PagePropsOf<typeof mergeApp, 'feed'>, {
	feed: { id: number }[]
	messages: string[]
	settings: { theme: string }
	lookups: { roles: string[] }
	users: { data: { id: number }[]; meta: { nextPage: number } }
	posts?: { data: string[] }
}>>()
