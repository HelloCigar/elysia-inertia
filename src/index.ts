export { formBody } from './form.js'
export { inertia } from './plugin.js'
export { share } from './share.js'
export type {
	InertiaContext,
	InertiaOptions,
	InertiaPlugin,
	RenderArgs,
	RenderFor,
	RenderOptions
} from './plugin.js'
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
} from './props.js'
export type {
	InertiaProp,
	MergeStrategy,
	OnceOptions,
	PageId,
	Resolvable,
	ScrollCursor,
	ScrollOptions
} from './props.js'
export { cookieFlashStore } from './flash.js'
export type {
	CookieFlashStoreOptions,
	FlashContext,
	FlashData,
	FlashStore,
	FlashValues,
	UnconfiguredFlash
} from './flash.js'
export type { SSROptions } from './html.js'
export type { RescueHandler } from './page.js'
export { viteTags, viteVersion, type ViteOptions } from './vite.js'
export type { InertiaConfigOf, Serialized } from './infer.js'
export type {
	ComponentName,
	FieldPath,
	FormErrors,
	InertiaPages,
	InertiaResponse,
	PageObject,
	PageProps,
	PropInput,
	Props,
	PropsOf,
	Register,
	RootViewContext,
	SSRResult
} from './types.js'
