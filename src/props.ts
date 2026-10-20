import type { MaybePromise } from './types.js'

/** A prop value, or a function producing it (called only when the prop is sent) */
export type Resolvable<T> = T | (() => MaybePromise<T>)

export type MergeStrategy = 'append' | 'prepend' | 'deep'

export type PageId = string | number | null

export interface ScrollCursor {
	currentPage: PageId
	nextPage: PageId
	previousPage: PageId
}

export interface ScrollOptions<T = any> {
	/** Query-string parameter the client increments (default `page`) */
	pageName?: string
	/** Key of the array inside the paginated value (default `data`) */
	dataKey?: string
	/**
	 * Read the cursor from the resolved value. Defaults to `currentPage`,
	 * `nextPage` and `previousPage` on the value or on its `meta` object
	 */
	cursor?: (value: T) => ScrollCursor
}

export interface OnceOptions {
	/** Client cache key; defaults to the prop path */
	key?: string
	/** Absolute expiry as epoch-ms or a Date; `null` never expires */
	expiresAt?: number | Date | null
	/** Expiry in milliseconds from render time */
	ttl?: number
}

export interface PropConfig {
	/** `optional` and `deferred` props are skipped on a full visit */
	lazy?: 'optional' | 'deferred'
	/** Deferred group: one follow-up request per group */
	group: string
	/** Sent on every response, whatever a partial reload asks for */
	always: boolean
	/** Failed deferred resolution is listed in `rescuedProps` instead of thrown */
	rescue: boolean
	/** How the client combines the incoming value with the one it holds */
	merge?: MergeStrategy
	/** Keys that dedupe merged array items */
	matchOn: string[]
	/** Client-cached across visits */
	once?: OnceOptions
	/** Resend a once prop even when the client holds it */
	fresh: boolean
	/** Paginated value for infinite scroll */
	scroll?: Required<Pick<ScrollOptions, 'pageName' | 'dataKey'>> &
		Pick<ScrollOptions, 'cursor'>
}

/**
 * A prop with Inertia semantics. Categories compose by chaining, e.g.
 * `defer(fn).merge().matchOn('id')`. `Lazy` records at the type level whether
 * the client may be missing the prop, so its page props type marks it optional
 */
export class InertiaProp<T = unknown, Lazy extends boolean = boolean> {
	declare readonly '~lazy': Lazy

	constructor(
		readonly value: Resolvable<T>,
		readonly config: PropConfig
	) {}

	/** Never sent on a full visit, nor announced; only when a partial reload asks */
	optional(): InertiaProp<T, true> {
		this.config.lazy = 'optional'
		return this as InertiaProp<T, true>
	}

	/**
	 * Skipped on a full visit but announced in `deferredProps`; the client
	 * fetches each group with one partial reload after mounting
	 */
	defer(group = 'default'): InertiaProp<T, true> {
		this.config.lazy = 'deferred'
		this.config.group = group
		return this as InertiaProp<T, true>
	}

	/**
	 * When a deferred prop fails to resolve, omit it and list it in
	 * `rescuedProps` so the client shows its error state
	 */
	rescue(enabled = true): this {
		this.config.rescue = enabled
		return this
	}

	/** Client appends the incoming array to the one it holds */
	merge(): this {
		this.config.merge = 'append'
		return this
	}

	/** Client prepends the incoming array before the one it holds */
	prepend(): this {
		this.config.merge = 'prepend'
		return this
	}

	/** Client recursively merges the incoming value into the one it holds */
	deepMerge(): this {
		this.config.merge = 'deep'
		return this
	}

	/** Dedupe merged array items by these keys instead of concatenating */
	matchOn(...keys: (string | string[])[]): this {
		this.config.matchOn.push(...keys.flat())
		this.config.merge ??= 'append'
		return this
	}

	/** Resolve once, then let the client cache it across visits */
	once(options: OnceOptions = {}): this {
		this.config.once = { ...this.config.once, ...options }
		return this
	}

	/** Send a once prop's value even when the client says it holds one */
	fresh(enabled = true): this {
		this.config.fresh = enabled
		return this
	}

	/** Paginated `{ data, ...meta }` the client keeps extending */
	scroll(options: ScrollOptions<T> = {}): this {
		this.config.scroll = {
			pageName: options.pageName ?? 'page',
			dataKey: options.dataKey ?? 'data',
			cursor: options.cursor
		}
		return this
	}
}

export const isInertiaProp = (value: unknown): value is InertiaProp =>
	value instanceof InertiaProp

const prop = <T>(value: Resolvable<T>, config: Partial<PropConfig> = {}) =>
	new InertiaProp<T, false>(value, {
		group: 'default',
		always: false,
		rescue: false,
		matchOn: [],
		fresh: false,
		...config
	})

/** Sent on every response; immune to partial-reload cherry-picking */
export const always = <T>(value: Resolvable<T>) => prop(value, { always: true })

/** Never sent on a full visit, nor announced; only when a partial reload asks */
export const optional = <T>(value: Resolvable<T>) => prop(value).optional()

/** Skipped on a full visit, announced, and fetched by the client after mount */
export const defer = <T>(value: Resolvable<T>, group = 'default') =>
	prop(value).defer(group)

/** Client appends the incoming array instead of replacing it */
export const merge = <T>(value: Resolvable<T>) => prop(value).merge()

/** Client prepends the incoming array instead of replacing it */
export const prepend = <T>(value: Resolvable<T>) => prop(value).prepend()

/** Client deep-merges the incoming value instead of replacing it */
export const deepMerge = <T>(value: Resolvable<T>) => prop(value).deepMerge()

/** Resolved once, then cached by the client and skipped while it holds it */
export const once = <T>(value: Resolvable<T>, options?: OnceOptions) =>
	prop(value).once(options)

/** A paginated value the client keeps extending (infinite scroll) */
export const scroll = <T>(value: Resolvable<T>, options?: ScrollOptions<T>) =>
	prop(value).scroll(options)

/** Prop helpers, also exported individually */
export const Inertia = {
	always,
	optional,
	defer,
	merge,
	prepend,
	deepMerge,
	once,
	scroll
}
