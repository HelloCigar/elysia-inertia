import {
	isInertiaProp,
	type InertiaProp,
	type MergeStrategy,
	type OnceOptions,
	type PageId,
	type PropConfig,
	type ScrollCursor
} from './props.js'
import type { InertiaRequest, PageObject, Props } from './types.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== 'object' || value === null) return false

	const proto = Object.getPrototypeOf(value)

	return proto === Object.prototype || proto === null
}

const resolveValue = async (value: unknown, path: string): Promise<unknown> => {
	const resolved = await (typeof value === 'function' ? value() : value)

	if (isInertiaProp(resolved))
		throw new TypeError(
			`[inertia] Prop helper at "${path}" can't be resolved here: always(), optional() and defer() must sit at a static object path, not inside another helper, an array or a function's result`
		)
	if (Array.isArray(resolved))
		return Promise.all(
			resolved.map((item, index) => resolveValue(item, `${path}.${index}`))
		)
	if (isPlainObject(resolved)) return resolveProps(resolved, path)

	return resolved
}

/**
 * Resolve a prop tree: functions are called and promises awaited, inside
 * plain objects and arrays too. Class instances are taken as they are
 */
export const resolveProps = async (props: Props, prefix = ''): Promise<Props> =>
	Object.fromEntries(
		await Promise.all(
			Object.entries(props).map(
				async ([key, value]) =>
					[key, await resolveValue(value, prefix ? `${prefix}.${key}` : key)] as const
			)
		)
	)

/** `path` is `target` or nested under it */
const within = (path: string, target: string) =>
	path === target || path.startsWith(target + '.')

/**
 * Which prop paths this response sends. A partial reload cherry-picks with
 * only/except (protocol section 9); a full visit sends everything eager
 */
interface Selection {
	partial: boolean
	requested(path: string): boolean
}

const selection = (request: InertiaRequest, component: string): Selection => {
	// A partial reload for another component is a full visit
	const partial =
		request.isInertia && request.partialComponent === component
	const { only, except } = request

	return {
		partial,
		requested: (path) =>
			!partial ||
			((only.length === 0 || only.some((o) => within(path, o))) &&
				!except.some((e) => within(path, e)))
	}
}

const MISSING = Symbol('missing')

type LabelField = 'mergeProps' | 'prependProps' | 'deepMergeProps' | 'matchPropsOn'

interface Manifest extends Record<LabelField, string[]> {
	deferredProps: Record<string, string[]>
	rescuedProps: string[]
	scrollProps: Record<string, ScrollCursor & { pageName: string; reset: boolean }>
	onceProps: Record<string, { prop: string; expiresAt: number | null }>
}

export type RescueHandler = (error: unknown, path: string) => void

interface WalkContext {
	request: InertiaRequest
	selection: Selection
	manifest: Manifest
	onRescue: RescueHandler
}

const MERGE_FIELD = {
	append: 'mergeProps',
	prepend: 'prependProps',
	deep: 'deepMergeProps'
} as const satisfies Record<MergeStrategy, LabelField>

/**
 * Merge metadata for a prop (protocol sections 14, 16). A scroll prop labels
 * its inner data array and takes its direction from the merge-intent header.
 * A prop being reset is sent unlabeled so the client replaces it
 */
const labelsFor = (
	{ merge, matchOn, scroll }: PropConfig,
	path: string,
	{ request }: WalkContext
): [LabelField, string][] => {
	if (request.reset.includes(path)) return []

	if (scroll) {
		const target = `${path}.${scroll.dataKey}`
		const field = request.mergeIntent === 'prepend' ? 'prependProps' : 'mergeProps'

		return [
			[field, target],
			...matchOn.map((key): [LabelField, string] => ['matchPropsOn', `${target}.${key}`])
		]
	}

	if (!merge) return []

	return [
		[MERGE_FIELD[merge], path],
		...matchOn.map((key): [LabelField, string] => ['matchPropsOn', `${path}.${key}`])
	]
}

const pageId = (value: unknown): PageId =>
	typeof value === 'string' || typeof value === 'number' ? value : null

const defaultCursor = (value: unknown): ScrollCursor => {
	const source = (value ?? {}) as Record<string, unknown>
	const meta = isPlainObject(source.meta) ? source.meta : {}
	const read = (key: string) => pageId(source[key] ?? meta[key])

	return {
		currentPage: read('currentPage'),
		nextPage: read('nextPage'),
		previousPage: read('previousPage')
	}
}

const expiry = ({ expiresAt, ttl }: OnceOptions): number | null => {
	if (ttl !== undefined) return Date.now() + ttl
	if (expiresAt instanceof Date) return expiresAt.getTime()

	return expiresAt ?? null
}

