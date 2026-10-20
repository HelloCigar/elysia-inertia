import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'

/**
 * Asset version from a Vite manifest, for `inertia({ version })`. The hash
 * is recomputed only when the manifest file changes
 *
 * ```ts
 * inertia({ version: viteVersion('dist/.vite/manifest.json') })
 * ```
 */
export const viteVersion = (manifestPath = 'dist/.vite/manifest.json') => {
	let cached: { mtime: number; version: string } | undefined

	return () => {
		const mtime = statSync(manifestPath).mtimeMs
		if (cached?.mtime !== mtime)
			cached = {
				mtime,
				version: createHash('sha1')
					.update(readFileSync(manifestPath))
					.digest('hex')
					.slice(0, 16)
			}

		return cached.version
	}
}
