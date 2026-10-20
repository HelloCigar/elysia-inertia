import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'

export interface ViteOptions {
	/**
	 * Entry module(s) relative to Vite's root, as in `build.rollupOptions.input`,
	 * e.g. `src/client/app.tsx`
	 */
	entry: string | string[]
	/**
	 * Add the React Refresh preamble in dev, which `@vitejs/plugin-react`
	 * needs when the HTML doesn't come from Vite
	 */
	react?: boolean
	/** Load from the dev server instead of the build (default `NODE_ENV !== 'production'`) */
	dev?: boolean
	/** Dev server origin (default `http://localhost:5173`) */
	devServer?: string
	/**
	 * The build's manifest; set `build.manifest: true` in the Vite config
	 * (default `dist/.vite/manifest.json`)
	 */
	manifest?: string
	/** Public URL the build is served from, Vite's `base` (default `/`) */
	base?: string
}

interface ManifestChunk {
	file: string
	css?: string[]
	imports?: string[]
}

type Manifest = Record<string, ManifestChunk>

const DEFAULT_MANIFEST = 'dist/.vite/manifest.json'

/** Recompute from a file only when its mtime changes */
const cachedByMtime = <T>(path: string, compute: (content: Buffer) => T) => {
	let cached: { mtime: number; value: T } | undefined

	return () => {
		let mtime: number
		try {
			mtime = statSync(path).mtimeMs
		} catch (error) {
			throw new Error(
				`[inertia] No Vite manifest at ${path}; build with \`build.manifest: true\`, or use the dev server`,
				{ cause: error }
			)
		}
		if (cached?.mtime !== mtime) cached = { mtime, value: compute(readFileSync(path)) }

		return cached.value
	}
}

/**
 * Asset version from a Vite manifest, for `inertia({ version })`. The hash
 * is recomputed only when the manifest file changes. `inertia({ vite })`
 * sets this up for you
 *
 * ```ts
 * inertia({ version: viteVersion('dist/.vite/manifest.json') })
 * ```
 */
export const viteVersion = (manifestPath = DEFAULT_MANIFEST) =>
	cachedByMtime(manifestPath, (content) =>
		createHash('sha1').update(content).digest('hex').slice(0, 16)
	)

const entries = (options: ViteOptions) =>
	[options.entry].flat().map((entry) => entry.replace(/^\.?\//, ''))

const url = (base: string, path: string) => `${base.replace(/\/?$/, '/')}${path}`

const escapeAttribute = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const script = (src: string) => `<script type="module" src="${escapeAttribute(src)}"></script>`

// The dev server serves at the base's path: a relative base (`./`) is the
// root, and a full URL (a CDN) contributes only its pathname
const devBase = (base = '/') =>
	base === '' || base.startsWith('.') ? '/' : new URL(base, 'http://localhost').pathname

const devTags = (options: ViteOptions) => {
	const origin = (options.devServer ?? 'http://localhost:5173').replace(/\/$/, '')
	const at = (path: string) => origin + url(devBase(options.base), path)

	// The preamble @vitejs/plugin-react injects into HTML that Vite serves
	const refresh = options.react
		? `<script type="module">import RefreshRuntime from ${JSON.stringify(at('@react-refresh')).replace(/</g, '\\u003c')};RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true</script>`
		: ''

	return refresh + ['@vite/client', ...entries(options)].map((path) => script(at(path))).join('')
}

const buildTags = (manifest: Manifest, options: ViteOptions, manifestPath: string) => {
	const base = options.base ?? '/'
	const css = new Set<string>()
	const preload = new Set<string>()
	const scripts = new Set<string>()
	const seen = new Set<string>()

	// An entry's static imports are preloaded and their CSS linked, imports
	// first so the importer's CSS comes later and wins the cascade
	const visit = (key: string) => {
		if (seen.has(key)) return
		seen.add(key)

		const chunk = manifest[key]!
		for (const imported of chunk.imports ?? []) {
			visit(imported)
			if (manifest[imported]) preload.add(manifest[imported].file)
		}
		for (const file of chunk.css ?? []) css.add(file)
	}

	for (const entry of entries(options)) {
		const chunk = manifest[entry]
		if (!chunk)
			throw new Error(
				`[inertia] "${entry}" is not an entry in ${manifestPath}; add it to Vite's \`build.rollupOptions.input\``
			)

		visit(entry)
		if (chunk.file.endsWith('.css')) css.add(chunk.file)
		else scripts.add(chunk.file)
	}

	return [
		...[...css].map((file) => `<link rel="stylesheet" href="${escapeAttribute(url(base, file))}" />`),
		...[...preload]
			.filter((file) => !scripts.has(file))
			.map((file) => `<link rel="modulepreload" href="${escapeAttribute(url(base, file))}" />`),
		...[...scripts].map((file) => script(url(base, file)))
	].join('')
}

/**
 * The `<head>` tags that load the Vite entry: the dev server's client and
 * modules in dev, the built JS, CSS and preloads from the manifest otherwise.
 * `inertia({ vite })` adds these to `head`; use this for other HTML pages
 */
export const viteTags = (options: ViteOptions): (() => string) => {
	if (options.dev ?? process.env.NODE_ENV !== 'production') {
		const tags = devTags(options)
		return () => tags
	}

	// `./assets/app.js` resolves against the page's path, so it breaks on
	// nested routes like `/users/1`
	if (options.base === '' || options.base?.startsWith('.'))
		console.warn(
			`[inertia] vite.base "${options.base}" is relative, so assets won't load on nested routes; use an absolute base such as "/build/"`
		)

	const manifestPath = options.manifest ?? DEFAULT_MANIFEST
	return cachedByMtime(manifestPath, (content) =>
		buildTags(JSON.parse(content.toString('utf8')) as Manifest, options, manifestPath)
	)
}

interface ViteAssets {
	tags: () => string
	version: () => string
}

const assets = new WeakMap<ViteOptions, ViteAssets>()

/** Tags and version for `inertia({ vite })`, set up once per options object */
export const viteAssets = (options: ViteOptions): ViteAssets => {
	let resolved = assets.get(options)
	if (!resolved) {
		const dev = options.dev ?? process.env.NODE_ENV !== 'production'
		resolved = {
			tags: viteTags({ ...options, dev }),
			// The dev server serves fresh modules, so there's no stale build to detect
			version: dev ? () => '' : viteVersion(options.manifest)
		}
		assets.set(options, resolved)
	}

	return resolved
}
