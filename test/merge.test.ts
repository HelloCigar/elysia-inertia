import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { deepMerge, defer, inertia, merge, once, optional, prepend, scroll } from '../src'

const calls: string[] = []
const track = <T>(name: string, value: T) => () => {
	calls.push(name)
	return value
}

const app = new Elysia()
	.use(inertia({ version: 'v1', onRescue: () => {} }))
	.get('/feed', { inertia: 'feed' }, ({ render }) =>
		render({
			feed: merge(track('feed', [{ id: 3 }])).matchOn('id'),
			messages: prepend(() => ['newest']),
			settings: deepMerge(() => ({ theme: { mode: 'dark' } })),
			tags: merge(() => ['a']).matchOn('slug', 'lang'),
			later: defer(() => [1]).merge(),
			gone: defer(() => {
				throw new Error('down')
			})
				.merge()
				.rescue(),
			lookups: once(track('lookups', { roles: ['admin'] }), { expiresAt: 1718700000000 }),
			countries: once(track('countries', ['NL']), { key: 'geo.countries' }),
			plans: once(track('plans', ['pro'])).fresh(),
			flags: optional(() => ['x']).once(),
			users: scroll(
				track('users', { data: [{ id: 1 }], meta: { currentPage: 2, nextPage: 3, previousPage: 1 } })
			).matchOn('id'),
			posts: scroll(() => ({ items: ['p'], cursor: 'abc' }), {
				pageName: 'cursor',
				dataKey: 'items',
				cursor: (value) => ({ currentPage: value.cursor, nextPage: null, previousPage: null })
			}).defer()
		})
	)

const get = async (headers: Record<string, string> = {}) => {
	calls.length = 0
	const res = await app.handle(
		new Request('http://localhost/feed', { headers: { 'x-inertia': 'true', 'x-inertia-version': 'v1', ...headers } })
	)
	return res.json()
}
const partial = (headers: Record<string, string>) => get({ 'x-inertia-partial-component': 'feed', ...headers })

describe('merge props (spec 14)', () => {
	it('labels each mergeable prop in one direction array, plus matchPropsOn', async () => {
		const page = await get()
		// Deferred merge/scroll props are labelled on the full visit too (spec 16)
		expect(page.mergeProps).toEqual(['feed', 'tags', 'later', 'gone', 'users.data', 'posts.items'])
		expect(page.prependProps).toEqual(['messages'])
		expect(page.deepMergeProps).toEqual(['settings'])
		expect(page.matchPropsOn).toEqual(['feed.id', 'tags.slug', 'tags.lang', 'users.data.id'])
		expect(page.props.feed).toEqual([{ id: 3 }])
		expect(page.deferredProps).toEqual({ default: ['later', 'gone', 'posts'] })
	})

	it('sends a reset prop unlabeled so the client replaces it', async () => {
		const page = await partial({ 'x-inertia-partial-data': 'feed,messages', 'x-inertia-reset': 'feed' })
		expect(page.props.feed).toEqual([{ id: 3 }])
		expect(page.mergeProps).toBeUndefined()
		expect(page.matchPropsOn).toBeUndefined()
		expect(page.prependProps).toEqual(['messages'])
	})

	it('labels per response: only props present in a partial reload', async () => {
		const page = await partial({ 'x-inertia-partial-data': 'later' })
		expect(page.mergeProps).toEqual(['later'])
		expect(page.props.later).toEqual([1])
		expect(page.prependProps).toBeUndefined()
	})

	it('drops the labels of a rescued deferred merge prop', async () => {
		const page = await partial({ 'x-inertia-partial-data': 'gone,later' })
		expect(page.rescuedProps).toEqual(['gone'])
		expect(page.mergeProps).toEqual(['later'])
	})
})

