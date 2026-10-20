/**
 * Read Elysia's route table at the type level: one entry per route, with its
 * path pattern, method and validated input types
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface RouteEntry<Path extends string, Method extends string, Route> {
	path: Path
	method: Method
	route: Route
}

type FlattenRoutes<Node, Prefix extends string> = {
	[K in keyof Node & string]: Node[K] extends { response: unknown }
		? K extends HttpMethod
			? RouteEntry<Prefix extends '' ? '/' : Prefix, K, Node[K]>
			: never
		: FlattenRoutes<Node[K], `${Prefix}/${K}`>
}[keyof Node & string]

export type RoutesOf<App extends { '~Routes': unknown }> = FlattenRoutes<
	App['~Routes'],
	''
>

/** Every path pattern the app serves, optionally for one method */
export type PathsOf<
	App extends { '~Routes': unknown },
	Method extends HttpMethod = HttpMethod
> =
	RoutesOf<App> extends infer Entry
		? Entry extends { method: Method; path: infer Path } ? Path : never
		: never

export type RouteOf<
	App extends { '~Routes': unknown },
	Method extends HttpMethod,
	Path extends PathsOf<App, Method>
> =
	RoutesOf<App> extends infer Entry
		? Entry extends { method: Method; path: Path; route: infer Route }
			? Route
			: never
		: never

type Known<T, Fallback> = unknown extends T ? Fallback : T

/** A route's validated body, from its `body` schema */
export type BodyOf<
	App extends { '~Routes': unknown },
	Method extends HttpMethod,
	Path extends PathsOf<App, Method>
> = Known<RouteOf<App, Method, Path> extends { body: infer B } ? B : unknown, Record<string, unknown>>

export type QueryValue = string | number | boolean | null | undefined

/** A route's validated query, from its `query` schema */
export type QueryOf<
	App extends { '~Routes': unknown },
	Method extends HttpMethod,
	Path extends PathsOf<App, Method>
> = Known<
	RouteOf<App, Method, Path> extends { query: infer Q } ? Q : unknown,
	Record<string, QueryValue | QueryValue[]>
>

/** A route's path parameters, from its pattern or its `params` schema */
export type ParamsOf<
	App extends { '~Routes': unknown },
	Method extends HttpMethod,
	Path extends PathsOf<App, Method>
> = RouteOf<App, Method, Path> extends { params: infer P } ? P : {}

/** The form data `useForm` should hold for a route: its body */
export type FormOf<
	App extends { '~Routes': unknown },
	Method extends HttpMethod,
	Path extends PathsOf<App, Method>
> = BodyOf<App, Method, Path>
