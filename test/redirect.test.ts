import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { inertia } from '../src'
import { buildUrl } from '../src/url'

const app = new Elysia()
	.use(inertia({ version: 'v1' }))
	.get('/users/:id', { inertia: 'users/show' }, ({ render }) => render())
	.post('/users', ({ inertia }) =>
		inertia.flash('toast', 'Created').redirect('/users/:id', { params: { id: 'a b' }, query: { tab: 'info' } })
	)
	.put('/users/:id', ({ inertia }) => inertia.errors({ name: 'Taken.' }).redirect('/users/1'))
	.post('/missing', ({ inertia }) => inertia.redirect('/users/:id'))

const send = (method: string, path: string, cookie = '') =>
	app.handle(new Request(`http://localhost${path}`, {
		method,
		headers: { 'x-inertia': 'true', 'x-inertia-version': 'v1', cookie }
	}))

describe('inertia.redirect()', () => {
	it('answers 303 with the built URL and carries flash over', async () => {
		const response = await send('POST', '/users')
		expect(response.status).toBe(303)
		expect(response.headers.get('location')).toBe('/users/a%20b?tab=info')

		const cookie = response.headers.get('set-cookie')!.split(';')[0]!
		const page = await (await send('GET', '/users/a%20b', cookie)).json()
		expect(page.flash).toEqual({ toast: 'Created' })
	})

	it('carries errors over after PUT', async () => {
		const response = await send('PUT', '/users/1')
		expect(response.status).toBe(303)
		const cookie = response.headers.get('set-cookie')!.split(';')[0]!
		const page = await (await send('GET', '/users/1', cookie)).json()
		expect(page.props.errors).toEqual({ name: 'Taken.' })
	})

	it('rejects a missing param', async () => {
		expect((await send('POST', '/missing')).status).toBe(500)
	})
})

describe('redirect URLs', () => {
	it('templates only the path', () => {
		expect(buildUrl('https://example.com/a')).toBe('https://example.com/a')
		expect(buildUrl('http://localhost:3000/a/:id', { params: { id: 1 } })).toBe('http://localhost:3000/a/1')
		expect(buildUrl('/a?x=1#top', { query: { y: 2 } })).toBe('/a?x=1&y=2#top')
		expect(buildUrl('/users/:id?')).toBe('/users')
		expect(buildUrl('/s?x=a%20b&sig=a~b&flag', { query: { y: 1 } })).toBe('/s?x=a%20b&sig=a~b&flag&y=1')
	})
})
