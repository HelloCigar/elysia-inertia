import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { inertia } from '../src'

const headers = { 'x-inertia': 'true', 'x-inertia-version': 'v9' }

describe('API review fixes', () => {
	const feature = () =>
		new Elysia({ prefix: '/f' })
			.use(inertia())
			.get('/a', { inertia: 'a' }, ({ render }) => render({ x: 1 }))

	for (const order of ['feature first', 'config first'] as const)
		it(`a feature plugin's inertia() follows the app config (${order})`, async () => {
			const configured = inertia({ version: 'v9', share: () => ({ app: 'shared' }) })
			const app =
				order === 'feature first'
					? new Elysia().use(feature()).use(configured)
					: new Elysia().use(configured).use(feature())

			const res = await app.handle(new Request('http://localhost/f/a', { headers }))
			expect(res.status).toBe(200)
			const page = await res.json()
			expect(page.version).toBe('v9')
			expect(page.props).toEqual({ errors: {}, app: 'shared', x: 1 })

			const stale = await app.handle(new Request('http://localhost/f/a', { headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' } }))
			expect(stale.status).toBe(409)
		})

	it('reuses one configured instance across plugins', async () => {
		const pages = inertia({ version: 'v9' })
		const users = new Elysia({ prefix: '/users' }).use(pages).get('/', { inertia: 'users' }, ({ render }) => render())
		const app = new Elysia().use(pages).use(users)
		const res = await app.handle(new Request('http://localhost/users', { headers }))
		expect((await res.json()).component).toBe('users')
	})

	it('renders plain props returned from a macro route', async () => {
		const app = new Elysia()
			.use(inertia({ version: 'v9' }))
			.get('/plain', { inertia: 'plain' }, () => ({ y: 2 }))
			.get('/text', { inertia: 'text' }, () => 'not a page')
		const res = await app.handle(new Request('http://localhost/plain', { headers }))
		expect(res.headers.get('x-inertia')).toBe('true')
		expect((await res.json()).props).toEqual({ errors: {}, y: 2 })
		// Anything that isn't a props object is left alone
		expect(await (await app.handle(new Request('http://localhost/text', { headers }))).text()).toBe('not a page')
	})
})

describe('viteVersion()', () => {
	it('hashes the manifest and follows changes', async () => {
		const { viteVersion } = await import('../src')
		const { mkdtempSync, writeFileSync, utimesSync } = await import('node:fs')
		const { join } = await import('node:path')
		const { tmpdir } = await import('node:os')
		const file = join(mkdtempSync(join(tmpdir(), 'vite-')), 'manifest.json')
		writeFileSync(file, '{"a":1}')
		const version = viteVersion(file)
		const first = version()
		expect(first).toMatch(/^[0-9a-f]{16}$/)
		expect(version()).toBe(first)
		writeFileSync(file, '{"a":2}')
		utimesSync(file, new Date(), new Date(Date.now() + 5000))
		expect(version()).not.toBe(first)
	})
})
