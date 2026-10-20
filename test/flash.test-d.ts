// Flash data typed by the configured store, read back by InertiaConfigOf
import { Elysia } from 'elysia'
import { cookieFlashStore, inertia, type InertiaConfigOf } from '../src'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expect = <T extends true>() => {}

type Toast = { kind: 'success' | 'error'; text: string }
const pages = inertia({ flash: cookieFlashStore<{ toast: Toast }>({ secret: 's' }) })

const app = new Elysia()
	.use(pages)
	.post('/ok', ({ inertia }) => inertia.flash('toast', { kind: 'success', text: 'Saved' }).back())
	.post('/object', ({ inertia }) => inertia.flash({ toast: { kind: 'error', text: 'No' } }).back())
	// @ts-expect-error not a declared kind
	.post('/kind', ({ inertia }) => inertia.flash('toast', { kind: 'info', text: 'hi' }).back())
	// @ts-expect-error not a declared key
	.post('/key', ({ inertia }) => inertia.flash('banner', 'hi').back())
	.get('/', ({ inertia }) => inertia.render('home'))

expect<Equal<InertiaConfigOf<typeof app>['flashDataType'], { toast?: Toast }>>()

// A feature plugin using bare inertia() joins the app's flash type
const feature = new Elysia().use(inertia()).post('/f', ({ inertia }) => inertia.flash('anything', 1).back())
const composed = new Elysia().use(pages).use(feature).get('/', ({ inertia }) => inertia.render('home'))
expect<Equal<InertiaConfigOf<typeof composed>['flashDataType'], { toast?: Toast }>>()

// Without a typed store, any key goes
const loose = new Elysia().use(inertia({ version: '1' })).post('/', ({ inertia }) => inertia.flash('x', 1).back())
expect<Equal<InertiaConfigOf<typeof loose>['flashDataType'], Record<string, unknown>>>()