const resolveInertiaProp = async (
	prop: InertiaProp,
	path: string,
	context: WalkContext
): Promise<unknown> => {
	const { request, selection, manifest, onRescue } = context
	const { config } = prop
	const { lazy, group, always, rescue, once, fresh, scroll } = config

	if (!always && selection.partial && !selection.requested(path)) return MISSING

	const onceKey = once?.key ?? path
	const recordOnce = () => {
		if (once) manifest.onceProps[onceKey] = { prop: path, expiresAt: expiry(once) }
	}

	// The client restores a once prop it holds; partial reloads ignore this
	if (
		once &&
		!selection.partial &&
		!fresh &&
		request.exceptOnceProps.includes(onceKey)
	) {
		recordOnce()
		return MISSING
	}

	// Labels go in before any await so manifest order follows the prop tree
	const labels = labelsFor(config, path, context)
	for (const [field, value] of labels) manifest[field].push(value)

	if (!always && !selection.partial && lazy) {
		if (lazy === 'deferred') (manifest.deferredProps[group] ??= []).push(path)
		// Only a deferred prop keeps its labels before it is sent
		if (lazy === 'optional')
			for (const [field, value] of labels)
				manifest[field].splice(manifest[field].indexOf(value), 1)

		return MISSING
	}

	let value: unknown
	try {
		value = await resolveValue(prop.value, path)
	} catch (error) {
		// Rescue only exists on a partial reload: a full visit never resolves it
		if (lazy !== 'deferred' || !rescue) throw error

		manifest.rescuedProps.push(path)
		for (const [field, label] of labels)
			manifest[field].splice(manifest[field].indexOf(label), 1)
		onRescue(error, path)

		return MISSING
	}

	recordOnce()
	if (scroll)
		manifest.scrollProps[path] = {
			pageName: scroll.pageName,
			...(scroll.cursor ?? defaultCursor)(value),
			reset: request.reset.includes(path)
		}

	return value
}

/**
 * Walk the declared prop tree. Plain objects are containers whose children
 * have their own paths (`auth.user`); everything else is a leaf
 */
const walk = async (
	props: Props,
	prefix: string,
	context: WalkContext
): Promise<Props> => {
	const entries = await Promise.all(
		Object.entries(props).map(async ([key, value]) => {
			const path = prefix ? `${prefix}.${key}` : key

			if (isInertiaProp(value))
				return [key, await resolveInertiaProp(value, path, context)] as const

			if (isPlainObject(value)) {
				const children = await walk(value, path, context)
				// An unrequested container is kept only for what was picked inside it
				const keep =
					context.selection.requested(path) ||
					Object.keys(children).length > 0

				return [key, keep ? children : MISSING] as const
			}

			if (!context.selection.requested(path)) return [key, MISSING] as const

			return [key, await resolveValue(value, path)] as const
		})
	)

	return Object.fromEntries(entries.filter(([, value]) => value !== MISSING))
}

export interface BuildPageInput {
	component: string
	props: Props
	url: string
	version: string
	request: InertiaRequest
	clearHistory?: boolean
	encryptHistory?: boolean
	/** Report a rescued deferred prop's error out of band */
	onRescue?: RescueHandler
	/** Ephemeral data, sent as `page.flash` when not empty */
	flash?: Record<string, unknown>
}

const defaultOnRescue: RescueHandler = (error, path) =>
	console.error(`[inertia] deferred prop "${path}" failed`, error)

export const buildPage = async ({
	component,
	props,
	url,
	version,
	request,
	clearHistory,
	encryptHistory,
	onRescue = defaultOnRescue,
	flash
}: BuildPageInput): Promise<PageObject> => {
	const manifest: Manifest = {
		deferredProps: {},
		rescuedProps: [],
		mergeProps: [],
		prependProps: [],
		deepMergeProps: [],
		matchPropsOn: [],
		scrollProps: {},
		onceProps: {}
	}

	const page: PageObject = {
		component,
		url,
		version,
		props: await walk(props, '', {
			request,
			selection: selection(request, component),
			manifest,
			onRescue
		})
	}

	// Empty manifests are omitted; deferredProps only ever fills on a full
	// visit and rescuedProps on a partial reload (protocol section 2)
	for (const field of [
		'deferredProps',
		'mergeProps',
		'prependProps',
		'deepMergeProps',
		'matchPropsOn',
		'scrollProps',
		'onceProps',
		'rescuedProps'
	] as const) {
		const value = manifest[field]
		if (Array.isArray(value) ? value.length : Object.keys(value).length)
			Object.assign(page, { [field]: value })
	}

	if (flash && Object.keys(flash).length) page.flash = flash

	// Only emitted when enabled (protocol section 18)
	if (clearHistory) page.clearHistory = true
	if (encryptHistory) page.encryptHistory = true

	return page
}
