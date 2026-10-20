# elysia-inertia

Inertia.js v3 server adapter for Elysia 2, built against the
[Inertia protocol spec](https://github.com/thetutlage/inertia-protocol/blob/main/protocol.md).

Status: steps 1–6 of the plan: core transport, Elysia surface, partial
reloads, every prop category, validation errors and flash, typed client
helpers, and end-to-end types.

## Server

Configure the plugin once and `.use()` that instance wherever pages are
rendered. A feature plugin that only needs the macro and types may also
`.use(inertia())` with no options: it follows the app's configured instance
whichever order they're registered in.

```ts
// server/inertia.ts
import { inertia, viteVersion } from 'elysia-inertia'

export const pages = inertia({
	version: viteVersion('dist/.vite/manifest.json'), // 409 full reload when the client is stale
	share: () => ({ appName: 'Acme' }),
	rootView: ({ head, body }) => `<!DOCTYPE html>
<html><head>${head}<script type="module" src="/build/app.js"></script></head>
<body>${body}</body></html>`
})
```

```ts
// server/index.ts
import { Elysia } from 'elysia'
import { pages } from './inertia'

export const app = new Elysia()
	.use(pages)
	// Macro: binds the route to a page and adds a typed `render`.
	// Returning plain props renders too, but only render() is typed end to end
	.get('/users', { inertia: 'users/index' }, ({ render }) =>
		render({ users: () => db.users.all() })
	)
	// Or the context API
	.get('/posts/:id', ({ inertia, params }) =>
		inertia.render('posts/show', { post: db.posts.find(params.id) })
	)
	.delete('/posts/:id', ({ redirect }) => redirect('/posts')) // sent as 303
	.get('/docs', ({ inertia }) => inertia.location('https://example.com'))
```

Options: `version`, `share`, `rootView`, `id` (mount id, default `app`),
`ssr` (`{ render }` or `{ url }` of an Inertia SSR server; falls back to
client rendering on failure or after `timeout` ms, default 5000), `encryptHistory`.

Context (`inertia`): `render(component, props?, { status? })`, `errors()`, `flash()`,
`share(key, value)` / `share(props)`, `clearHistory()`, `encryptHistory()`,
`location(url)`, `back(fallback?)`, and `request` (parsed Inertia headers).

Props may be functions or promises; they're resolved at render time, and
only when the prop is actually sent.

### Shared props

Props every page gets are declared once and inferred into `usePage()`; no
interface to write. `share` in the options covers static ones. For props that
depend on the request, `share()` gets the full typed context, including what
other plugins derive:

```ts
import { share } from 'elysia-inertia'

export const app = new Elysia()
	.use(auth) // derives `user`
	.use(pages)
	.derive(share(({ user }) => ({ auth: { user } })))
```

The callback runs only when a page renders, so API routes skip it. Inside a
plugin, use `.derive('plugin', share(...))`. A handler can still
override one for its request with `inertia.share(key, value)`.

## Prop types

```ts
import { always, defer, optional } from 'elysia-inertia'

render({
	users: () => db.users.all(),          // eager: every full visit; partial when asked
	csrf: always(token),                  // every response, even when excluded
	report: optional(() => buildReport()), // only when a partial reload asks for it
	stats: defer(() => loadStats()),      // announced, fetched after mount
	chart: defer(() => loadChart(), 'charts'), // own follow-up request per group
	perms: defer(() => loadPerms()).rescue() // failure → rescuedProps, not a 500
})
```

Merging, client caching and infinite scroll compose with the above:

```ts
import { deepMerge, merge, once, prepend, scroll } from 'elysia-inertia'

render({
	feed: merge(() => latest()).matchOn('id'),   // append, dedupe by id
	messages: prepend(() => newest()),           // prepend
	settings: deepMerge(() => patch()),          // recursive merge
	roles: once(() => loadRoles(), { ttl: 3_600_000 }), // cached by the client
	users: scroll(() => paginate(query.page)),   // { data, meta: { currentPage, nextPage, previousPage } }
	activity: scroll(() => feed(), { pageName: 'cursor', cursor: (v) => ({ currentPage: v.cursor, nextPage: v.next, previousPage: null }) }).defer()
})
```

`X-Inertia-Reset` sends the prop unlabeled (and `scrollProps[path].reset = true`),
`X-Inertia-Except-Once-Props` skips held once props on full visits (`.fresh()`
overrides), and `X-Inertia-Infinite-Scroll-Merge-Intent: prepend` switches a
scroll prop to `prependProps`.

Partial reloads honour `X-Inertia-Partial-Data` / `-Except` with dot paths
(`team.members`). Rescued errors go to `inertia({ onRescue })` (default
`console.error`). On the client, optional and deferred props are typed as
optional keys.

## Validation errors and flash

A route's own `body` / `query` / `params` schema is the validation. When it
rejects a non-GET Inertia request, the plugin flashes the field errors and
redirects back with a 303 (the standard Inertia flow); the next page gets them
as `errors`, keyed by dot path (`address.city`), namespaced under
`X-Inertia-Error-Bag` when the form sent one. A schema's `error` option becomes
that field's message.

```ts
.post('/users', { body: t.Object({ name: t.String({ minLength: 2, error: 'Too short.' }) }) },
	({ inertia, body }) => inertia.flash('toast', 'Saved').back())
.put('/users/:id/email', formBody(t.Object({ email: t.String() })),
	({ body, errors }) => errors({ email: `${body.email} is taken.` }).back())
```

`formBody(schema)` sets the route's `body` and adds an `errors()` whose keys
are checked against the schema's dot paths (`FieldPath<Body>`), the same keys
`form.errors` reads on the client. Spread it to add other options:
`{ ...formBody(schema), detail }`. `inertia.errors()` accepts any keys, or
pass the body type to check them: `inertia.errors<typeof body>(...)`.

Errors and flash wait in a cookie (`inertia_flash`) until the next rendered
page, so they survive the redirect and a 409 version reload. The cookie is
unsigned by default; pass `flash: cookieFlashStore({ secret })` to HMAC-sign it
when an app trusts or renders flash data as HTML. It is `Secure` on https
requests; behind a proxy that terminates TLS, pass `cookieFlashStore({ secure: true })`.
Swap the store with `inertia({ flash: { read, write } })`; tune or disable the automatic
handling with `inertia({ validation: { errors, redirect } | false })`. Type the
flash data once:

```ts
declare module 'elysia-inertia' {
	interface InertiaFlash { toast: string }
}
```

Once props with `ttl` get a new `expiresAt` on every response that mentions
them, so the expiry slides forward while the page is in use; pass `expiresAt`
for a fixed one.

## End-to-end types

Register the app once; every client helper then reads it:

```ts
// client/inertia.d.ts
import type { InertiaConfigOf } from 'elysia-inertia'
import type { app } from '../server'

declare module 'elysia-inertia' {
	interface Register { app: typeof app }
}

declare module '@inertiajs/core' {
	interface InertiaConfig extends InertiaConfigOf {} // usePage(): shared props, flash, errors
}
```

```tsx
// pages/users/index.tsx
import { definePage } from 'elysia-inertia/client'

// The name is checked against the app; users and shared props are inferred
export default definePage('users/index', ({ users, auth }) => <List users={users} />)
```

A child component that reads the page itself still names it:
`usePage<PageProps<'users/index'>>()`.

Shared props come from `inertia({ share })` and `share()`. Only props set ad
hoc with `inertia.share()` in handlers need declaring, in
`interface InertiaShared` of `declare module 'elysia-inertia'`.

Without `Register`, pass the app explicitly: `PagePropsOf<typeof app, 'users/index'>`,
`InertiaConfigOf<typeof app>`, `createRoutes<typeof app>()`. `InferPages<typeof app>`
gives the whole `{ component: props }` map, read from Elysia's route table.
### Page names

`render('users/index')` sends only the name; the client's `resolve` maps it
to a file:

```tsx
createInertiaApp({
	resolve: (name) =>
		import.meta.glob<{ default: ComponentType }>('./pages/**/*.tsx', { eager: true })[
			`./pages/${name}.tsx`
		],
	setup: ({ el, App, props }) => createRoot(el).render(<App {...props} />)
})
```

The Vite plugin generates the page names from that folder, so a route that
names a page with no file fails the typecheck:

```ts
// vite.config.ts
import { inertiaPages } from 'elysia-inertia/vite'

export default defineConfig({
	plugins: [inertiaPages({ dir: 'src/pages', dts: 'inertia-pages.d.ts' })]
})
```

It writes `inertia-pages.d.ts` on build and whenever a page is added or
removed in dev (relative paths follow Vite's `root`; keep the pages folder
inside it so dev changes are seen); include it in the server's tsconfig and commit it. Without
Vite, run `generatePages({ dir, dts })` from `elysia-inertia/vite` in a
script.

With `Register`, it also writes `inertia-pages.check.ts` (option `check`;
`false` to skip). For each `.tsx` page it checks that the file's default
export accepts the props its routes render and, if it uses `definePage`,
names the page the file is. Include it in the client's tsconfig and commit
it. `.vue` and `.svelte` pages are left to `vue-tsc` / `svelte-check`.

Or write the list by hand:

```ts
declare module 'elysia-inertia' {
	interface InertiaPages { 'users/index': true; 'posts/show': true }
}
```

## Typed links and forms (client)

`elysia-inertia/client` reads the app's route table, so URLs, params, query
and form data are checked against the server's routes and schemas.

```ts
// client/routes.ts
import { createRoutes } from 'elysia-inertia/client'

export const { url, action } = createRoutes() // or createRoutes<typeof app>()
```

```tsx
<Link href={url('/users/:id', { params: { id: user.id } })}>…</Link>
router.visit(url('/users', { query: { page: 2 } }))

const store = action('post', '/users')
const form = useForm(store.fields({ name: '', email: '' })) // typed by the body schema
form.errors.email // keyed by the same fields
form.submit(store)
```

Without `fields()`, type the form directly: `useForm<FormOf<typeof app, 'post', '/users'>>({ ... })`.
`BodyOf`, `QueryOf`, `ParamsOf` and `PathsOf` are exported from
`elysia-inertia/client` for anything else. Lower-level building blocks
(`buildPage`, `serializePage`, …) live in `elysia-inertia/internal`.

## Development

```sh
bun install
bun test        # runtime behaviour, mapped to the spec sections
bun run typecheck  # includes test/**/*.test-d.ts type assertions
```
