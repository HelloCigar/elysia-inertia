// Deliberate mistakes, to show what the compiler reports
import { Elysia } from 'elysia'
import { inertia, type PagePropsOf } from '../../src'

const app = new Elysia()
	.use(inertia())
	.get('/users', { inertia: 'users/index' }, ({ render }) => render({ users: [{ id: 1 }] }))

type UsersProps = PagePropsOf<typeof app, 'users/index'>
const ok: UsersProps = { users: [{ id: 2 }] }

// 1. A page the app never renders
type Typo = PagePropsOf<typeof app, 'user/index'>

// 2. Wrong prop shape
const wrong: UsersProps = { users: [{ id: '2' }] }
