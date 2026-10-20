import type { InertiaRequest } from './types.js'

const list = (value: string | null) =>
	value
		? value
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean)
		: []

export const parseInertiaRequest = (headers: Headers): InertiaRequest => ({
	isInertia: headers.get('x-inertia') === 'true',
	version: headers.get('x-inertia-version') ?? '',
	partialComponent: headers.get('x-inertia-partial-component'),
	only: list(headers.get('x-inertia-partial-data')),
	except: list(headers.get('x-inertia-partial-except')),
	reset: list(headers.get('x-inertia-reset')),
	errorBag: headers.get('x-inertia-error-bag'),
	exceptOnceProps: list(headers.get('x-inertia-except-once-props')),
	mergeIntent:
		headers.get('x-inertia-infinite-scroll-merge-intent') === 'prepend'
			? 'prepend'
			: 'append'
})

/**
 * Where `back()` goes: the Referer's path + query, so a Referer from another
 * site can't turn it into an open redirect
 */
export const backUrl = (request: Request, fallback = '/') => {
	const referer = request.headers.get('referer')
	if (!referer) return fallback

	try {
		const url = new URL(referer)
		// Collapse leading slashes: `//evil.com` would be protocol-relative
		return url.pathname.replace(/^\/+/, '/') + url.search
	} catch {
		return fallback
	}
}

/** Path + query of the request, as the page object's `url` */
export const pageUrl = (request: Request) => {
	const url = new URL(request.url)

	return url.pathname + url.search
}
