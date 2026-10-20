import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findPages, generatePages, inertiaPages, pagesCheck, pagesDeclaration } from '../src/vite-entry'

const fixture = () => {
	const root = mkdtempSync(join(tmpdir(), 'inertia-pages-'))
	const dir = join(root, 'pages')
	mkdirSync(join(dir, 'users'), { recursive: true })
	for (const file of ['users/index.tsx', 'users/show.vue', 'home.tsx', 'home.vue', 'notes.md', 'types.d.ts'])
		writeFileSync(join(dir, file), '')
	return { dir, dts: join(root, 'types', 'inertia-pages.d.ts'), check: join(root, 'inertia-pages.check.ts') }
}

describe('page discovery', () => {
	it('finds page components by name', () => {
		const { dir } = fixture()
		expect(findPages({ dir })).toEqual(['home', 'users/index', 'users/show'])
		expect(findPages({ dir: join(dir, 'missing') })).toEqual([])
	})

	it('writes the declaration only when pages change', () => {
		const options = fixture()
		expect(generatePages(options)).toBe(true)
		expect(readFileSync(options.dts, 'utf8')).toContain('"users/index": true')
		expect(generatePages(options)).toBe(false)

		// A CRLF checkout of the same declaration is not a change
		writeFileSync(options.dts, readFileSync(options.dts, 'utf8').replace(/\n/g, '\r\n'))
		expect(generatePages(options)).toBe(false)

		writeFileSync(join(options.dir, 'about.tsx'), '')
		expect(generatePages(options)).toBe(true)
		expect(readFileSync(options.dts, 'utf8')).toContain('"about": true')
	})

	it('checks each .tsx page against its routes, once per name', () => {
		const options = fixture()
		generatePages(options)
		const check = readFileSync(options.check, 'utf8')
		expect(check).toContain('type _0 = CheckPage<"home", typeof import("./pages/home").default>')
		expect(check).toContain('type _1 = CheckPage<"users/index", typeof import("./pages/users/index").default>')
		// .vue pages need their own tooling to type, so they are left out
		expect(check).not.toContain('users/show')
		expect(generatePages(options)).toBe(false)
	})

	it('skips the check file with check: false', () => {
		const options = fixture()
		generatePages({ ...options, check: false })
		expect(existsSync(options.check)).toBe(false)
	})

	it('regenerates in dev when a page is added or removed', () => {
		const options = fixture()
		const listeners: ((file: string) => void)[] = []
		const plugin = inertiaPages({ dir: 'pages', dts: 'types/inertia-pages.d.ts', check: false })
		plugin.configResolved({ root: join(options.dir, '..') })
		plugin.buildStart()
		plugin.configureServer({ watcher: { on: (_event, listener) => listeners.push(listener) } })

		const page = join(options.dir, 'settings.tsx')
		writeFileSync(page, '')
		for (const listener of listeners) listener(page)
		expect(readFileSync(options.dts, 'utf8')).toContain('"settings": true')
	})

	it('warns when no pages are found', () => {
		const warn = console.warn
		const messages: string[] = []
		console.warn = (message: string) => messages.push(message)
		try {
			const { dir, dts, check } = fixture()
			generatePages({ dir: join(dir, 'missing'), dts, check })
		} finally {
			console.warn = warn
		}
		expect(messages[0]).toContain('No pages found')
	})

	it('keeps the type-test fixture in sync', () => {
		const dir = join(import.meta.dir, 'pages-types/pages')
		expect(readFileSync(join(import.meta.dir, 'pages-types/inertia-pages.d.ts'), 'utf8'))
			.toBe(pagesDeclaration(findPages({ dir })))
		const check = join(import.meta.dir, 'pages-types/inertia-pages.check.ts')
		expect(readFileSync(check, 'utf8')).toBe(
			pagesCheck(
				findPages({ dir }).map((name) => ({ name, file: join(dir, `${name}.tsx`) })),
				check
			)
		)
	})
})
