import type { PageObject, RootViewContext, SSRResult } from './types'

/**
 * Serialize the page for a `<script>` body. Every `/` becomes `\/` so prop
 * data can't close the element early (protocol section 5)
 */
export const serializePage = (page: PageObject) =>
	JSON.stringify(page).replace(/\//g, '\\/')

/** The payload script plus the empty mount element */
export const pageBody = (page: PageObject, id = 'app') =>
	`<script type="application/json" data-page="${id}">${serializePage(page)}</script><div id="${id}"></div>`

export const defaultRootView = ({ head, body }: RootViewContext) =>
	`<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${head}</head><body>${body}</body></html>`

export interface SSROptions {
	/** Render the page yourself, e.g. by importing your SSR bundle */
	render?: (page: PageObject) => Promise<SSRResult> | SSRResult
	/**
	 * URL of a running Inertia SSR server, posted the page as JSON.
	 * Used when `render` is not set (default `http://127.0.0.1:13714/render`)
	 */
	url?: string
	/** Called when SSR fails; the page then renders client-side */
	onError?: (error: unknown, page: PageObject) => void
}

export const renderSSR = async (
	page: PageObject,
	options: SSROptions
): Promise<SSRResult | undefined> => {
	try {
		if (options.render) return await options.render(page)

		const response = await fetch(
			options.url ?? 'http://127.0.0.1:13714/render',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(page)
			}
		)
		if (!response.ok)
			throw new Error(`SSR server responded ${response.status}`)

		return (await response.json()) as SSRResult
	} catch (error) {
		;(options.onError ?? ((error) => console.error('[inertia] SSR failed', error)))(
			error,
			page
		)
	}
}
