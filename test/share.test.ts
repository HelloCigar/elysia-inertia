import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { defer, inertia, share } from '../src'

const auth = new Elysia({ name: 'auth' }).derive('plugin', ({ request }) => ({
	user: request.headers.get('x-user')
}))

let calls = 0

const app = new Elysia()
	.use(auth)
	.use(inertia({ version: '1', share: () => ({ appName: 'Acme' }) }))
	.derive(share(async ({ user }) => (calls++, { auth: { user }, stats: defer(() => 1) })))
	.get('/', ({ inertia }) => inertia.render('home', { page: 1 }))
	.get('/api', () => 'plain')
	.get('/override', ({ inertia }) => inertia.share('auth', { user: 'x' }).render('home'))

const visit = (path: string, headers: Record<string, string> = {}) =>
	app
		.handle(new Request(`http://localhost${path}`, {
			headers: { 'x-inertia': 'true', 'x-inertia-version': '1', ...headers }
		}))
		.then((response) => response.json())

describe('share()', () => {
	it('adds props built from the request context to every page', async () => {
		const page = await visit('/', { 'x-user': 'ada' })
		expect(page.props).toEqual({ errors: {}, appName: 'Acme', auth: { user: 'ada' }, page: 1 })
		expect(page.deferredProps).toEqual({ default: ['stats'] })
	})

	it('lets a handler override a shared prop', async () => {
		const page = await visit('/override', { 'x-user': 'ada' })
		expect(page.props.auth).toEqual({ user: 'x' })
	})

	it('runs only when a page renders', async () => {
		calls = 0
		await app.handle(new Request('http://localhost/api'))
		expect(calls).toBe(0)
		await visit('/')
		expect(calls).toBe(1)
	})
})
