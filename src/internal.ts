// Building blocks the plugin is made of, for custom integrations and tests.
// Not covered by semver like the root entry
export { buildPage, resolveProps } from './page'
export type { BuildPageInput } from './page'
export { defaultRootView, pageBody, renderSSR, serializePage } from './html'
export { parseInertiaRequest, pageUrl } from './request'
export { validationErrors } from './validation'
export { hasFlashData } from './flash'
export { InertiaContext } from './plugin'
export { InertiaProp, isInertiaProp } from './props'
export type { PropConfig } from './props'
export type { InertiaRequest } from './types'
