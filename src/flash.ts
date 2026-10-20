import { createHmac, timingSafeEqual } from 'node:crypto'

import type { HTTPHeaders } from 'elysia'

import type { MaybePromise } from './types'

/**
 * Register the shape of flashed data, for `inertia.flash()` and the
 * client's `page.flash`
 *
 * ```ts
 * declare module 'elysia-inertia' {
 *   interface InertiaFlash { toast: { kind: 'success' | 'error'; text: string } }
 * }
 * ```
 */
export interface InertiaFlash {}

export type FlashValues = keyof InertiaFlash extends never
	? Record<string, unknown>
	: Partial<InertiaFlash>

/** What survives until the next rendered page */
export interface FlashData {
	errors?: Record<string, string>
	/** `X-Inertia-Error-Bag` of the request that failed */
	errorBag?: string | null
	flash?: Record<string, unknown>
}

/** The part of Elysia's context a store needs; available in every hook */
export interface FlashContext {
	request: Request
	set: { headers: HTTPHeaders }
}

/**
 * Where flashed data waits for the next request. `write(undefined)` clears
 * it. Writes are synchronous so they land on the current response; a store
 * backed by a session can mutate a session loaded earlier in the request
 */
export interface FlashStore {
	read(context: FlashContext): MaybePromise<FlashData | undefined>
	write(context: FlashContext, data: FlashData | undefined): void
}

export interface CookieFlashStoreOptions {
	/** Cookie name (default `inertia_flash`) */
	name?: string
	/** Mark the cookie `Secure` (default: when the request is https) */
	secure?: boolean
	domain?: string
	path?: string
	/**
	 * Sign the cookie with HMAC-SHA256 so users can't forge their own errors
	 * or flash data; a cookie with a bad signature is ignored
	 */
	secret?: string
}

const readCookie = (request: Request, name: string) => {
	for (const pair of request.headers.get('cookie')?.split(';') ?? []) {
		const index = pair.indexOf('=')
		if (pair.slice(0, index).trim() === name)
			return decodeURIComponent(pair.slice(index + 1).trim())
	}
}

/** Replace any Set-Cookie for `name` this response already carries */
const setCookie = (
	set: FlashContext['set'],
	name: string,
	cookie: string | undefined
) => {
	const current = set.headers['set-cookie']
	const others = (
		Array.isArray(current) ? current : current ? [current] : []
	).filter((entry) => !entry.startsWith(`${name}=`))
	const next = cookie ? [...others, cookie] : others
	if (next.length) set.headers['set-cookie'] = next
	else delete set.headers['set-cookie']
}

/**
 * Default store: a short-lived cookie holding base64url JSON. Keep flashed
 * data small; browsers cap a cookie at about 4 KB
 */
export const cookieFlashStore = ({
	name = 'inertia_flash',
	secure,
	domain,
	path = '/',
	secret
}: CookieFlashStoreOptions = {}): FlashStore => {
	const sign = (payload: string) =>
		createHmac('sha256', secret!).update(payload).digest('base64url')

	const verify = (value: string) => {
		if (!secret) return value

		const dot = value.lastIndexOf('.')
		if (dot < 0) return

		const payload = value.slice(0, dot)
		const given = Buffer.from(value.slice(dot + 1))
		const expected = Buffer.from(sign(payload))

		return given.length === expected.length && timingSafeEqual(given, expected)
			? payload
			: undefined
	}

	return {
		read({ request }) {
			const value = verify(readCookie(request, name) ?? '')
			if (!value) return

			try {
				return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
			} catch {
				return
			}
		},
		write({ request, set }, data) {
			const attributes = [
				`Path=${path}`,
				'HttpOnly',
				'SameSite=Lax',
				...(domain ? [`Domain=${domain}`] : []),
				...((secure ?? request.url.startsWith('https:')) ? ['Secure'] : [])
			]

			if (!data) {
				// Drop what this response was about to set, and expire what the
				// browser sent
				setCookie(set, name, undefined)
				if (readCookie(request, name) !== undefined)
					setCookie(
						set,
						name,
						[`${name}=`, 'Max-Age=0', ...attributes].join('; ')
					)
				return
			}

			const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
			const value = secret ? `${payload}.${sign(payload)}` : payload
			setCookie(set, name, [`${name}=${value}`, ...attributes].join('; '))
		}
	}
}

const isEmpty = (value: object | undefined | null) =>
	!value || Object.keys(value).length === 0

export const hasFlashData = (data: FlashData | undefined) =>
	!!data && (!isEmpty(data.errors) || !isEmpty(data.flash))
