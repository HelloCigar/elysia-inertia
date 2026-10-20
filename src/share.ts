import { addSharedResolver, type InertiaContext } from './plugin'
import type { MaybePromise, Props } from './types'

type SharedIn<Ctx> = Ctx extends { inertia: InertiaContext<infer Shared> }
	? Shared
	: {}

/**
 * Declare props shared by every page, from the typed request context
 * (including what other plugins derive, e.g. the signed-in user). The
 * returned props are inferred into `InertiaConfigOf`, so `usePage()` knows
 * them without an `InertiaShared` interface. The callback runs only when a
 * page renders, not on other routes
 *
 * ```ts
 * new Elysia()
 *   .use(auth)
 *   .use(pages)
 *   .derive(share(({ user }) => ({ auth: { user } })))
 * ```
 */
export const share =
	<Ctx extends { inertia: InertiaContext<any> }, Shared extends Props>(
		props: (context: Ctx) => MaybePromise<Shared>
	) =>
	(context: Ctx): { inertia: InertiaContext<SharedIn<Ctx> & Shared> } => {
		context.inertia[addSharedResolver](() => props(context))

		return { inertia: context.inertia } as never
	}
