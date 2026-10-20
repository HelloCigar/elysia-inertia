/**
 * Client helpers. Import types only from your server, so no server code
 * reaches the browser bundle:
 *
 * ```ts
 * import { createRoutes } from 'elysia-inertia/client'
 * import type { app } from '../server'
 *
 * export const { url, action } = createRoutes<typeof app>()
 * ```
 */
import type { InertiaConfigOf, InferPages, PageProps } from './infer'
import type { FormErrors, RegisteredApp } from './types'
import type {
	BodyOf,
	HttpMethod,
	ParamsOf,
	PathsOf,
	QueryOf,
	QueryValue
} from './routes'

export type { PageProps } from './infer'
export type { Register } from './types'
export type {
	BodyOf,
	FormOf,
	HttpMethod,
	ParamsOf,
	PathsOf,
	QueryOf,
	RoutesOf
} from './routes'

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

/** The page names the registered app renders (see `Register`) */
export type PageName = keyof InferPages<RegisteredApp> & string

// Later props win, as when `render()` spreads them
type Override<A, B> = { [K in keyof (Omit<A, keyof B> & B)]: (Omit<A, keyof B> & B)[K] } & {}

/** `page.props.errors` as Inertia types it: flat, or namespaced by error bag */
export type PageErrors = Record<string, string> & Record<string, Record<string, string>>

/**
 * What a page component receives: errors, the shared props, then its own,
 * each overriding the last
 */
export type PageComponentProps<Name extends PageName> = Override<
	Override<{ errors: PageErrors }, InertiaConfigOf['sharedPageProps']>,
	PageProps<Name>
>

/** A component that accepts every prop its routes render */
export type PageComponent<Name extends PageName> = (
	props: PageComponentProps<Name>
) => unknown

declare const pageName: unique symbol

/** Marks a component with the page `definePage` typed it for */
export interface PageBrand<Name extends string> {
	readonly [pageName]?: Name
}

/**
 * Type a page component from the server: the name is checked against the
 * registered app and the props are inferred from what its routes render
 *
 * ```tsx
 * export default definePage('users/index', ({ users }) => <List users={users} />)
 * ```
 */
export const definePage = <
	const Name extends PageName,
	Component extends PageComponent<Name>
>(
	_name: Name,
	component: Component
): Component & PageBrand<Name> => component

/** A function or class component taking `P` */
type AcceptsProps<P> = ((props: P) => unknown) | (new (props: P) => unknown)

/**
 * Used by the generated `inertia-pages.check.ts`: a page file's default
 * export must accept its routes' props and, from `definePage`, name the
 * page its file is. Pages no typed route renders, and apps without
 * `Register`, are only name-checked
 */
export type CheckPage<
	Name extends string,
	Component extends AcceptsProps<Name extends PageName ? PageComponentProps<Name> : never> &
		PageBrand<Name>
> = Component
