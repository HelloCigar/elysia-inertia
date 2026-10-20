import { describe, expect, it } from 'bun:test'
import { Elysia, t } from 'elysia'
import { inertia } from '../src'

const createApp = (options: Parameters<typeof inertia>[0] = {}) =>
	new Elysia()
		.use(inertia({ version: 'v1', ...options }))
		.get('/users/create', { inertia: 'users/create' }, ({ render }) => render({ roles: ['admin'] }))
		.post(
			'/users',
			{
				body: t.Object({
					name: t.String({ minLength: 2, error: 'Name is too short.' }),
					age: t.Number(),
					address: t.Object({ city: t.String() }),
					tags: t.Array(t.String())
				})
			},
			({ inertia }) => inertia.flash('toast', 'Created').back()
		)
		.post('/manual', ({ inertia }) => inertia.errors({ email: 'Taken.' }).back())
		.post('/manual-bag', ({ inertia }) => inertia.errors({ email: 'Taken.' }, 'login').back())
		.get('/inline', { inertia: 'inline' }, ({ inertia, render }) => {
			inertia.errors({ q: 'Too short.' }).flash({ notice: 'now' })
			return render()
		})
		.get('/search', { query: t.Object({ q: t.String() }), inertia: 'search' }, ({ render }) => render())

const inertiaHeaders = { 'x-inertia': 'true', 'x-inertia-version': 'v1' }

/** A tiny cookie jar, like the browser following the redirect */
const session = (app: ReturnType<typeof createApp>) => {
	let jar = ''
	return async (path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) => {
		const headers: Record<string, string> = { ...inertiaHeaders, referer: 'http://localhost/users/create', ...init.headers }
		if (jar) headers.cookie = jar
		if (init.body) headers['content-type'] = 'application/json'
		const res = await app.handle(
			new Request(`http://localhost${path}`, { method: init.method ?? 'GET', headers, body: init.body ? JSON.stringify(init.body) : undefined })
		)
		const setCookie = res.headers.get('set-cookie')
		if (setCookie) {
			const [pair] = setCookie.split(';')
			jar = pair!.endsWith('=') || /expires=Thu, 01 Jan 1970/i.test(setCookie) || /max-age=0/i.test(setCookie) ? '' : pair!
		}
		return res
	}
}

const badUser = { name: 'a', age: 'x', address: {}, tags: [1] }

describe('validation errors (spec 17)', () => {
	it('turns a failed body schema into flashed field errors and a 303 back', async () => {
		const visit = session(createApp())
		const res = await visit('/users', { method: 'POST', body: badUser })
		expect(res.status).toBe(303)
		expect(res.headers.get('location')).toBe('http://localhost/users/create')

		const page = await (await visit('/users/create')).json()
		expect(page.props.errors).toEqual({
			name: 'Name is too short.',
			age: 'must be number',
			'address.city': 'This field is required.',
			'tags.0': 'must be string'
		})
	})

	it('consumes errors: the next render no longer has them', async () => {
		const visit = session(createApp())
		await visit('/users', { method: 'POST', body: badUser })
		await visit('/users/create')
		const page = await (await visit('/users/create')).json()
		expect(page.props.errors).toEqual({})
	})

	it('namespaces errors under X-Inertia-Error-Bag', async () => {
		const visit = session(createApp())
		await visit('/users', { method: 'POST', body: badUser, headers: { 'x-inertia-error-bag': 'createUser' } })
		const page = await (await visit('/users/create')).json()
		expect(Object.keys(page.props.errors)).toEqual(['createUser'])
		expect(page.props.errors.createUser.age).toBe('must be number')
	})

	it('keeps errors across a version-mismatch reload', async () => {
		const visit = session(createApp())
		await visit('/users', { method: 'POST', body: badUser })
		const stale = await visit('/users/create', { headers: { 'x-inertia-version': 'old' } })
		expect(stale.status).toBe(409)
		// The hard reload is a plain browser GET: the HTML shell carries the errors
		const html = await (await visit('/users/create', { headers: { 'x-inertia': '', 'x-inertia-version': '' } })).text()
		expect(html).toContain('"age":"must be number"')
	})

	it('sets errors by hand, with an explicit bag', async () => {
		const visit = session(createApp())
		await visit('/manual', { method: 'POST' })
		expect((await (await visit('/users/create')).json()).props.errors).toEqual({ email: 'Taken.' })
		await visit('/manual-bag', { method: 'POST' })
		expect((await (await visit('/users/create')).json()).props.errors).toEqual({ login: { email: 'Taken.' } })
	})

	it('leaves GET query validation and non-Inertia requests to Elysia', async () => {
		const visit = session(createApp())
		expect((await visit('/search')).status).toBe(422)
		expect((await visit('/users', { method: 'POST', body: badUser, headers: { 'x-inertia': '' } })).status).toBe(422)
	})

	it('can be turned off or customised', async () => {
		expect((await session(createApp({ validation: false }))('/users', { method: 'POST', body: badUser })).status).toBe(422)

		const visit = session(createApp({ validation: { errors: () => ({ form: 'Invalid.' }), redirect: () => '/users/create?retry=1' } }))
		const res = await visit('/users', { method: 'POST', body: badUser })
		expect(res.headers.get('location')).toBe('/users/create?retry=1')
		expect((await (await visit('/users/create')).json()).props.errors).toEqual({ form: 'Invalid.' })
	})
})

