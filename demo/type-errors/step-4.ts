// Deliberate mistakes for step 4, to show what the compiler reports
import { Elysia } from 'elysia'
import { inertia, scroll, type PagePropsOf } from '../../src'

const app = new Elysia()
	.use(inertia())
	.get('/u', { inertia: 'users' }, ({ render }) =>
		render({
			users: scroll(() => ({ data: [{ id: 1 }], page: { at: 1, next: 2 } }), {
				// 1. The cursor reader is typed from the prop's value
				cursor: (value) => ({ currentPage: value.page.current, nextPage: value.page.next, previousPage: null })
			}),
			activity: scroll(() => ({ data: ['x'] })).defer()
		})
	)

declare const props: PagePropsOf<typeof app, 'users'>

// 2. A deferred scroll prop is absent until fetched
props.activity.data
