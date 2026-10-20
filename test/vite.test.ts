import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { inertia, viteTags, type ViteOptions } from '../src'

const dir = mkdtempSync(join(tmpdir(), 'inertia-vite-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const manifestFile = join(dir, 'manifest.json')
const manifest = {
	'src/client/app.tsx': {
		file: 'assets/app-abc.js',
		isEntry: true,
		imports: ['_vendor-1.js'],
		dynamicImports: ['src/pages/home.tsx'],
		css: ['assets/app-abc.css']
	},
	'_vendor-1.js': { file: 'assets/vendor-1.js', css: ['assets/vendor-1.css'] },
	'src/pages/home.tsx': { file: 'assets/home-2.js', imports: ['_vendor-1.js'] },
	'src/styles.css': { file: 'assets/styles-3.css', isEntry: true }
}
writeFileSync(manifestFile, JSON.stringify(manifest))

const html = async (vite: ViteOptions, options: Parameters<typeof inertia>[0] = {}) => {
	const app = new Elysia()
		.use(inertia({ vite, ...options }))
		.get('/', ({ inertia }) => inertia.render('home'))
	return (await app.handle(new Request('http://localhost/'))).text()
}

describe('vite in dev', () => {
	it('loads the Vite client and the entry from the dev server', async () => {
		const page = await html({ entry: 'src/client/app.tsx', dev: true })
		expect(page).toContain(
			'<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />' +
				'<script type="module" src="http://localhost:5173/@vite/client"></script>' +
				'<script type="module" src="http://localhost:5173/src/client/app.tsx"></script></head>'
		)
		expect(page).not.toContain('@react-refresh')
	})

	it('adds the React Refresh preamble before the entry', () => {
		const tags = viteTags({ entry: './src/client/app.tsx', react: true, dev: true, devServer: 'http://127.0.0.1:3001/', base: '/build' })()
		expect(tags).toStartWith('<script type="module">import RefreshRuntime from "http://127.0.0.1:3001/build/@react-refresh";')
		expect(tags).toContain('window.__vite_plugin_react_preamble_installed__=true</script>')
		expect(tags).toEndWith(
			'<script type="module" src="http://127.0.0.1:3001/build/@vite/client"></script>' +
				'<script type="module" src="http://127.0.0.1:3001/build/src/client/app.tsx"></script>'
		)
	})

	it('has no asset version, so visits are not reloaded', async () => {
		const app = new Elysia()
			.use(inertia({ vite: { entry: 'app.tsx', dev: true } }))
			.get('/', ({ inertia }) => inertia.render('home'))
		const res = await app.handle(new Request('http://localhost/', { headers: { 'x-inertia': 'true' } }))
		expect(res.status).toBe(200)
		expect((await res.json()).version).toBe('')
	})
})

describe('vite in production', () => {
	const vite: ViteOptions = { entry: ['src/client/app.tsx', 'src/styles.css'], dev: false, manifest: manifestFile, base: '/build/' }

	it('links the entry, its CSS and its static imports from the manifest', () => {
		expect(viteTags(vite)()).toBe(
			'<link rel="stylesheet" href="/build/assets/vendor-1.css" />' +
				'<link rel="stylesheet" href="/build/assets/app-abc.css" />' +
				'<link rel="stylesheet" href="/build/assets/styles-3.css" />' +
				'<link rel="modulepreload" href="/build/assets/vendor-1.js" />' +
				'<script type="module" src="/build/assets/app-abc.js"></script>'
		)
	})

	it('adds the tags to head ahead of SSR head, also for a custom rootView', async () => {
		const page = await html(vite, {
			ssr: { render: () => ({ head: ['<title>Home</title>'], body: '<div id="app">ssr</div>' }) },
			rootView: ({ head, body }) => `<head>${head}</head>${body}`
		})
		expect(page).toStartWith('<head><link rel="stylesheet" href="/build/assets/vendor-1.css" />')
		expect(page).toContain('<script type="module" src="/build/assets/app-abc.js"></script><title>Home</title></head>')
	})

	it('versions assets by the manifest hash and follows rebuilds', async () => {
		const own: ViteOptions = { entry: 'src/client/app.tsx', dev: false, manifest: manifestFile }
		const app = new Elysia()
			.use(inertia({ vite: own }))
			.get('/', ({ inertia }) => inertia.render('home'))
		const visit = (version: string) =>
			app.handle(new Request('http://localhost/', { headers: { 'x-inertia': 'true', 'x-inertia-version': version } }))

		expect((await visit('stale')).status).toBe(409)
		const current = (await (await app.handle(new Request('http://localhost/'))).text()).match(/"version":"(\w+)"/)![1]!
		expect(current).toHaveLength(16)
		expect((await visit(current)).status).toBe(200)

		writeFileSync(manifestFile, JSON.stringify({ ...manifest, extra: { file: 'x.js' } }))
		utimesSync(manifestFile, new Date(), new Date(Date.now() + 5000))
		expect((await visit(current)).status).toBe(409)
		writeFileSync(manifestFile, JSON.stringify(manifest))
	})

	it('keeps an explicit version', async () => {
		const app = new Elysia()
			.use(inertia({ version: 'v1', vite: { entry: 'src/client/app.tsx', dev: false, manifest: manifestFile } }))
			.get('/', ({ inertia }) => inertia.render('home'))
		const res = await app.handle(new Request('http://localhost/', { headers: { 'x-inertia': 'true', 'x-inertia-version': 'v1' } }))
		expect(res.status).toBe(200)
	})

	it('names a missing entry or manifest', () => {
		expect(() => viteTags({ entry: 'src/nope.tsx', dev: false, manifest: manifestFile })()).toThrow(
			'"src/nope.tsx" is not an entry'
		)
		expect(() => viteTags({ entry: 'app.tsx', dev: false, manifest: join(dir, 'missing.json') })()).toThrow(
			'No Vite manifest at'
		)
	})
})
