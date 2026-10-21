import {
	Elysia,
	macroType,
	type AnySchema,
	type Context,
	type MacroTypeLambda,
	type UnwrapSchema
} from 'elysia'

import {
	cookieFlashStore,
	hasFlashData,
	type FlashContext,
	type FlashData,
	type FlashStore,
	type FlashValues,
	type UnconfiguredFlash
} from './flash.js'
import { defaultRootView, pageBody, renderSSR, type SSROptions } from './html.js'
import { buildPage, type RescueHandler } from './page.js'
import {
	always,
	deepMerge,
	defer,
	isInertiaProp,
	merge,
	once,
	optional,
	prepend,
	scroll
} from './props.js'
import { backUrl, pageUrl, parseInertiaRequest } from './request.js'
import { viteAssets, type ViteOptions } from './vite.js'
import { isValidationError, validationErrors } from './validation.js'
import type {
	ComponentName,
	FormErrors,
	InertiaRequest,
	InertiaResponse,
	MaybePromise,
	PagePropsFor,
	PageRenderProps,
	Props,
	RootViewContext
} from './types.js'
import type { QueryValue } from './routes.js'
import { buildUrl } from './url.js'

export interface InertiaOptions<Shared extends Props = {}, Flash extends object = {}> {
	/**
	 * Current asset version, e.g. a hash of the Vite manifest. A GET visit
	 * holding another version is answered with a 409 full reload.
	 * Defaults to the manifest's hash in production when `vite` is set
	 */
	version?: string | (() => MaybePromise<string>)
	/**
	 * Load the Vite entry on the initial load: the dev server's scripts in
	 * dev, the built JS and CSS from the manifest in production. The tags
	 * are added to `head`, so a custom `rootView` gets them too
	 */
	vite?: ViteOptions
	/** Props merged into every page */
	share?: (context: Context) => MaybePromise<Shared>
	/** Build the HTML document for the initial load */
	rootView?: (context: RootViewContext) => MaybePromise<string>
	/** Mount element id, matched by the payload's `data-page` (default `app`) */
	id?: string
	/** Pre-render the initial load; falls back to client rendering on failure */
	ssr?: SSROptions | false
	/** Default for `encryptHistory` on every page */
	encryptHistory?: boolean
	/** Report a rescued deferred prop's error (default `console.error`) */
	onRescue?: RescueHandler
	/**
	 * Where errors and flash data wait for the next page (default: a cookie).
	 * Its type parameter types `flash()`: `cookieFlashStore<{ toast: string }>()`
	 */
	flash?: FlashStore<Flash>
	/**
	 * A failed `body`/`query`/`params` schema on a non-GET Inertia request
	 * flashes the field errors and redirects back with a 303. Pass `false`
	 * to keep Elysia's 422, or customise the errors and the redirect
	 */
	validation?:
		| false
		| {
				errors?: (error: import('elysia').ValidationError) => Record<string, string>
				redirect?: (request: Request) => string
		  }
}

/** Fills `redirect()`'s route pattern and appends to its query */
export interface RedirectOptions {
	params?: Record<string, unknown>
	query?: Record<string, QueryValue | QueryValue[]>
}

export interface RenderOptions {
	status?: number
}

/** `render()`'s arguments: the props are required when the page requires some */
export type RenderArgs<Component, Shared> =
	{} extends PageRenderProps<Component, Shared>
		? [props?: PageRenderProps<Component, Shared>, options?: RenderOptions]
		: [props: PageRenderProps<Component, Shared>, options?: RenderOptions]

type RenderResult<Component extends string> = Promise<InertiaResponse<Component, PagePropsFor<Component>>>

/** Lets `share()` queue props that resolve only when a page renders */
export const addSharedResolver = Symbol('inertia.addSharedResolver')

const MUTATING_METHODS = new Set(['PUT', 'PATCH', 'DELETE'])

const defaultFlashStore = cookieFlashStore()

const resolveVersion = async ({ version, vite }: InertiaOptions<any, any>) =>
	typeof version === 'function'
		? await version()
		: (version ?? (vite ? viteAssets(vite).version() : ''))

/**
 * Per-request Inertia API, available as `inertia` on the Elysia context
 */
export class InertiaContext<Shared extends Props = {}, Flash extends object = {}> {
	readonly request: InertiaRequest

	// Prop helpers, so `({ inertia: { defer } })` needs no extra import
	readonly always = always
	readonly optional = optional
	readonly defer = defer
	readonly merge = merge
	readonly prepend = prepend
	readonly deepMerge = deepMerge
	readonly once = once
	readonly scroll = scroll

