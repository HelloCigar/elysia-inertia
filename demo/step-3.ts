// Prints real request/response pairs for step 3: bun demo/step-3.ts
import { Elysia } from 'elysia'
import { always, defer, inertia, optional } from '../src'

const app = new Elysia()
	.use(inertia({ version: 'v1', onRescue: (error, path) => console.error(`(reported out of band: ${path} → ${(error as Error).message})`) }))
	.get('/dashboard', { inertia: 'dashboard' }, ({ render }) =>
		render({
			users: () => [{ id: 1, name: 'Ada' }],
			csrf: always('token'),
			report: optional(() => 'expensive report'),
			stats: defer(async () => ({ visits: 10 })),
			chart: defer(() => [3, 1, 4], 'charts'),
			perms: defer(() => {
				throw new Error('permissions service down')
			}).rescue(),
			team: { owner: 'Ada', members: () => ['Ada', 'Lin'] }
		})
	)

const base = { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' }
const partial = { ...base, 'X-Inertia-Partial-Component': 'dashboard' }
const cases: [string, Record<string, string>][] = [
	['Full visit: eager + always sent, optional skipped, deferred announced by group', base],
	['Deferred follow-up for the "default" group: only those props + always, no deferredProps; failed rescuable prop → rescuedProps', { ...partial, 'X-Inertia-Partial-Data': 'stats,perms' }],
	['Partial reload asking for an optional prop and a nested path', { ...partial, 'X-Inertia-Partial-Data': 'report,team.members' }],
	['Partial reload with except: everything but users/team (always props stay)', { ...partial, 'X-Inertia-Partial-Except': 'users,team,perms' }],
	['Partial reload for a different component → treated as a full visit', { ...base, 'X-Inertia-Partial-Component': 'settings', 'X-Inertia-Partial-Data': 'stats' }]
]

for (const [title, headers] of cases) {
	const res = await app.handle(new Request('http://localhost/dashboard', { headers }))
	const body = JSON.stringify(await res.json(), null, 2)
	console.log(`### ${title}\n\n\`\`\`http\nGET /dashboard\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\`\`\`\n`)
	console.log(`\`\`\`http\n${res.status}\nx-inertia: ${res.headers.get('x-inertia')}\n\n${body}\n\`\`\`\n`)
}
