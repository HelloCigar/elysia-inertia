# elysia-inertia

Inertia.js v3 server adapter for Elysia 2, built against the
[Inertia protocol spec](https://github.com/thetutlage/inertia-protocol/blob/main/protocol.md).

## Installation

```sh
bun add elysia-inertia elysia@2.0.0-rc.0
```

Use Bun and Elysia 2. Install your Inertia v3 client adapter (such as
`@inertiajs/react`) in the frontend app. The package ships ESM JavaScript
and TypeScript declarations; no TypeScript compilation of dependencies is
needed.

Entry points: `elysia-inertia` for the server plugin,
`elysia-inertia/client` for browser helpers, `elysia-inertia/vite` for page
generation, and `elysia-inertia/internal` for lower-level integrations.

## Server

Configure the plugin once and `.use()` that instance wherever pages are
rendered. A feature plugin that only needs the macro and types may also
`.use(inertia())` with no options: it follows the app's configured instance
whichever order they're registered in. It can't see the configured flash
type, though, so `flash()` there is a type error; a plugin that flashes uses
the configured instance.

```ts
// server/inertia.ts
import { inertia } from 'elysia-inertia'

export const pages = inertia({
	vite: { entry: 'src/client/app.tsx', react: true },
	share: () => ({ appName: 'Acme' })
})
```

```ts
// server/index.ts
import { Elysia } from 'elysia'
import { pages } from './inertia'

export const app = new Elysia()
	.use(pages)
	// Macro: binds the route to a page and adds a typed `render`
	.get('/users', { inertia: 'users/index' }, ({ render }) =>
		render({ users: () => db.users.all() })
	)
	// Or the context API, destructured or not
	.get('/posts/:id', ({ inertia: { render, defer }, params }) =>
		render('posts/show', { post: db.posts.find(params.id), comments: defer(() => db.comments.of(params.id)) })
	)
	.post('/posts', ({ inertia, body }) =>
		inertia.flash('toast', 'Created').redirect('/posts/:id', { params: { id: db.posts.create(body).id } })
	)
	.delete('/posts/:id', ({ inertia }) => inertia.redirect('/posts'))
	.get('/docs', ({ inertia }) => inertia.location('https://example.com'))
```

Options: `vite` (below), `version`, `share`, `rootView`, `id` (mount id, default `app`),
`ssr` (`{ render }` or `{ url }` of an Inertia SSR server; falls back to
client rendering on failure or after `timeout` ms, default 5000), `encryptHistory`,
`routes` (see [Typed redirects](#typed-redirects)).

Props may be functions or promises; they're resolved at render time, and
only when the prop is actually sent.

### The `inertia` context

| Member | Does |
| --- | --- |
| `render(component, props?, { status? })` | JSON for an Inertia visit, the HTML document otherwise |
| `redirect(path, { params?, query? })` | 303 to a page of the app, [typed](#typed-redirects) |
| `back(fallback?)` | Redirect to the previous page on this site |
| `location(url)` | Full browser visit, e.g. to another site (409 + `X-Inertia-Location`) |
| `errors(errors, bag?)` | Validation errors for the next page |
| `flash(key, value)` / `flash(data)` | Data for the next page's `page.flash` |
| `clearHistory()`, `encryptHistory()` | History flags for this page |
| `always`, `optional`, `defer`, `merge`, `prepend`, `deepMerge`, `once`, `scroll` | The [prop helpers](#prop-types) |
| `request` | The parsed Inertia request headers |

Everything destructures, since the methods don't rely on `this`, and
`errors()`, `flash()` and the history flags chain:

```ts
.get('/dashboard', ({ inertia: { render, defer } }) =>
	render('dashboard', { stats: defer(() => loadStats()) })
)
.put('/users/:id', ({ inertia: { errors } }) => errors({ email: 'Taken.' }).back())
```

### Redirects

`redirect()` answers 303 so the client follows with a GET after any method,
and errors or flash set on the request carry over. It fills a route pattern's
`params` and appends `query`; an origin, existing query or `#hash` pass through:

```ts
.post('/users', ({ inertia, body }) => {
	const user = db.users.create(body)
	return inertia.flash('toast', 'Created').redirect('/users/:id', { params: { id: user.id } })
})
```

#### Typed redirects

A handler can't read its own app's routes from `typeof app`: TypeScript
would have to know the app's type to check the handler, and the app's type
includes that handler, so it gives up and makes the whole app `any`.
Instead, the plugin writes the routes to a declaration file when the server
starts in dev, and `redirect()` checks against that file:

```ts
inertia({ routes: 'inertia-routes.d.ts' })
```

```ts
// inertia-routes.d.ts (generated)
declare module 'elysia-inertia' {
	interface InertiaRoutes {
		"/users": true
		"/users/:id": true
	}
}
```

The path is relative to the working directory. Include the file in the
server's tsconfig and commit it. Then a literal path must be a GET (or
`.all()`) route, with its params (`:id` required, `:id?` optional, `*`);
`query` stays a plain record:

```ts
inertia.redirect('/users/:id', { params: { id: 1 } })
inertia.redirect('/userz')     // error: not a route
inertia.redirect('/users/:id') // error: id is missing
inertia.redirect(`/users/${id}`) // templates and computed strings pass as they are
inertia.redirect(returnTo)
```

The file is written when the app calls `.listen()` outside production, so a
new route is checked once the dev server restarts. An app served another way
(`app.handle`, `fetch`), or CI without a dev start, writes it from a script:
`writeRoutes(app, 'inertia-routes.d.ts')`.

A plain `302` from Elysia's own `redirect` or `back()` after PUT, PATCH or
DELETE is sent as `303` too, so the browser doesn't repeat the method.

### Vite assets

`vite` loads your client entry on the initial load. In dev (`NODE_ENV` isn't
`production`) it adds the dev server's `@vite/client`, the entry, and with
`react: true` the React Refresh preamble `@vitejs/plugin-react` needs. In
production it reads the manifest (set `build.manifest: true`) and adds the
entry's script, CSS, and preloads for its imports, and versions assets by the
manifest's hash, so a stale client gets a 409 full reload. Options: `entry`
(one or an array), `react`, `dev`, `devServer` (default
`http://localhost:5173`), `manifest` (default `dist/.vite/manifest.json`),
`base` (Vite's `base`, default `/`). An explicit `version` wins.

Use an absolute `base` (`/build/` or a CDN URL). A relative one (`./`) makes
the asset URLs resolve against each page's path, so they break on nested
routes like `/users/1`; the plugin warns about it in production.

The tags go in `head`, so a custom `rootView` still gets them:

```ts
rootView: ({ head, body }) => `<!DOCTYPE html>
<html lang="en"><head><title>Acme</title>${head}</head><body>${body}</body></html>`
```

Serve the build yourself, e.g. with `@elysiajs/static` at the same `base`.
`viteTags(options)` returns the same tags for HTML outside Inertia, and
`viteVersion(manifest)` the version alone.

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
plugin, use `.derive('plugin', share(...))`. A page prop overrides a shared
one of the same name.

## Prop types

Take the helpers from `inertia` in a handler, or import them for props built
outside one; they're the same functions:

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
`console.error`). See [Typed pages](#typed-pages) for how these are checked
against the page's props.

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
`{ ...formBody(schema), detail }`. `errors()` chains into `back()`,
`redirect()`, `location()` or `render()`; flash through `inertia.flash()`. `inertia.errors()` accepts any keys, or
pass the body type to check them: `inertia.errors<typeof body>(...)`.

Errors and flash wait in a cookie (`inertia_flash`) until the next rendered
page, so they survive the redirect and a 409 version reload. The cookie is
unsigned by default; pass `flash: cookieFlashStore({ secret })` to HMAC-sign it
when an app trusts or renders flash data as HTML. It is `Secure` on https
requests; behind a proxy that terminates TLS, pass `cookieFlashStore({ secure: true })`.
Swap the store with `inertia({ flash: { read, write } })`; tune or disable the automatic
handling with `inertia({ validation: { errors, redirect } | false })`. Type the
flash data on the store; `flash()` and the client's `page.flash` follow it:

```ts
inertia({ flash: cookieFlashStore<{ toast: { kind: 'success' | 'error'; text: string } }>() })
```

A custom store types it the same way, as `FlashStore<{ toast: … }>`.

Once props with `ttl` get a new `expiresAt` on every response that mentions
them, so the expiry slides forward while the page is in use; pass `expiresAt`
for a fixed one.

## Typed pages

Each page declares its props, like any component; `render()` is checked
against them, so a missing, mistyped or extra prop is an error at the call:

```tsx
// src/pages/users/index.tsx
export default function Users({ users, stats }: { users: User[]; stats?: Stats }) { … }
```

```ts
.get('/users', { inertia: 'users/index' }, ({ render }) =>
	render({ users: () => db.users.all(), stats: defer(() => loadStats()) })
)
render({})                          // error: users is missing
render({ users, passwordHash })     // error: the page doesn't declare passwordHash
render({ users: defer(() => all) }) // error: users is required, so it can't be deferred
render({ users: [{ ...user, joined: new Date() }] }) // error: the page gets a string, not a Date
```

- Each value may be the prop itself, or functions and promises resolving to
  it, also nested in objects and arrays. Only the page's own types pass: send
  what the client receives (a `Date` serializes to a string, so convert it).
- Prop helpers work at static object paths. `defer()` and `optional()` leave
  the prop out of the first render, so they need a prop the page marks `?`
  (or `| undefined`).
- `errors` is never passed to `render()`. A prop that `inertia({ share })`
  always provides, with a type the page accepts, is optional there and may
  be overridden; a lazy or differently typed shared prop doesn't count. Shared props added with `share()`
  aren't known to the macro's `render`: read them with `usePage()` rather than
  declaring them as page props.
- A page without props takes `render()` with none.

### Generating the pages

The Vite plugin writes `InertiaPages` from the pages folder: each page's
props come from its default export's type, so editing a page's props needs
no regeneration, and a route naming a page with no file fails the typecheck.

```ts
// vite.config.ts
import { inertiaPages } from 'elysia-inertia/vite'

export default defineConfig({
	plugins: [inertiaPages({ dir: 'src/pages', dts: 'inertia-pages.d.ts' })]
})
```

```ts
// inertia-pages.d.ts (generated)
declare module 'elysia-inertia' {
	interface InertiaPages {
		"users/index": PropsOf<typeof import("./src/pages/users/index").default>
		"settings": true
	}
}
```

It writes the file on build and whenever a page is added or removed in dev
(relative paths follow Vite's `root`; keep the pages folder inside it so dev
changes are seen). Include it in the server's tsconfig and commit it. The
server's typecheck then loads the page files, so it needs `jsx` and React's
types. Without Vite, run `generatePages({ dir, dts })` from
`elysia-inertia/vite` in a script.

`.vue`, `.svelte` and JavaScript pages, whose props `tsc` can't read (or
needs `allowJs` for), are `true`: the name is checked, any props pass. A page must not type its own props through
`PageProps<'its name'>`, which would refer to itself.

Or write the pages by hand:

```ts
declare module 'elysia-inertia' {
	interface InertiaPages { 'users/index': { users: User[] }; 'posts/show': true }
}
```

With no pages registered, any name and props pass.

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

### Shared props and the client

Register the app once for the shared props, flash data and `createRoutes()`:

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

Shared props come from `inertia({ share })` and `share()`, flash data from
the store's type; nothing else to declare. A child component that reads a
page's props names it: `usePage<PageProps<'users/index'>>()`.

Without `Register`, pass the app explicitly: `InertiaConfigOf<typeof app>`,
`createRoutes<typeof app>()`.

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

// Errors on the page, typed by the same body; pass the form's error bag if it sends one
store.errors(usePage().props.errors, 'createUser').email
```

Without `fields()`, type the form directly: `useForm<FormOf<typeof app, 'post', '/users'>>({ ... })`.
`BodyOf`, `QueryOf`, `ParamsOf`, `ErrorsOf` and `PathsOf` are exported from
`elysia-inertia/client` for anything else. Lower-level building blocks
(`buildPage`, `serializePage`, …) live in `elysia-inertia/internal`.

## Development

```sh
bun install
bun test        # runtime behaviour, mapped to the spec sections
bun run typecheck  # includes test/**/*.test-d.ts type assertions
bun run build     # JavaScript and declarations in dist/
bun run check:package # public exports, consumer types, and browser bundle
```

To use the package locally before publishing:

```sh
bun pm pack
# In another project:
bun add /path/to/elysia-inertia-0.2.0.tgz
```

Packing builds the package automatically. Only `dist/`, the README, and
package metadata are included. `bun publish` runs the tests, type checks,
and package checks before publishing version `0.2.0` to the configured
registry.
