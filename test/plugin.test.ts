import { describe, expect, it } from 'bun:test'
import { Elysia, redirect } from 'elysia'
import { inertia } from '../src'

const createApp = (options: Parameters<typeof inertia>[0] = {}) =>
	new Elysia()
		.use(inertia({ version: 'v1', ...options }))
		.get('/users', { inertia: 'users/index' }, ({ render }) =>
			render({ users: [{ id: 1 }], lazy: () => 'resolved', nested: { count: async () => 2 } })
		)
		.get('/posts/:id', ({ inertia, params }) =>
			inertia.render('posts/show', { id: params.id })
		)
		.get('/xss', { inertia: 'xss' }, ({ render }) =>
			render({ html: '</script><script>alert(1)</script>' })
		)
		.get('/logout', { inertia: 'login' }, ({ render, inertia }) => {
			inertia.clearHistory().encryptHistory()
			return render()
		})
		.get('/shared', { inertia: 'shared' }, ({ render, inertia }) => {
			inertia.share('fromRequest', 1)
			return render({ own: true })
		})
		.get('/missing', { inertia: 'errors/404' }, ({ render }) => render({}, { status: 404 }))
		.get('/external', ({ inertia }) => inertia.location('https://example.com'))
		.post('/back', ({ inertia }) => inertia.back())
		.put('/users/1', () => redirect('/users'))
		.delete('/users/1', ({ redirect }) => redirect('/users'))
		.post('/users', () => redirect('/users'))

const visit = (app: ReturnType<typeof createApp>, path: string, headers: Record<string, string> = {}, method = 'GET') =>
	app.handle(new Request(`http://localhost${path}`, { method, headers }))

const inertiaHeaders = { 'x-inertia': 'true', 'x-inertia-version': 'v1' }

const pageFromHtml = (html: string) => {
	const match = html.match(/<script type="application\/json" data-page="app">(.*?)<\/script>/s)
	if (!match) throw new Error('no page payload in HTML')
	return JSON.parse(match[1]!)
}

describe('initial load (HTML shell)', () => {
	it('embeds the page object in a data-page script next to the mount element', async () => {
		const res = await visit(createApp(), '/users?page=2')
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toContain('text/html')
		expect(res.headers.get('vary')).toBe('X-Inertia')
		expect(res.headers.get('x-inertia')).toBeNull()

		const html = await res.text()
		expect(html).toStartWith('<!DOCTYPE html>')
		expect(html).toContain('<div id="app"></div>')
		expect(pageFromHtml(html)).toEqual({
			component: 'users/index',
			url: '/users?page=2',
			version: 'v1',
			props: { errors: {}, users: [{ id: 1 }], lazy: 'resolved', nested: { count: 2 } }
		})
	})

	it('escapes every / so prop data cannot close the script element', async () => {
		const html = await (await visit(createApp(), '/xss')).text()
		expect(html).not.toContain('</script><script>alert')
		expect(html).toContain('<\\/script><script>alert(1)<\\/script>')
		expect(pageFromHtml(html).props.html).toBe('</script><script>alert(1)</script>')
	})

	it('uses a custom mount id and root view', async () => {
		const app = createApp({
			id: 'root',
			rootView: ({ body, page }) => `<html><title>${page.component}</title>${body}</html>`
		})
		const html = await (await visit(app, '/users')).text()
		expect(html).toStartWith('<html><title>users/index</title>')
		expect(html).toContain('data-page="root"')
		expect(html).toContain('<div id="root"></div>')
	})

	it('renders through SSR and falls back to the client on failure', async () => {
		const ssr = createApp({
			ssr: { render: (page) => ({ head: ['<title>SSR</title>'], body: `<div id="app" data-server-rendered="true">${page.component}</div>` }) }
		})
		const html = await (await visit(ssr, '/users')).text()
		expect(html).toContain('<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>SSR</title></head>')
		expect(html).toContain('data-server-rendered="true">users/index</div>')

		let reported: unknown
		const failing = createApp({
			ssr: { render: () => { throw new Error('boom') }, onError: (error) => { reported = error } }
		})
		const fallback = await (await visit(failing, '/users')).text()
		expect((reported as Error).message).toBe('boom')
		expect(pageFromHtml(fallback).component).toBe('users/index')
	})
})

describe('Inertia visit (JSON)', () => {
	it('returns the same page object as JSON with X-Inertia and Vary', async () => {
		const res = await visit(createApp(), '/users', inertiaHeaders)
		expect(res.status).toBe(200)
		expect(res.headers.get('x-inertia')).toBe('true')
		expect(res.headers.get('vary')).toBe('X-Inertia')
		expect(res.headers.get('content-type')).toContain('application/json')
		expect(await res.json()).toEqual({
			component: 'users/index',
			url: '/users',
			version: 'v1',
			props: { errors: {}, users: [{ id: 1 }], lazy: 'resolved', nested: { count: 2 } }
		})
	})

	it('renders through the context API as well as the macro', async () => {
		const page = await (await visit(createApp(), '/posts/7', inertiaHeaders)).json()
		expect(page.component).toBe('posts/show')
		expect(page.props.id).toBe('7')
	})

	it('merges shared props: config, then per request, then page props', async () => {
		const app = createApp({ share: ({ path }) => ({ path, own: false }) })
		const page = await (await visit(app, '/shared', inertiaHeaders)).json()
		expect(page.props).toEqual({ errors: {}, path: '/shared', own: true, fromRequest: 1 })
	})

	it('emits history flags only when enabled', async () => {
		const plain = await (await visit(createApp(), '/users', inertiaHeaders)).json()
		expect('clearHistory' in plain).toBe(false)
		expect('encryptHistory' in plain).toBe(false)

		const logout = await (await visit(createApp(), '/logout', inertiaHeaders)).json()
		expect(logout.clearHistory).toBe(true)
		expect(logout.encryptHistory).toBe(true)

		const defaulted = await (await visit(createApp({ encryptHistory: true }), '/users', inertiaHeaders)).json()
		expect(defaulted.encryptHistory).toBe(true)
	})

	it('keeps a custom status', async () => {
		const res = await visit(createApp(), '/missing', inertiaHeaders)
		expect(res.status).toBe(404)
		expect(res.headers.get('x-inertia')).toBe('true')
	})
})

