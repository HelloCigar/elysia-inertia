export { formBody } from './form'
export { inertia } from './plugin'
export { share } from './share'
export type {
	InertiaContext,
	InertiaOptions,
	InertiaPlugin,
	RenderFor,
	RenderOptions
} from './plugin'
export {
	always,
	deepMerge,
	defer,
	Inertia,
	merge,
	once,
	optional,
	prepend,
	scroll
} from './props'
export type {
	InertiaProp,
	MergeStrategy,
	OnceOptions,
	PageId,
	Resolvable,
	ScrollCursor,
	ScrollOptions
} from './props'
export { cookieFlashStore } from './flash'
export type {
	CookieFlashStoreOptions,
	FlashContext,
	FlashData,
	FlashStore,
	FlashValues
} from './flash'
export type { SSROptions } from './html'
export type { RescueHandler } from './page'
export { viteVersion } from './vite'
export type {
	InertiaConfigOf,
	InferPages,
	PageProps,
	PagePropsOf,
	Serialized
} from './infer'
export type {
	ComponentName,
	FieldPath,
	FormErrors,
	InertiaPages,
	InertiaResponse,
	PageObject,
	Props,
	Register,
	RootViewContext,
	SSRResult
} from './types'
