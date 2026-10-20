import { Elysia } from 'elysia'
import { inertia, share, type InertiaConfigOf } from '../src'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

const auth = new Elysia({ name: 'auth' }).derive('plugin', () => ({
	user: { id: 1, name: 'a' } as { id: number; name: string } | null
}))

const app = new Elysia()
	.use(auth)
	.use(inertia({ share: () => ({ appName: 'Acme' }) }))
	.derive(share(({ user }) => ({ auth: { user } })))
	.get('/', ({ inertia }) => inertia.render('home'))

expect<Equal<
	InertiaConfigOf<typeof app>['sharedPageProps'],
	{ appName: string; auth: { user: { id: number; name: string } | null } }
>>()

// The callback sees the typed context
new Elysia().use(auth).use(inertia()).derive(
	// @ts-expect-error `nope` is not on the context
	share(({ nope }) => ({ nope }))
)

// Shared from inside a plugin, then used by the app
const sharing = new Elysia({ name: 'sharing' })
	.use(auth)
	.use(inertia())
	.derive('plugin', share(({ user }) => ({ userId: user?.id ?? null })))
const composed = new Elysia().use(sharing).get('/', ({ inertia }) => inertia.render('home'))
expect<Equal<InertiaConfigOf<typeof composed>['sharedPageProps'], { userId: number | null }>>()

// Literals widen like inertia({ share }) does
const literal = new Elysia()
	.use(inertia())
	.derive(share(() => ({ locale: 'en', roles: ['a', 'b'] })))
	.get('/', ({ inertia }) => inertia.render('home'))
expect<Equal<InertiaConfigOf<typeof literal>['sharedPageProps'], { locale: string; roles: string[] }>>()
