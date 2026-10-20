import { Elysia } from 'elysia'
import { inertia } from 'elysia-inertia'
import { definePage, type CheckPage, type PageComponentProps } from 'elysia-inertia/client'

declare module 'elysia-inertia' {
	interface Register {
		app: typeof app
	}
}

const app = new Elysia()
	.use(inertia({ share: () => ({ appName: 'demo' }) }))
	.get('/', { inertia: 'home' }, ({ render }) => render())
	.get('/users', ({ inertia }) => inertia.render('users/index', { users: [{ id: 1, name: 'Ada' }] }))
	// @ts-expect-error no page file for this name
	.get('/gone', { inertia: 'users/show' }, ({ render }) => render())
	// @ts-expect-error no page file for this name
	.get('/typo', ({ inertia }) => inertia.render('user/index'))

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

// A page gets its own props, the shared ones and errors
expect<Equal<
	PageComponentProps<'users/index'>,
	{ users: { id: number; name: string }[] } & { appName: string } & { errors: Record<string, string> }
>>()

definePage('users/index', ({ users, appName }) => {
	users[0]?.name satisfies string | undefined
	appName satisfies string
	// @ts-expect-error not a prop of this page
	users[0]?.email
	return null
})
// @ts-expect-error not a page of this app
definePage('users/show', () => null)

// What the generated check file asserts about each page file
type Fine = CheckPage<'users/index', (props: { users: { name: string }[] }) => null>
// @ts-expect-error the page wants a prop its route doesn't send
type Wrong = CheckPage<'users/index', (props: { posts: string[] }) => null>
// Pages no typed route renders are not checked
type Unrouted = CheckPage<'drafts', (props: { anything: 1 }) => null>
// @ts-expect-error definePage() named another page than its file
type Misnamed = CheckPage<'users/index', ReturnType<typeof definePage<'home', () => null>>>
