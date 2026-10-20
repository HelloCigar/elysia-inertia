// Prints real request/response pairs for steps 1–2: bun demo/step-1-2.ts
import { Elysia, redirect } from 'elysia'
import { inertia } from '../src'

const app = new Elysia()
	.use(inertia({ version: 'v1', share: () => ({ auth: { user: { name: 'Hamir' } } }) }))
	.get('/users', { inertia: 'users/index' }, ({ render }) =>
		render({ users: [{ id: 1, name: 'Ada' }], total: async () => 1 })
	)
	.get('/xss', { inertia: 'xss' }, ({ render }) => render({ bio: '</script><script>alert(1)</script>' }))
	.get('/logout', { inertia: 'auth/login' }, ({ render, inertia }) => {
		inertia.clearHistory()
		return render()
	})
	.delete('/users/1', () => redirect('/users'))
	.get('/docs', ({ inertia }) => inertia.location('https://example.com/docs'))

const cases: [string, string, string, Record<string, string>][] = [
	['Initial load (no X-Inertia) → HTML shell', 'GET', '/users', {}],
	['Inertia visit → page object as JSON', 'GET', '/users', { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' }],
	['Prop data containing </script> is escaped', 'GET', '/xss', {}],
	['Stale asset version → 409 full reload', 'GET', '/users', { 'X-Inertia': 'true', 'X-Inertia-Version': 'old' }],
	['302 after DELETE → 303', 'DELETE', '/users/1', { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' }],
	['location() during an Inertia visit → 409 hard visit', 'GET', '/docs', { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' }],
	['location() on a normal request → plain redirect', 'GET', '/docs', {}],
	['clearHistory() → flag on the page', 'GET', '/logout', { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' }]
]

const keep = ['content-type', 'x-inertia', 'x-inertia-location', 'location', 'vary']
for (const [title, method, path, headers] of cases) {
	const res = await app.handle(new Request(`http://localhost${path}`, { method, headers }))
	let body = await res.text()
	if (res.headers.get('content-type')?.includes('json')) body = JSON.stringify(JSON.parse(body), null, 2)
	console.log(`### ${title}\n\n\`\`\`http\n${method} ${path}\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}${Object.keys(headers).length ? '\n' : ''}\`\`\`\n`)
	const shown = keep.filter((k) => res.headers.has(k)).map((k) => `${k}: ${res.headers.get(k)}`).join('\n')
	console.log(`\`\`\`http\n${res.status}\n${shown}\n\n${body}\n\`\`\`\n`)
}
