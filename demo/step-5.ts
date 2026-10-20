// Prints a real browser-like session for step 5: bun demo/step-5.ts
import { Elysia, t } from 'elysia'
import { inertia } from '../src'

const app = new Elysia()
	.use(inertia({ version: 'v1' }))
	.get('/users/create', { inertia: 'users/create' }, ({ render }) => render())
	.post(
		'/users',
		{
			body: t.Object({
				name: t.String({ minLength: 2, error: 'Name is too short.' }),
				email: t.String({ format: 'email' }),
				address: t.Object({ city: t.String() })
			})
		},
		({ inertia }) => inertia.flash('toast', 'User created').back()
	)
	.put('/users/1/email', ({ inertia }) => inertia.errors({ email: 'Already taken.' }).back())

let jar = ''
const visit = async (title: string, method: string, path: string, headers: Record<string, string>, body?: unknown) => {
	const all: Record<string, string> = { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1', Referer: 'http://localhost/users/create', ...headers }
	if (body) all['Content-Type'] = 'application/json'
	const shown = Object.entries(all).map(([k, v]) => `${k}: ${v}`)
	if (jar) all.Cookie = jar
	const res = await app.handle(new Request(`http://localhost${path}`, { method, headers: all, body: body ? JSON.stringify(body) : undefined }))
	const cookie = res.headers.get('set-cookie')
	if (cookie) jar = /Max-Age=0/.test(cookie) ? '' : cookie.split(';')[0]!

	console.log(`### ${title}\n\n\`\`\`http\n${method} ${path}\n${shown.join('\n')}${jar && !cookie ? '' : ''}${all.Cookie ? `\nCookie: ${all.Cookie.slice(0, 40)}…` : ''}${body ? `\n\n${JSON.stringify(body)}` : ''}\n\`\`\`\n`)
	const keep = ['location', 'x-inertia', 'x-inertia-location', 'set-cookie']
	const head = keep.filter((k) => res.headers.has(k)).map((k) => `${k}: ${k === 'set-cookie' ? res.headers.get(k)!.replace(/=([^;]{40})[^;]*/, '=$1…') : res.headers.get(k)}`)
	const text = await res.text()
	const out = res.headers.get('content-type')?.includes('json') ? JSON.stringify(JSON.parse(text), null, 2) : ''
	console.log(`\`\`\`http\n${res.status}\n${head.join('\n')}${out ? `\n\n${out}` : ''}\n\`\`\`\n`)
}

await visit('Form submission fails the body schema → errors flashed, 303 back', 'POST', '/users', {}, { name: 'A', email: 'nope', address: {} })
await visit('The client follows the redirect → errors on the page (cookie consumed)', 'GET', '/users/create', {})
await visit('Next visit → errors are gone', 'GET', '/users/create', {})
await visit('Same failure from a form with an error bag', 'POST', '/users', { 'X-Inertia-Error-Bag': 'createUser' }, { name: 'Ada', email: 'nope', address: { city: 'London' } })
await visit('Stale assets: 409 reload does not consume the errors…', 'GET', '/users/create', { 'X-Inertia-Version': 'old' })
await visit('…so the page after the reload still has them, namespaced under the bag', 'GET', '/users/create', {})
await visit('Valid submission → flash data, then redirect back', 'POST', '/users', {}, { name: 'Ada', email: 'ada@example.com', address: { city: 'London' } })
await visit('Next page carries page.flash', 'GET', '/users/create', {})
await visit('Errors set by hand on a PUT → 303 (302 upgraded)', 'PUT', '/users/1/email', {})
await visit('…shown on the next page', 'GET', '/users/create', {})
