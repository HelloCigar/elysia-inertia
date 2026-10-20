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
	/** Joined `head` tags from SSR, or the empty string */
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
 * Register component names to restrict `{ inertia: '...' }` and `render()`
 * to known pages
 *
 * ```ts
 * declare module 'elysia-inertia' {
 *   interface InertiaPages { 'users/index': true; dashboard: true }
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
