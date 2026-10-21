import { Elysia } from 'elysia'
import { inertia, type InertiaConfigOf } from '../src'

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

expect<Equal<InertiaConfigOf<typeof app>['sharedPageProps'], { auth: { user: { id: number; joined: string } } }>>()

// Serialization matches what JSON.stringify sends
import type { Serialized } from '../src'
expect<Equal<Serialized<{ a: (() => number)[]; m: Map<string, number>; d: Date }>, { a: number[]; m: {}; d: string }>>()
expect<Equal<Serialized<{ x: number | undefined; gone: undefined; f: () => Promise<{ y?: string }> }>, { x?: number; f: { y?: string } }>>()

// Lazy props are optional on the client; always props are not
import { always, defer, optional } from '../src'
expect<Equal<
	Serialized<{ report: ReturnType<typeof optional<string>>; stats: ReturnType<typeof defer<{ visits: number }>>; flags: ReturnType<typeof always<boolean>> }>,
	{ report?: string; stats?: { visits: number }; flags: boolean }
>>()
const lazyApp = new Elysia().use(inertia({ share: () => ({ csrf: always('t') }) }))
expect<Equal<InertiaConfigOf<typeof lazyApp>['sharedPageProps'], { csrf: string }>>()

// Destructured from the context, the helpers keep their types
new Elysia().use(inertia()).get('/stats', ({ inertia: { render, defer, always } }) => {
	const props = { visits: defer(() => 1), csrf: always('t') }
	expect<Equal<Serialized<typeof props>, { visits?: number; csrf: string }>>()
	return render('stats', props)
})
