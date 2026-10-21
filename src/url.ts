import type { QueryValue } from './routes.js'

type UrlOptions<Params, Query> = ({} extends Params
	? { params?: Params }
	: { params: Params }) & { query?: Query }

/** Path parameters are required exactly when the path has some */
export type UrlArgs<Params, Query> = {} extends Params
	? [options?: UrlOptions<Params, Query>]
	: [options: UrlOptions<Params, Query>]

/**
 * Fill a route pattern's params and append the query. Only the path is
 * templated: an origin, an existing query and a `#hash` pass through
 */
export const buildUrl = (
	url: string,
	options: { params?: object; query?: object } = {}
) => {
	const [, origin = '', rest = ''] = /^([a-z][a-z\d+.-]*:\/\/[^/?#]*)?(.*)$/is.exec(url)!
	const hashAt = rest.indexOf('#')
	const hash = hashAt < 0 ? '' : rest.slice(hashAt)
	const beforeHash = hashAt < 0 ? rest : rest.slice(0, hashAt)
	// A `?` right after a param name marks it optional, not a query
	const queryAt = beforeHash.search(/\?(?<!:[^/?]+\?)|\?(?=[^/]*=)/)
	const path = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt)
	const existing = queryAt < 0 ? '' : beforeHash.slice(queryAt + 1)

	const params = (options.params ?? {}) as Record<string, unknown>
	// A param name runs to the next `/`, like Elysia's router (`:user-id`)
	const filled = path.replace(/:([^/?]+)\??|\*/g, (match, name?: string) => {
		const value = params[name ?? '*']
		if (value === undefined || value === null) {
			if (match.endsWith('?')) return ''
			throw new TypeError(`[inertia] Missing "${name ?? '*'}" for ${url}`)
		}
		return name
			? encodeURIComponent(String(value))
			: String(value).split('/').map(encodeURIComponent).join('/')
	})

	const search = new URLSearchParams(existing)
	for (const [key, value] of Object.entries(options.query ?? {}))
		for (const item of [value as QueryValue | QueryValue[]].flat())
			if (item !== undefined && item !== null) search.append(key, String(item))

	const query = search.toString()
	// An omitted optional segment can leave `//` or a trailing `/`
	const clean = filled.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')

	return `${origin}${clean}${query ? `?${query}` : ''}${hash}`
}