describe('flash data', () => {
	it('sends flashed data as page.flash on the next render, then drops it', async () => {
		const visit = session(createApp())
		const res = await visit('/users', { method: 'POST', body: { name: 'Ada', age: 36, address: { city: 'London' }, tags: [] } })
		// back() after POST stays a 302; only PUT/PATCH/DELETE become 303
		expect(res.status).toBe(302)

		const page = await (await visit('/users/create')).json()
		expect(page.flash).toEqual({ toast: 'Created' })
		expect(page.props.errors).toEqual({})

		const next = await (await visit('/users/create')).json()
		expect('flash' in next).toBe(false)
	})

	it('includes errors and flash set during the same request', async () => {
		const visit = session(createApp())
		const page = await (await visit('/inline')).json()
		expect(page.props.errors).toEqual({ q: 'Too short.' })
		expect(page.flash).toEqual({ notice: 'now' })
		const next = await (await visit('/users/create')).json()
		expect(next.props.errors).toEqual({})
	})

	it('uses a custom store', async () => {
		const memory = new Map<string, unknown>()
		const app = createApp({
			flash: {
				read: () => memory.get('flash') as never,
				write: (_, data) => void (data ? memory.set('flash', data) : memory.delete('flash'))
			}
		})
		await app.handle(new Request('http://localhost/manual', { method: 'POST', headers: inertiaHeaders }))
		expect(memory.get('flash')).toEqual({ errors: { email: 'Taken.' }, errorBag: null })
		const page = await (await app.handle(new Request('http://localhost/users/create', { headers: inertiaHeaders }))).json()
		expect(page.props.errors).toEqual({ email: 'Taken.' })
		expect(memory.has('flash')).toBe(false)
	})
})

describe('review fixes (step 5)', () => {
	it('keys a missing top-level field by its own name, not root.*', async () => {
		const visit = session(createApp())
		await visit('/users', { method: 'POST', body: { age: 1, address: { city: 'x' } } })
		const page = await (await visit('/users/create')).json()
		expect(page.props.errors).toEqual({ name: 'Name is too short.', tags: 'This field is required.' })
	})

	it('signs the cookie with a secret and ignores a forged one', async () => {
		const { cookieFlashStore } = await import('../src')
		const app = createApp({ flash: cookieFlashStore({ secret: 's3cret' }) })
		const visit = session(app)
		const res = await visit('/manual', { method: 'POST' })
		expect(res.headers.get('set-cookie')).toMatch(/^inertia_flash=[\w-]+\.[\w-]+;/)
		expect((await (await visit('/users/create')).json()).props.errors).toEqual({ email: 'Taken.' })

		const forged = Buffer.from(JSON.stringify({ errors: { email: 'Forged' } })).toString('base64url')
		const page = await (
			await app.handle(new Request('http://localhost/users/create', { headers: { ...inertiaHeaders, cookie: `inertia_flash=${forged}.bad` } }))
		).json()
		expect(page.props.errors).toEqual({})
	})
})
