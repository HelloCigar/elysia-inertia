import type { InertiaProp } from './props.js'

export type MaybePromise<T> = T | Promise<T>

export type Props = Record<string, unknown>

/** The JSON document exchanged on every render (protocol section 3) */
export interface PageObject<Component extends string = string, P = Props> {
	component: Component
	url: string
	version: string
	props: P
	deferredProps?: Record<string, string[]>
	mergeProps?: string[]
	deepMergeProps?: string[]
	prependProps?: string[]
	matchPropsOn?: string[]
	scrollProps?: Record<
		string,
		{
			pageName: string
			currentPage: string | number | null
			nextPage: string | number | null
			previousPage: string | number | null
			reset: boolean
		}
	>
	onceProps?: Record<string, { prop: string; expiresAt: number | null }>
	rescuedProps?: string[]
	clearHistory?: boolean
	encryptHistory?: boolean
	flash?: Record<string, unknown>
}

/** Inertia request headers, parsed (protocol section 4) */
export interface InertiaRequest {
	/** `X-Inertia: true` was sent: respond with JSON, not HTML */
	isInertia: boolean
	/** `X-Inertia-Version`; absent compares as the empty string */
	version: string
	partialComponent: string | null
	only: string[]
	except: string[]
	reset: string[]
	errorBag: string | null
	exceptOnceProps: string[]
	mergeIntent: 'append' | 'prepend'
}

export interface SSRResult {
	head: string[]
	body: string
}

export interface RootViewContext {
	page: PageObject
	/** The `vite` asset tags, then the joined `head` tags from SSR; may be empty */
	head: string
	/** The page payload script plus the mount element */
	body: string
	request: Request
}

declare const inertiaPage: unique symbol

/**
 * A rendered Inertia response. The component name and props type ride along
 * at the type level, so `InferPages` can read them back from Elysia's route table
 */
export interface InertiaResponse<
	Component extends string = string,
	P = Props
> extends Response {
	readonly [inertiaPage]: { component: Component; props: P }
}

/**
 * The app's pages: each name maps to the props its component declares,
 * which `render()` is checked against, or `true` for a name with any props.
 * Usually generated from the page files by `inertiaPages()`
 *
 * ```ts
 * declare module 'elysia-inertia' {
 *   interface InertiaPages { 'users/index': { users: User[] }; legacy: true }
 * }
 * ```
 */
export interface InertiaPages {}

/**
 * The component names a route may render. Unregistered, any string is
 * accepted; the `''` member keeps a route's literal name from widening
 */
export type ComponentName = keyof InertiaPages extends never
	? '' | (string & {})
	: keyof InertiaPages & string

/** A function or class component's props; `{}` for one that takes none */
export type PropsOf<Component> = Component extends new (props: infer P, ...rest: any[]) => unknown
	? unknown extends P
		? {}
		: P
	: Component extends (props: infer P, ...rest: any[]) => unknown
		? unknown extends P
			? {}
			: P
		: {}

declare const unchecked: unique symbol

/** A page whose props aren't checked: `true`, or no pages registered */
export type Unchecked = { readonly [unchecked]: true }

/** The props a page declares, or `Unchecked` */
export type DeclaredProps<Component> = keyof InertiaPages extends never
	? Unchecked
	: Component extends keyof InertiaPages
		? InertiaPages[Component] extends true
			? Unchecked
			: InertiaPages[Component]
		: Unchecked

/**
 * One page's props as its component declares them (see `InertiaPages`)
 *
 * ```ts
 * const { props } = usePage<PageProps<'users/index'>>()
 * ```
 */
export type PageProps<Component extends keyof InertiaPages> = PagePropsFor<Component>

/** `PageProps` for any name; `Props` for an unchecked page */
export type PagePropsFor<Component> =
	DeclaredProps<Component> extends Unchecked ? Props : DeclaredProps<Component>

type Primitive = string | number | bigint | boolean | symbol | null | undefined

/**
 * What `render()` takes where the client receives `T`: the value itself, or
 * functions and promises resolving to it, also inside objects and arrays.
 * Only `T`'s own types pass, so a `Date` for a `string` prop is an error
 */
export type PropInput<T> =
	| PlainInput<T>
	| (() => MaybePromise<PlainInput<T>>)
	| PromiseLike<PlainInput<T>>

type PlainInput<T> = T extends Primitive
	? T
	: T extends readonly (infer Item)[]
		? readonly PropInput<Item>[]
		: T extends object
			? { [K in keyof T]: PropInput<T[K]> }
			: T

// A key the page marks `?`
type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T]

/**
 * A prop at a static object path, where prop helpers may sit too. Lazy ones
 * (`defer`, `optional`) leave the prop out of the first render, so only a
 * prop the page lets be missing may be lazy
 */
type FieldInput<T, MayBeMissing extends boolean> =
	| PropInput<T>
	| InertiaProp<PlainInput<T>, MayBeMissing extends true ? boolean : false>
	| (T extends Primitive | readonly unknown[] ? never : T extends object ? RenderProps<T> : never)

type Flatten<T> = { [K in keyof T]: T[K] } & {}

/**
 * What `render()` takes for a page declaring props `T`. A page without
 * props takes none: `{}` would accept any object
 */
export type RenderProps<T> = [keyof T] extends [never] ? Record<string, never> : Flatten<
	{
		[K in keyof T as K extends OptionalKeys<T> ? never : K]: FieldInput<
			T[K],
			undefined extends T[K] ? true : false
		>
	} & {
		[K in keyof T as K extends OptionalKeys<T> ? K : never]?: FieldInput<
			Exclude<T[K], undefined>,
			true
		>
	}
>

/**
 * `render()`'s props for a page: `errors` comes from `errors()` and the
 * shared props from `share`, so neither is required, but a shared one may
 * be overridden
 */
export type PageRenderProps<Component, Shared> =
	DeclaredProps<Component> extends infer P
		? P extends Unchecked
			? Props
			: RenderProps<
					Omit<P, 'errors' | keyof Shared> & Partial<Pick<P, Exclude<keyof P & keyof Shared, 'errors'>>>
				>
		: never

/**
 * Register your app once to drop the `typeof app` generic from the type
 * helpers and `createRoutes()`
 *
 * ```ts
 * declare module 'elysia-inertia' {
 *   interface Register { app: typeof app }
 * }
 * ```
 */
export interface Register {}

export type RegisteredApp = Register extends {
	app: infer App extends { '~Routes': unknown }
}
	? App
	: { '~Routes': {} }

type Leaf = Date | Blob | ((...args: never[]) => unknown)

/**
 * A form's field keys as dot paths (`address.city`, `tags.0`), the keys
 * validation errors use and Inertia's `form.errors` reads
 */
export type FieldPath<T, Depth extends 1[] = []> = Depth['length'] extends 8
	? string
	: T extends Leaf
		? never
		: T extends readonly (infer Item)[]
			? `${number}` | `${number}.${FieldPath<NonNullable<Item>, [...Depth, 1]>}`
			: T extends object
				? string extends keyof T
					? string
					: {
							[K in keyof T & string]: K | `${K}.${FieldPath<NonNullable<T[K]>, [...Depth, 1]>}`
						}[keyof T & string]
				: never

/** Validation errors for a form: a message per field path */
export type FormErrors<Body = Props> = Partial<Record<FieldPath<Body>, string>>