	#sharedResolvers: (() => MaybePromise<Props>)[] = []
	#clearHistory = false
	#encryptHistory: boolean
	#pending: FlashData = {}
	readonly #store: FlashStore<Flash>

	constructor(
		private readonly context: Context,
		private readonly options: InertiaOptions<Shared, Flash>
	) {
		this.request = parseInertiaRequest(context.request.headers)
		this.#encryptHistory = options.encryptHistory ?? false
		this.#store = options.flash ?? (defaultFlashStore as FlashStore<Flash>)

		// Bound, so methods still work destructured: `({ inertia: { redirect } })`
		this.errors = this.errors.bind(this)
		this.flash = this.flash.bind(this)
		this.clearHistory = this.clearHistory.bind(this)
		this.encryptHistory = this.encryptHistory.bind(this)
		this.render = this.render.bind(this)
		this.location = this.location.bind(this)
		this.redirect = this.redirect.bind(this)
		this.back = this.back.bind(this)
	}

	get #flashContext(): FlashContext {
		return this.context as unknown as FlashContext
	}

	/**
	 * Validation errors for the next rendered page, usually followed by
	 * `back()`. Namespaced under the request's `X-Inertia-Error-Bag`, or `bag`.
	 * Pass the body type to check the keys: `inertia.errors<typeof body>(...)`
	 */
	errors<Body = Props>(errors: FormErrors<Body>, bag?: string): this {
		this.#pending.errors = { ...this.#pending.errors, ...errors }
		this.#pending.errorBag = bag ?? this.request.errorBag
		this.#store.write(this.#flashContext, this.#pending)
		return this
	}

	/** Ephemeral data for the next rendered page, sent as `page.flash` */
	flash<K extends keyof FlashValues<Flash> & string>(key: K, value: FlashValues<Flash>[K]): this
	flash(data: FlashValues<Flash>): this
	flash(keyOrData: string | Record<string, unknown>, value?: unknown): this {
		this.#pending.flash = {
			...this.#pending.flash,
			...(typeof keyOrData === 'string' ? { [keyOrData]: value } : keyOrData)
		}
		this.#store.write(this.#flashContext, this.#pending)
		return this
	}

	/** @internal */
	[addSharedResolver](resolve: () => MaybePromise<Props>): void {
		this.#sharedResolvers.push(resolve)
	}

	/** Wipe the client's history stack on this navigation, e.g. after logout */
	clearHistory(enabled = true): this {
		this.#clearHistory = enabled
		return this
	}

	/** Encrypt the history state the client stores for this page */
	encryptHistory(enabled = true): this {
		this.#encryptHistory = enabled
		return this
	}

	/**
	 * Render a page: JSON for an Inertia visit, the HTML document otherwise.
	 * The props are checked against the props the page declares
	 */
	async render<const Component extends ComponentName>(
		component: Component,
		...[props, { status = 200 } = {}]: RenderArgs<Component, Shared>
	): RenderResult<Component> {
		const { context, options, request } = this

		// Consume what the previous request flashed, plus anything set on this one
		const incoming = await this.#store.read(this.#flashContext)
		const errors = { ...incoming?.errors, ...this.#pending.errors }
		const bag = this.#pending.errorBag ?? incoming?.errorBag ?? request.errorBag
		const flash = { ...incoming?.flash, ...this.#pending.flash }
		if (hasFlashData(incoming) || hasFlashData(this.#pending))
			this.#store.write(this.#flashContext, undefined)
		this.#pending = {}

		const merged: Props = {
			errors: bag && Object.keys(errors).length ? { [bag]: errors } : errors,
			...(await options.share?.(context)),
			...Object.assign({}, ...(await Promise.all(this.#sharedResolvers.map((resolve) => resolve())))),
			...(props as Props | undefined)
		}
		// Errors are always sent, even when a partial reload excludes them
		if (!isInertiaProp(merged.errors)) merged.errors = always(merged.errors)

		const page = await buildPage({
			component,
			props: merged,
			url: pageUrl(context.request),
			version: await resolveVersion(options),
			request,
			clearHistory: this.#clearHistory,
			encryptHistory: this.#encryptHistory,
			onRescue: options.onRescue,
			flash
		})

		if (request.isInertia)
			return new Response(JSON.stringify(page), {
				status,
				headers: {
					'content-type': 'application/json',
					'x-inertia': 'true',
					vary: 'X-Inertia'
				}
			}) as Awaited<RenderResult<Component>>

		const ssr = options.ssr ? await renderSSR(page, options.ssr) : undefined
		const html = await (options.rootView ?? defaultRootView)({
			page,
			head: (options.vite ? viteAssets(options.vite).tags() : '') + (ssr?.head?.join('') ?? ''),
			body: ssr?.body ?? pageBody(page, options.id),
			request: context.request
		})

		return new Response(html, {
			status,
			headers: {
				'content-type': 'text/html; charset=utf-8',
				vary: 'X-Inertia'
			}
		}) as Awaited<RenderResult<Component>>
	}

	/**
	 * Leave the SPA with a full browser visit, e.g. to an external site.
	 * Outside an Inertia visit this is a plain redirect
	 */
	location(url: string): Response {
		if (this.request.isInertia)
			return new Response(null, {
				status: 409,
				headers: { 'x-inertia-location': url }
			})

		return new Response(null, { status: 302, headers: { location: url } })
	}

	/**
	 * Redirect with a 303, so the client follows with a GET whatever the
	 * request's method. Fills a route pattern's `params` and appends `query`;
	 * errors and flash set on this request carry over
	 *
	 * ```ts
	 * inertia.flash('toast', 'Saved').redirect('/users/:id', { params: { id } })
	 * ```
	 */
	redirect(url: string, options?: RedirectOptions): Response {
		return new Response(null, {
			status: 303,
			headers: { location: buildUrl(url, options) }
		})
	}

	/**
	 * Redirect to the previous page (the Referer's path on this site), or
	 * `fallback` without a Referer
	 */
	back(fallback = '/'): Response {
		return new Response(null, {
			status: 302,
			headers: { location: backUrl(this.context.request, fallback) }
		})
	}
}

/** The macro's `render`, bound to its route's page */
export type RenderFor<Component extends string, Shared = {}> = (
	...args: RenderArgs<Component, Shared>
) => RenderResult<Component>

type RenderOutput<Component, Shared> = { render: RenderFor<Component & string, Shared> }

interface RenderLambda<Shared> extends MacroTypeLambda {
	option: ComponentName
	output: RenderOutput<this['input'], Shared>
}

// What `errors()` chains into. Not `flash()`: the macro can't see the
// configured store's type, so use `inertia.flash()` for that
type AfterErrors = Pick<InertiaContext, 'back' | 'location' | 'redirect' | 'render'>

interface FormOutput<Body> {
	body: Body
	/** `inertia.errors()` with keys checked against the form's fields */
	errors(errors: FormErrors<Body>, bag?: string): AfterErrors
}

interface FormLambda extends MacroTypeLambda {
	output: FormOutput<UnwrapSchema<this['input'] & AnySchema>>
}

// The configured instance's options, per request. A feature plugin can
// `.use(inertia())` for the macro and types and still follow the app's config,
// whichever order the two are registered in
const activeOptions = new WeakMap<Request, InertiaOptions<any, any>>()
let configuredInstances = 0

const optionsFor = (request: Request, fallback: InertiaOptions<any, any>) =>
	activeOptions.get(request) ?? fallback

const isPlainObject = (value: unknown) =>
	typeof value === 'object' &&
	value !== null &&
	[Object.prototype, null].includes(Object.getPrototypeOf(value))

const warnedPlainProps = new Set<string>()

/**
 * Inertia v3 server adapter for Elysia 2. Configure it once and `.use()` the
 * same instance everywhere; a feature plugin may also `.use(inertia())`
 * without options, which follows the configured instance
 *
 * ```ts
 * export const pages = inertia({ version: '1' })
 *
 * new Elysia()
 *   .use(pages)
 *   .get('/users', { inertia: 'users/index' }, ({ render }) =>
 *     render({ users: [] })
 *   )
 * ```
 */
export function inertia(): InertiaPlugin<{}, UnconfiguredFlash>
export function inertia<Shared extends Props = {}, Flash extends object = {}>(
	options: InertiaOptions<Shared, Flash>
): InertiaPlugin<Shared, Flash>
export function inertia(options?: InertiaOptions<any, any>): unknown {
	if (!options) return core

	const own: InertiaOptions<any, any> = options

	return new Elysia({ name: 'elysia-inertia/config', seed: ++configuredInstances })
		// onRequest runs for every route of the app, even ones registered
		// before this plugin, so the config is in place for all of them
		.onRequest(({ request }) => {
			const current = activeOptions.get(request)
			if (current && current !== own)
				console.warn(
					'[inertia] Two inertia() instances with options handle this request; configure it once and reuse the instance'
				)
			else activeOptions.set(request, own)
		})
		.use(core)
		.as('plugin')
}

const createCore = <Shared extends Props = {}, Flash extends object = {}>() =>
	new Elysia({ name: 'elysia-inertia' })
		.derive('plugin', (context) => ({
			inertia: new InertiaContext<Shared, Flash>(
				context as Context,
				optionsFor(context.request, {}) as InertiaOptions<Shared, Flash>
			)
		}))
		.macro({
			/** Bind the route to a page component and add a typed `render` */
			inertia: (component: ComponentName) => ({
				$type: macroType<RenderLambda<Shared>>(),
				derive: ({ inertia }: { inertia: InertiaContext }) =>
					({
						render: (props?: Props, renderOptions?: RenderOptions) =>
							(inertia.render as (...args: unknown[]) => unknown)(component, props, renderOptions)
					}) as {},
				// Plain props skip the page types, so they are sent as plain JSON;
				// say so once, since this used to render
				afterHandle: ({ responseValue }: { responseValue: unknown }) => {
					if (!isPlainObject(responseValue) || warnedPlainProps.has(component)) return
					warnedPlainProps.add(component)
					console.warn(
						`[inertia] The "${component}" route returned plain props; return render(props) to render the page`
					)
				}
			}),
			/**
			 * A form submission's body schema, usually set by `formBody()`:
			 * validates like `body` and adds `errors()`, whose keys are checked
			 * against the schema's fields. Alone it doesn't type the route's
			 * body for the client; `formBody()` sets `body` too
			 */
			form: (schema: AnySchema) => ({
				$type: macroType<FormLambda>(),
				body: schema,
				derive: ({ inertia }: { inertia: InertiaContext }) =>
					({
						errors: (errors: Record<string, string>, bag?: string) =>
							inertia.errors(errors, bag)
					}) as {}
			})
		})
		// Stale client assets: force a full reload (protocol section 7)
		.onBeforeHandle('plugin', async ({ request }) => {
			if (
				request.method !== 'GET' ||
				request.headers.get('x-inertia') !== 'true'
			)
				return

			const version = await resolveVersion(optionsFor(request, {}))
			if ((request.headers.get('x-inertia-version') ?? '') === version)
				return

			return new Response(null, {
				status: 409,
				// Path + query, so a proxy's internal host never leaks into the redirect
				headers: { 'x-inertia-location': pageUrl(request) }
			})
		})
		// A failed request schema on a form submission: flash the field errors
		// and go back, the Inertia validation flow (protocol section 17)
		.onError('plugin', (context: { error: unknown; request: Request }) => {
			const { error, request } = context
			const { validation, flash } = optionsFor(request, {})

			if (
				validation === false ||
				!isValidationError(error) ||
				error.type === 'response' ||
				request.method === 'GET' ||
				request.headers.get('x-inertia') !== 'true'
			)
				return

			// Validation may fail before Elysia sets up the context fully, so the
			// store writes into a header bag that goes on the response directly
			const set = { headers: {} as Record<string, string | string[]> }
			const store = flash ?? defaultFlashStore
			store.write({ request, set } as FlashContext, {
				errors: (validation?.errors ?? validationErrors)(error),
				errorBag: request.headers.get('x-inertia-error-bag')
			})

			const headers = new Headers({
				location: (validation?.redirect ?? backUrl)(request)
			})
			for (const [key, value] of Object.entries(set.headers))
				for (const item of [value].flat()) headers.append(key, item)

			return new Response(null, { status: 303, headers })
		})
		// 302 after PUT/PATCH/DELETE would repeat the method (protocol section 8a)
		.mapResponse('plugin', ({ request, responseValue, set }) => {
			if (!MUTATING_METHODS.has(request.method)) return

			if (responseValue instanceof Response) {
				if (responseValue.status === 302)
					return new Response(responseValue.body, {
						status: 303,
						headers: responseValue.headers
					})
			} else if (set.status === 302 || set.status === 'Found')
				set.status = 303
		})

const core = createCore()

/** The plugin's type, with the configured shared props and flash data */
export type InertiaPlugin<Shared extends Props = {}, Flash extends object = {}> = ReturnType<
	typeof createCore<Shared, Flash>
>
