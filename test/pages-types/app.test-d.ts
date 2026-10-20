import { Elysia } from 'elysia'
import { inertia } from 'elysia-inertia'
import { definePage, type CheckPage, type PageComponentProps, type PageErrors } from 'elysia-inertia/client'

declare module 'elysia-inertia' {
	interface Register {
		app: typeof app
	}
}

const app = new Elysia()
	.use(inertia({ share: () => ({ appName: 'demo' }) }))
	.get('/', { inertia: 'home' }, ({ render }) => render())
	.get('/users', ({ inertia }) => inertia.render('users/index', { users: [{ id: 1, name: 'Ada' }] }))
	// A page prop overrides a shared one of the same name, as at runtime
	.get('/about', ({ inertia }) => inertia.render('about', { appName: 2 }))
	// @ts-expect-error no page file for this name
	.get('/gone', { inertia: 'users/show' }, ({ render }) => render())
	// @ts-expect-error no page file for this name
	.get('/typo', ({ inertia }) => inertia.render('user/index'))

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

// A page gets its own props, the shared ones and errors
expect<Equal<
	PageComponentProps<'users/index'>,
	{ errors: PageErrors; appName: string; users: { id: number; name: string }[] }
>>()
expect<Equal<PageComponentProps<'about'>['appName'], number>>()

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
export type Fine = CheckPage<'users/index', (props: { users: { name: string }[] }) => null>
// @ts-expect-error the page wants a prop its route doesn't send
export type Wrong = CheckPage<'users/index', (props: { posts: string[] }) => null>
// Pages no typed route renders are not checked
export type Unrouted = CheckPage<'drafts', (props: { anything: 1 }) => null>
// @ts-expect-error definePage() named another page than its file
export type Misnamed = CheckPage<'users/index', ReturnType<typeof definePage<'home', () => null>>>
// Class components are checked by their constructor's props
declare class Listing {
	constructor(props: { users: { id: number }[] })
}
export type ClassPage = CheckPage<'users/index', typeof Listing>
declare class Needy {
	constructor(props: { posts: string[] })
}
// @ts-expect-error the class wants a prop its route doesn't send
export type NeedyPage = CheckPage<'users/index', typeof Needy>
