// Deliberate mistakes for step 3, to show what the compiler reports
import { Elysia } from 'elysia'
import { defer, inertia, optional, type PagePropsOf } from '../../src'

const app = new Elysia()
	.use(inertia())
	.get('/d', { inertia: 'dashboard' }, ({ render }) =>
		render({ stats: defer(async () => ({ visits: 1 })), report: optional(() => 'big') })
	)

declare const props: PagePropsOf<typeof app, 'dashboard'>

// 1. A deferred prop is absent until its follow-up request arrives
props.stats.visits

// 2. Same for an optional prop
props.report.toUpperCase()

// Correct: handle the loading state
props.stats?.visits
