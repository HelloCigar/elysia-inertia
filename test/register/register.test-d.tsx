// One-line registration: Register (separate program, since
// augmentations are global)
import type { SharedPageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import { Elysia, t } from 'elysia'
import { inertia, share, type InertiaConfigOf, type PageProps } from '../../src'
import { createRoutes, type FormOf } from '../../src/client'

interface User {
	id: number
	name: string
}

declare module '../../src' {
	interface Register {
		app: typeof app
	}
}

declare module '@inertiajs/core' {
	interface InertiaConfig extends InertiaConfigOf {}
}

const app = new Elysia()
	.use(inertia({ share: () => ({ appName: 'demo' }) }))
	.derive(() => ({ user: { id: 1, name: 'Ada' } as User | null }))
	.derive(share(({ user }) => ({ auth: { user } })))
	.get('/users', { inertia: 'users/index' }, ({ render }) => render({ users: [{ id: 1, name: 'Ada' }] }))
	.post('/users', { body: t.Object({ name: t.String() }) }, () => 'ok')

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

// Shared props: from the share option and from share()
expect<Equal<SharedPageProps, { appName: string; auth: { user: { id: number; name: string } | null } }>>()

// No `typeof app` needed anywhere on the client
expect<Equal<PageProps<'users/index'>, { users: { id: number; name: string }[] }>>()
// @ts-expect-error unknown page
type Missing = PageProps<'nope'>

const { url, action } = createRoutes()
url('/users')
// @ts-expect-error unknown path
url('/userz')
action('post', '/users').fields({ name: 'Ada' })
expect<Equal<FormOf<typeof app, 'post', '/users'>, { name: string }>>()

export function Users() {
	const { props } = usePage<PageProps<'users/index'>>()
	props.users[0]?.name satisfies string | undefined
	props.auth.user?.name satisfies string | undefined
	props.appName satisfies string
}
