import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { inertia, writeRoutes } from '../src'
import { routesDeclaration } from '../src/routes-dts'

const app = () =>
	new Elysia()
		.get('/users', () => 1)
		.get('/users/:id', () => 1)
		.post('/users', () => 1)
		.group('/admin', (admin) => admin.get('/stats', () => 1))

describe('route declarations', () => {
	it('writes the GET routes, only when they change', () => {
		const dts = join(mkdtempSync(join(tmpdir(), 'inertia-routes-')), 'types', 'inertia-routes.d.ts')
		expect(writeRoutes(app(), dts)).toBe(true)
		expect(readFileSync(dts, 'utf8')).toBe(routesDeclaration(['/admin/stats', '/users', '/users/:id']))
		expect(writeRoutes(app(), dts)).toBe(false)
	})

	it('writes them when the server starts in dev', async () => {
		const dts = join(mkdtempSync(join(tmpdir(), 'inertia-routes-')), 'inertia-routes.d.ts')
		const server = new Elysia()
			.use(inertia({ routes: dts }))
			.get('/later', () => 1) // registered after the plugin
			.listen(0)
		await Bun.sleep(10)
		server.stop()
		expect(readFileSync(dts, 'utf8')).toContain('"/later": true')
	})

	it('keeps the type-test fixture in sync', () => {
		const fixture = readFileSync(join(import.meta.dir, 'routes-types/inertia-routes.d.ts'), 'utf8')
		expect(fixture).toBe(routesDeclaration(['/files/*', '/posts/:id?', '/users', '/users/:id']))
	})
})