describe('once props (spec 15)', () => {
	it('resolves and labels once props on a first visit', async () => {
		const page = await get()
		expect(page.props.lookups).toEqual({ roles: ['admin'] })
		expect(page.onceProps).toEqual({
			lookups: { prop: 'lookups', expiresAt: 1718700000000 },
			'geo.countries': { prop: 'countries', expiresAt: null },
			plans: { prop: 'plans', expiresAt: null }
		})
	})

	it('skips held once props on a full visit but still emits their metadata', async () => {
		const page = await get({ 'x-inertia-except-once-props': 'lookups,geo.countries' })
		expect('lookups' in page.props).toBe(false)
		expect('countries' in page.props).toBe(false)
		expect(calls).not.toContain('lookups')
		expect(calls).not.toContain('countries')
		expect(page.onceProps.lookups).toEqual({ prop: 'lookups', expiresAt: 1718700000000 })
		expect(page.onceProps['geo.countries']).toEqual({ prop: 'countries', expiresAt: null })
	})

	it('sends a fresh() once prop even when the client holds it', async () => {
		const page = await get({ 'x-inertia-except-once-props': 'plans' })
		expect(page.props.plans).toEqual(['pro'])
	})

	it('ignores the except-once header on a partial reload', async () => {
		const page = await partial({ 'x-inertia-partial-data': 'lookups', 'x-inertia-except-once-props': 'lookups' })
		expect(page.props.lookups).toEqual({ roles: ['admin'] })
		expect(page.onceProps).toEqual({ lookups: { prop: 'lookups', expiresAt: 1718700000000 } })
	})

	it('does not label a lazy once prop that is not sent', async () => {
		const page = await get()
		expect(page.onceProps.flags).toBeUndefined()
		const fetched = await partial({ 'x-inertia-partial-data': 'flags' })
		expect(fetched.onceProps).toEqual({ flags: { prop: 'flags', expiresAt: null } })
	})

	it('computes expiresAt from a ttl', async () => {
		const ttlApp = new Elysia()
			.use(inertia())
			.get('/', { inertia: 'p' }, ({ render }) => render({ x: once(() => 1, { ttl: 60_000 }) }))
		const before = Date.now()
		const page = await (await ttlApp.handle(new Request('http://localhost/', { headers: { 'x-inertia': 'true' } }))).json()
		expect(page.onceProps.x.expiresAt).toBeGreaterThanOrEqual(before + 60_000)
		expect(page.onceProps.x.expiresAt).toBeLessThanOrEqual(Date.now() + 60_000)
	})
})

describe('infinite scroll (spec 16)', () => {
	it('labels the data array and emits a cursor', async () => {
		const page = await get()
		expect(page.props.users).toEqual({ data: [{ id: 1 }], meta: { currentPage: 2, nextPage: 3, previousPage: 1 } })
		expect(page.scrollProps).toEqual({ users: { pageName: 'page', currentPage: 2, nextPage: 3, previousPage: 1, reset: false } })
	})

	it('re-emits labels and cursor on every page, prepending on that intent', async () => {
		const page = await partial({ 'x-inertia-partial-data': 'users', 'x-inertia-infinite-scroll-merge-intent': 'prepend' })
		expect(page.prependProps).toEqual(['users.data'])
		expect(page.mergeProps).toBeUndefined()
		expect(page.matchPropsOn).toEqual(['users.data.id'])
		expect(page.scrollProps.users.nextPage).toBe(3)
	})

	it('on reset: no labels and reset: true', async () => {
		const page = await partial({ 'x-inertia-partial-data': 'users', 'x-inertia-reset': 'users' })
		expect(page.mergeProps).toBeUndefined()
		expect(page.matchPropsOn).toBeUndefined()
		expect(page.scrollProps.users.reset).toBe(true)
	})

	it('a deferred scroll prop: labels but no cursor on the full visit, cursor when fetched', async () => {
		const page = await get()
		expect(page.mergeProps).toContain('posts.items')
		expect(page.deferredProps.default).toContain('posts')
		expect(page.scrollProps.posts).toBeUndefined()

		const fetched = await partial({ 'x-inertia-partial-data': 'posts' })
		expect(fetched.props.posts).toEqual({ items: ['p'], cursor: 'abc' })
		expect(fetched.mergeProps).toEqual(['posts.items'])
		expect(fetched.scrollProps).toEqual({ posts: { pageName: 'cursor', currentPage: 'abc', nextPage: null, previousPage: null, reset: false } })
	})
})
