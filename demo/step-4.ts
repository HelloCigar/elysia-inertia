// Prints real request/response pairs for step 4: bun demo/step-4.ts
import { Elysia } from 'elysia'
import { deepMerge, inertia, merge, once, prepend, scroll } from '../src'

const usersPage = (page: number) => ({
	data: [{ id: page * 10 + 1 }, { id: page * 10 + 2 }],
	meta: { currentPage: page, nextPage: page < 3 ? page + 1 : null, previousPage: page > 1 ? page - 1 : null }
})

const app = new Elysia()
	.use(inertia({ version: 'v1' }))
	.get('/feed', { inertia: 'feed' }, ({ render, query }) =>
		render({
			feed: merge(() => [{ id: 7, text: 'hi' }]).matchOn('id'),
			messages: prepend(() => ['newest']),
			settings: deepMerge(() => ({ theme: { mode: 'dark' } })),
			roles: once(() => ['admin', 'editor'], { expiresAt: 1893456000000 }),
			users: scroll(() => usersPage(Number(query.page ?? 1))).matchOn('id'),
			activity: scroll(() => ({ data: ['logged in'], meta: { currentPage: 1, nextPage: 2, previousPage: null } })).defer()
		})
	)

const base = { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' }
const partial = { ...base, 'X-Inertia-Partial-Component': 'feed' }
const cases: [string, string, Record<string, string>][] = [
	['Full visit: merge labels, once metadata, scroll cursor; the deferred scroll prop is labelled and announced but has no cursor yet', '/feed', base],
	['Later visit: the client still holds "roles" → value skipped, onceProps still sent', '/feed', { ...base, 'X-Inertia-Except-Once-Props': 'roles' }],
	['Infinite scroll, next page (append): labels and a fresh cursor again', '/feed?page=2', { ...partial, 'X-Inertia-Partial-Data': 'users', 'X-Inertia-Infinite-Scroll-Merge-Intent': 'append' }],
	['Infinite scroll, scrolling up (prepend intent) → prependProps', '/feed?page=1', { ...partial, 'X-Inertia-Partial-Data': 'users', 'X-Inertia-Infinite-Scroll-Merge-Intent': 'prepend' }],
	['Filter changed → reset: values unlabeled, scroll cursor reset: true', '/feed', { ...partial, 'X-Inertia-Partial-Data': 'users,feed', 'X-Inertia-Reset': 'users,feed' }],
	['Deferred scroll prop fetched: now it gets its cursor', '/feed', { ...partial, 'X-Inertia-Partial-Data': 'activity' }]
]

for (const [title, path, headers] of cases) {
	const res = await app.handle(new Request(`http://localhost${path}`, { headers }))
	const body = JSON.stringify(await res.json(), null, 2)
	console.log(`### ${title}\n\n\`\`\`http\nGET ${path}\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\`\`\`\n`)
	console.log(`\`\`\`http\n${res.status}\nx-inertia: ${res.headers.get('x-inertia')}\n\n${body}\n\`\`\`\n`)
}
