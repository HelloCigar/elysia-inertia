import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { inertia } from '../src'

const app = new Elysia()
	.use(inertia({ version: 'v1' }))
	.get('/dashboard', ({ inertia: { render, defer, always, optional } }) =>
		render('dashboard', {
			stats: defer(() => ({ visits: 1 })),
			csrf: always('t'),
			report: optional(() => 'big')
		})
	)
	.post('/users', ({ inertia: { flash, redirect } }) => {
		flash('toast', 'Created')
		return redirect('/users/:id', { params: { id: 1 } })
	})
	.put('/users/1', ({ inertia: { errors } }) => errors({ name: 'Taken.' }).back())
	.get('/users/:id', ({ inertia: { render } }) => render('users/show'))

const send = (method: string, path: string, headers: Record<string, string> = {}) =>
	app.handle(new Request(`http://localhost${path}`, {
		method,
		headers: { 'x-inertia': 'true', 'x-inertia-version': 'v1', ...headers }
	}))

describe('destructured inertia context', () => {
	it('renders with destructured prop helpers', async () => {
		const page = await (await send('GET', '/dashboard')).json()
		expect(page.props).toEqual({ errors: {}, csrf: 't' })
		expect(page.deferredProps).toEqual({ default: ['stats'] })
	})

	it('keeps methods working without `this`', async () => {
		const created = await send('POST', '/users')
		expect(created.status).toBe(303)
		expect(created.headers.get('location')).toBe('/users/1')

		const cookie = created.headers.get('set-cookie')!.split(';')[0]!
		const page = await (await send('GET', '/users/1', { cookie })).json()
		expect(page.flash).toEqual({ toast: 'Created' })

		const failed = await send('PUT', '/users/1', { referer: 'http://localhost/users/1/edit' })
		expect(failed.status).toBe(303)
		expect(failed.headers.get('location')).toBe('/users/1/edit')
	})
})
