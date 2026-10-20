import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { always, defer, inertia, optional } from '../src'

const calls: string[] = []
const track = <T>(name: string, value: T) => () => {
	calls.push(name)
	return value
}

const rescued: [string, string][] = []
const app = new Elysia()
	.use(
		inertia({
			version: 'v1',
			share: () => ({ auth: { user: track('auth.user', { name: 'Ada' }), csrf: always('token') } }),
			onRescue: (error, path) => rescued.push([path, (error as Error).message])
		})
	)
	.get('/dashboard', { inertia: 'dashboard' }, ({ render }) =>
		render({
			users: track('users', [1, 2]),
			flags: always(track('flags', { beta: true })),
			report: optional(track('report', 'big')),
			stats: defer(track('stats', { visits: 10 })),
			chart: defer(track('chart', [3]), 'charts'),
			perms: defer(() => {
				throw new Error('perms down')
			})
				.rescue(),
			broken: defer(() => {
				throw new Error('not rescued')
			}, 'risky'),
			nested: { a: track('nested.a', 1), b: track('nested.b', 2) }
		})
	)

const get = async (headers: Record<string, string> = {}) => {
	calls.length = 0
	rescued.length = 0
	const res = await app.handle(
		new Request('http://localhost/dashboard', {
			headers: { 'x-inertia': 'true', 'x-inertia-version': 'v1', ...headers }
		})
	)
	return { res, page: res.status === 200 ? await res.json() : undefined }
}

const partial = (data: Record<string, string>) => get({ 'x-inertia-partial-component': 'dashboard', ...data })

describe('full visit (spec 10a)', () => {
	it('sends eager and always props, skips optional, announces deferred by group', async () => {
		const { page } = await get()
		expect(page.props).toEqual({
			errors: {},
			auth: { user: { name: 'Ada' }, csrf: 'token' },
			users: [1, 2],
			flags: { beta: true },
			nested: { a: 1, b: 2 }
		})
		expect(page.deferredProps).toEqual({ default: ['stats', 'perms'], charts: ['chart'], risky: ['broken'] })
		expect('rescuedProps' in page).toBe(false)
	})

	it('never evaluates lazy props on a full visit', async () => {
		await get()
		expect(calls.sort()).toEqual(['auth.user', 'flags', 'nested.a', 'nested.b', 'users'])
	})
})

describe('partial reload (spec 9, 10b)', () => {
	it('sends only the requested props plus always props, and no deferredProps', async () => {
		const { page } = await partial({ 'x-inertia-partial-data': 'users' })
		expect(page.props).toEqual({ errors: {}, auth: { csrf: 'token' }, users: [1, 2], flags: { beta: true } })
		expect('deferredProps' in page).toBe(false)
		expect(calls.sort()).toEqual(['flags', 'users'])
	})

	it('resolves optional and deferred props when asked for', async () => {
		const { page } = await partial({ 'x-inertia-partial-data': 'report,stats,chart' })
		expect(page.props.report).toBe('big')
		expect(page.props.stats).toEqual({ visits: 10 })
		expect(page.props.chart).toEqual([3])
		expect('users' in page.props).toBe(false)
	})

	it('excludes with except, but never always props', async () => {
		const { page } = await partial({ 'x-inertia-partial-except': 'users,flags,auth,nested,perms,broken' })
		expect(page.props).toEqual({ errors: {}, auth: { csrf: 'token' }, flags: { beta: true }, report: 'big', stats: { visits: 10 }, chart: [3] })
	})

	it('applies except on top of only', async () => {
		const { page } = await partial({ 'x-inertia-partial-data': 'users,report', 'x-inertia-partial-except': 'report' })
		expect(Object.keys(page.props).sort()).toEqual(['auth', 'errors', 'flags', 'users'])
	})

	it('picks nested paths with dot notation', async () => {
		const { page } = await partial({ 'x-inertia-partial-data': 'nested.b,auth.user' })
		expect(page.props.nested).toEqual({ b: 2 })
		expect(page.props.auth).toEqual({ user: { name: 'Ada' }, csrf: 'token' })
		expect(calls).not.toContain('nested.a')
	})

	it('includes a whole container when its parent path is requested', async () => {
		const { page } = await partial({ 'x-inertia-partial-data': 'nested' })
		expect(page.props.nested).toEqual({ a: 1, b: 2 })
	})

	it('treats a partial reload for another component as a full visit', async () => {
		const { page } = await get({ 'x-inertia-partial-component': 'other', 'x-inertia-partial-data': 'users' })
		expect(page.props.nested).toEqual({ a: 1, b: 2 })
		expect(page.deferredProps).toBeDefined()
	})

	it('ignores partial headers on a non-Inertia request', async () => {
		calls.length = 0
		const res = await app.handle(
			new Request('http://localhost/dashboard', { headers: { 'x-inertia-partial-component': 'dashboard', 'x-inertia-partial-data': 'users' } })
		)
		const html = await res.text()
		const page = JSON.parse(html.match(/data-page="app">(.*?)<\/script>/s)![1]!)
		expect(page.props.nested).toEqual({ a: 1, b: 2 })
		expect(page.deferredProps).toBeDefined()
	})
})

describe('rescued deferred props (spec 13)', () => {
	it('omits a failed rescuable prop, lists it in rescuedProps and reports it', async () => {
		const { res, page } = await partial({ 'x-inertia-partial-data': 'perms,stats' })
		expect(res.status).toBe(200)
		expect('perms' in page.props).toBe(false)
		expect(page.props.stats).toEqual({ visits: 10 })
		expect(page.rescuedProps).toEqual(['perms'])
		expect(rescued).toEqual([['perms', 'perms down']])
	})

	it('fails the response for a deferred prop without rescue', async () => {
		const { res } = await partial({ 'x-inertia-partial-data': 'broken' })
		expect(res.status).toBe(500)
	})
})

describe('review fixes (step 3)', () => {
	const fixApp = new Elysia()
		.use(inertia({ version: 'v1' }))
		.get('/always-nested', { inertia: 'p' }, ({ render }) => render({ nested: always({ inner: defer(() => 9) }) }))
		.get('/array', { inertia: 'p' }, ({ render }) => render({ arr: [defer(() => 1)] }))
		.get('/fn', { inertia: 'p' }, ({ render }) => render({ fn: () => ({ z: optional(1) }) }))
		.get('/errors', { inertia: 'p' }, ({ render }) => render({ errors: { name: 'required' }, users: [1], other: 2 }))

	const headers = { 'x-inertia': 'true', 'x-inertia-version': 'v1' }

	for (const [path, where] of [['/always-nested', 'nested.inner'], ['/array', 'arr.0'], ['/fn', 'fn.z']] as const)
		it(`rejects an unreachable helper at ${where} instead of leaking it`, async () => {
			const errors: unknown[] = []
			const res = await new Elysia()
				.onError(({ error }) => { errors.push(error) })
				.use(fixApp)
				.handle(new Request(`http://localhost${path}`, { headers }))
			expect(res.status).toBe(500)
			expect(await res.text()).not.toContain('"config"')
			expect(String(errors[0])).toContain(`"${where}"`)
		})

	it('keeps a plain errors prop always', async () => {
		const res = await fixApp.handle(
			new Request('http://localhost/errors', { headers: { ...headers, 'x-inertia-partial-component': 'p', 'x-inertia-partial-data': 'users' } })
		)
		expect((await res.json()).props).toEqual({ errors: { name: 'required' }, users: [1] })
	})
})
