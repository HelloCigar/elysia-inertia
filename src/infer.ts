import type { FlashValues, UnconfiguredFlash } from './flash.js'
import type { InertiaContext } from './plugin.js'
import type { InertiaProp } from './props.js'
import type { RegisteredApp } from './types.js'

type UnionToIntersection<U> = (
	U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
	? I
	: never

type Flatten<T> = { [K in keyof T]: T[K] } & {}

// Lazy props (optional, deferred) are absent until a partial reload fetches them
type OptionalKeys<T> = {
	[K in keyof T]: undefined extends T[K]
		? K
		: T[K] extends InertiaProp<any, infer Lazy>
			? true extends Lazy
				? K
				: never
			: never
}[keyof T]

// JSON drops undefined and symbol members; functions are resolved first
type Dropped = undefined | symbol

type SerializedObject<T> = Flatten<
	{
		[K in Exclude<keyof T, OptionalKeys<T>> as T[K] extends Dropped
			? never
			: K]: Serialized<T[K]>
	} & {
		[K in OptionalKeys<T> as Exclude<T[K], undefined> extends never
			? never
			: K]?: Serialized<Exclude<T[K], undefined>>
	}
>

/**
 * A prop as the client receives it: functions and promises resolved
 * (also inside plain objects and arrays), then JSON-serialized
 */
export type Serialized<T> = T extends InertiaProp<infer V, any>
	? Serialized<V>
	: T extends (...args: any[]) => infer R
	? Serialized<Awaited<R>>
	: T extends PromiseLike<infer U>
		? Serialized<U>
		: T extends { toJSON(): infer J }
			? J
			: T extends ReadonlyMap<any, any> | ReadonlySet<any> | WeakMap<any, any> | WeakSet<any>
				? {}
				: T extends readonly unknown[]
					? { [K in keyof T]: undefined extends T[K] ? Serialized<T[K]> | null : Serialized<T[K]> }
					: T extends object
						? SerializedObject<T>
						: T

type DeriveOf<App> =
	| (App extends { '~Singleton': { derive: infer D } } ? D : never)
	| (App extends { '~Ephemeral': { derive: infer D } } ? D : never)
	| (App extends { '~Volatile': { derive: infer D } } ? D : never)

// `.derive('plugin')` lands in a different bucket depending on how the
// plugin was composed, so look in all of them
type SharedOf<App> = UnionToIntersection<
	DeriveOf<App> extends infer D
		? D extends { inertia: InertiaContext<infer Shared, any> }
			? Shared
			: never
		: never
>

// The configured store's flash shape. A bare inertia() can't flash, so it
// adds nothing
type FlashOf<App> = UnionToIntersection<
	DeriveOf<App> extends infer D
		? D extends { inertia: InertiaContext<any, infer Flash> }
			? Flash extends UnconfiguredFlash
				? {}
				: Flash
			: never
		: never
>

/**
 * Client type config for `@inertiajs/core`, so `usePage()` knows the shared props
 *
 * ```ts
 * declare module '@inertiajs/core' {
 *   interface InertiaConfig extends InertiaConfigOf<typeof app> {}
 * }
 * ```
 */
export interface InertiaConfigOf<App = RegisteredApp> {
	sharedPageProps: Serialized<SharedOf<App>>
	flashDataType: Serialized<FlashValues<FlashOf<App>>>
	errorValueType: string
}
