// One-line registration: Register + InertiaShared (separate program, since
// augmentations are global)
import type { SharedPageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import { Elysia, t } from 'elysia'
import { inertia, type InertiaConfigOf, type PageProps } from '../../src'
import { createRoutes, type FormOf } from '../../src/client'

interface User {
	id: number
	name: string
}

declare module '../../src' {
	interface Register {
		app: typeof app
	}
	interface InertiaShared {
		auth: { user: User | null }
	}
}

declare module '@inertiajs/core' {
	interface InertiaConfig extends InertiaConfigOf {}
}

const app = new Elysia()
	.use(inertia({ share: () => ({ appName: 'demo' }) }))
	.derive(() => ({ user: { id: 1, name: 'Ada' } as User | null }))
	.onBeforeHandle(({ inertia, user }) => {
		inertia.share('auth', { user })
	})
	.get('/users', { inertia: 'users/index' }, ({ render }) => render({ users: [{ id: 1, name: 'Ada' }] }))
	.post('/users', { body: t.Object({ name: t.String() }) }, () => 'ok')
	.get('/bad', ({ inertia }) => {
		// @ts-expect-error not a registered shared key
		inertia.share('authh', 1)
		// @ts-expect-error wrong shape for a registered key
		inertia.share('auth', { user: 'Ada' })
		return 'x'
	})

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

// Shared props: from share() config and from the InertiaShared registration
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