describe('asset versioning', () => {
	it('answers a stale GET visit with 409 + X-Inertia-Location and no X-Inertia', async () => {
		const res = await visit(createApp(), '/users?page=2', { 'x-inertia': 'true', 'x-inertia-version': 'old' })
		expect(res.status).toBe(409)
		expect(res.headers.get('x-inertia-location')).toBe('/users?page=2')
		expect(res.headers.get('x-inertia')).toBeNull()
	})

	it('treats a missing version header as the empty string', async () => {
		const res = await visit(createApp(), '/users', { 'x-inertia': 'true' })
		expect(res.status).toBe(409)
		const matching = await visit(createApp({ version: '' }), '/users', { 'x-inertia': 'true' })
		expect(matching.status).toBe(200)
	})

	it('only checks GET Inertia requests', async () => {
		const res = await visit(createApp(), '/users', { 'x-inertia': 'true', 'x-inertia-version': 'old' }, 'POST')
		expect(res.status).toBe(302)
		const html = await visit(createApp(), '/users', { 'x-inertia-version': 'old' })
		expect(html.status).toBe(200)
	})

	it('accepts a version function', async () => {
		const app = createApp({ version: async () => 'hash' })
		const res = await visit(app, '/users', { 'x-inertia': 'true', 'x-inertia-version': 'hash' })
		expect((await res.json()).version).toBe('hash')
	})
})

describe('redirects', () => {
	for (const method of ['PUT', 'DELETE'])
		it(`turns a 302 after ${method} into a 303`, async () => {
			const res = await visit(createApp(), '/users/1', inertiaHeaders, method)
			expect(res.status).toBe(303)
			expect(res.headers.get('location')).toBe('/users')
		})

	it('leaves a 302 after POST alone', async () => {
		const res = await visit(createApp(), '/users', {}, 'POST')
		expect(res.status).toBe(302)
	})

	it('forces a hard visit with 409 + X-Inertia-Location for Inertia requests', async () => {
		const res = await visit(createApp(), '/external', inertiaHeaders)
		expect(res.status).toBe(409)
		expect(res.headers.get('x-inertia-location')).toBe('https://example.com')
		expect(res.headers.get('x-inertia')).toBeNull()
	})

	it('falls back to a plain redirect outside an Inertia visit', async () => {
		const res = await visit(createApp(), '/external')
		expect(res.status).toBe(302)
		expect(res.headers.get('location')).toBe('https://example.com')
	})

	it('goes back to the referer', async () => {
		const res = await visit(createApp(), '/back', { referer: 'http://localhost/form' }, 'POST')
		expect(res.headers.get('location')).toBe('http://localhost/form')
		const fallback = await visit(createApp(), '/back', {}, 'POST')
		expect(fallback.headers.get('location')).toBe('/')
	})
})

describe('composition', () => {
	it('works in a feature plugin mounted under a prefix', async () => {
		const users = new Elysia({ prefix: '/admin' })
			.use(inertia({ version: 'v1' }))
			.get('/users', { inertia: 'admin/users' }, ({ render }) => render({ n: 1 }))
		const app = new Elysia().use(users)

		const res = await app.handle(new Request('http://localhost/admin/users', { headers: inertiaHeaders }))
		expect((await res.json()).component).toBe('admin/users')
		const stale = await app.handle(new Request('http://localhost/admin/users', { headers: { 'x-inertia': 'true' } }))
		expect(stale.status).toBe(409)
	})
})

describe('review fixes', () => {
	const app = new Elysia()
		.use(inertia({ version: 'v1' }))
		.patch('/set-status', ({ set }) => {
			set.status = 302
			set.headers.location = '/users'
			return ''
		})
		.get('/arrays', { inertia: 'arrays' }, ({ render }) =>
			render({ list: [() => 1, Promise.resolve(2), { n: async () => 3 }], gone: undefined })
		)

	it('upgrades a 302 set through set.status after PATCH', async () => {
		const res = await app.handle(new Request('http://localhost/set-status', { method: 'PATCH', headers: inertiaHeaders }))
		expect(res.status).toBe(303)
		expect(res.headers.get('location')).toBe('/users')
	})

	it('sends path + query in the version-mismatch X-Inertia-Location', async () => {
		const res = await app.handle(new Request('http://proxy.internal:3000/arrays?x=1', { headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' } }))
		expect(res.status).toBe(409)
		expect(res.headers.get('x-inertia-location')).toBe('/arrays?x=1')
	})

	it('resolves functions and promises inside arrays', async () => {
		const res = await app.handle(new Request('http://localhost/arrays', { headers: inertiaHeaders }))
		const page = await res.json()
		expect(page.props.list).toEqual([1, 2, { n: 3 }])
		expect('gone' in page.props).toBe(false)
	})
})
