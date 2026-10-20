// Client side: wire the server's shared props into Inertia's own types
import type { Page, SharedPageProps } from '@inertiajs/core'
import { Elysia } from 'elysia'
import { inertia, type InertiaConfigOf, type PagePropsOf } from '../src'

const app = new Elysia()
	.use(inertia({ share: () => ({ auth: { user: { name: 'a' } } }) }))
	.get('/users', { inertia: 'users/index' }, ({ render }) => render({ users: ['x'] }))

declare module '@inertiajs/core' {
	interface InertiaConfig extends InertiaConfigOf<typeof app> {}
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

expect<Equal<SharedPageProps, { auth: { user: { name: string } } }>>()

// What usePage<PagePropsOf<...>>() returns
declare const page: Page<PagePropsOf<typeof app, 'users/index'> & SharedPageProps>
page.props.users satisfies string[]
page.props.auth.user.name satisfies string
page.props.errors satisfies Record<string, string>
