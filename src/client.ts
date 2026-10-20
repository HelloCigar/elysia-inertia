/**
 * Client helpers. Import types only from your server, so no server code
 * reaches the browser bundle:
 *
 * ```ts
 * import { createRoutes } from 'elysia-inertia/client'
 * import type { app } from '../server.js'
 *
 * export const { url, action } = createRoutes<typeof app>()
 * ```
 */
import type { FormErrors, InertiaPages, RegisteredApp } from './types.js'
import type {
	BodyOf,
	HttpMethod,
	ParamsOf,
	PathsOf,
	QueryOf,
	QueryValue
} from './routes.js'

export type { InertiaPages, PageProps, PropsOf, Register } from './types.js'
export type {
	BodyOf,
	FormOf,
	HttpMethod,
	ParamsOf,
	PathsOf,
	QueryOf,
	RoutesOf
} from './routes.js'

type AnyApp = { '~Routes': unknown }

type UrlOptions<Params, Query> = ({} extends Params
	? { params?: Params }
	: { params: Params }) & { query?: Query }

/** Path parameters are required exactly when the path has some */
type UrlArgs<Params, Query> = {} extends Params
	? [options?: UrlOptions<Params, Query>]
	: [options: UrlOptions<Params, Query>]

/**
 * A form's submit target, `{ url, method }` as `form.submit()` takes it,
 * plus `fields()` to type the form data from the route's body schema
 */
export interface FormAction<Method extends HttpMethod, Body> {
	url: string
	method: Method
	/** Typed identity: `useForm(store.fields({ ... }))` infers the body type */
	fields(data: Body): Body
	/**
	 * This form's errors from `page.props.errors`, keyed by its fields; pass
	 * the error bag the form submits with to read its namespace
	 */
	errors(errors: object, bag?: string): FormErrors<Body>
}

/** A route's validation errors, keyed by its body's dot paths */
export type ErrorsOf<
	App extends AnyApp,
	Method extends HttpMethod,
	Path extends PathsOf<App, Method>
> = FormErrors<BodyOf<App, Method, Path>>

const buildUrl = (
	path: string,
	options: { params?: object; query?: object } = {}
) => {
	const params = (options.params ?? {}) as Record<string, unknown>
	// A param name runs to the next `/`, like Elysia's router (`:user-id`)
	const url = path.replace(/:([^/?]+)\??|\*/g, (match, name?: string) => {
		const value = params[name ?? '*']
		if (value === undefined || value === null) {
			if (match.endsWith('?')) return ''
			throw new TypeError(`[inertia] Missing "${name ?? '*'}" for ${path}`)
		}
		return name
			? encodeURIComponent(String(value))
			: String(value).split('/').map(encodeURIComponent).join('/')
	})

	const search = new URLSearchParams()
	for (const [key, value] of Object.entries(options.query ?? {}))
		for (const item of [value as QueryValue | QueryValue[]].flat())
			if (item !== undefined && item !== null) search.append(key, String(item))

	const query = search.toString()
	// An omitted optional segment can leave `//` or a trailing `/`
	const clean = url.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')

	return query ? `${clean}?${query}` : clean
}

export interface Routes<App extends AnyApp> {
	/** Build a link or visit URL; params and query are checked against the route */
	url<const Path extends PathsOf<App, 'get'>>(
		path: Path,
		...options: UrlArgs<ParamsOf<App, 'get', Path>, QueryOf<App, 'get', Path>>
	): string

	/** A form target whose `fields()` carries the route's body type */
	action<
		const Method extends HttpMethod,
		const Path extends PathsOf<App, Method>
	>(
		method: Method,
		path: Path,
		...options: UrlArgs<ParamsOf<App, Method, Path>, QueryOf<App, Method, Path>>
	): FormAction<Method, BodyOf<App, Method, Path>>
}

type UrlInput = { params?: object; query?: object }

// Typed through `Routes`; the implementation only builds strings
export const createRoutes = <App extends AnyApp = RegisteredApp>(): Routes<App> =>
	({
		url: (path: string, options?: UrlInput) => buildUrl(path, options),
		action: (method: HttpMethod, path: string, options?: UrlInput) => ({
			url: buildUrl(path, options),
			method,
			fields: (data: unknown) => data,
			errors: (errors: Record<string, unknown>, bag?: string) =>
				(bag ? errors[bag] : errors) ?? {}
		})
	}) as unknown as Routes<App>

/** The registered page names (see `InertiaPages`) */
export type PageName = keyof InertiaPages & string

/** `page.props.errors` as Inertia types it: flat, or namespaced by error bag */
export type PageErrors = Record<string, string> & Record<string, Record<string, string>>
