import { describe, expect, it } from 'bun:test'
import { Elysia, t } from 'elysia'
import { createRoutes } from '../src/client'
import { inertia } from '../src'

const app = new Elysia()
	.use(inertia())
	.get('/', () => 'home')
	.get('/users', { query: t.Object({ page: t.Optional(t.Number()), tags: t.Optional(t.Array(t.String())) }) }, () => 'users')
	.get('/users/:id', () => 'user')
	.post('/users', { body: t.Object({ name: t.String(), email: t.String() }) }, () => 'created')
	.put('/users/:id', { body: t.Object({ name: t.String() }) }, () => 'updated')
	.get('/files/*', () => 'file')
	.get('/teams/:team-id', () => 'team')
	.get('/posts/:slug?', () => 'posts')
	.group('/admin', (admin) => admin.get('/stats', () => 'stats'))

const { url, action } = createRoutes<typeof app>()

describe('url()', () => {
	it('builds static, param, wildcard and grouped paths', () => {
		expect(url('/')).toBe('/')
		expect(url('/users/:id', { params: { id: '42' } })).toBe('/users/42')
		expect(url('/files/*', { params: { '*': 'docs/a b.pdf' } })).toBe('/files/docs/a%20b.pdf')
		expect(url('/admin/stats')).toBe('/admin/stats')
	})

	it('reads param names up to the next slash', () => {
		expect(url('/teams/:team-id', { params: { 'team-id': 'core' } })).toBe('/teams/core')
	})

	it('drops an omitted optional param with its slash', () => {
		expect(url('/posts/:slug?')).toBe('/posts')
		expect(url('/posts/:slug?', { params: { slug: 'hi' } })).toBe('/posts/hi')
	})

	it('encodes params and serialises the query', () => {
		expect(url('/users/:id', { params: { id: 'a/b' } })).toBe('/users/a%2Fb')
		expect(url('/users', { query: { page: 2, tags: ['x', 'y z'] } })).toBe('/users?page=2&tags=x&tags=y+z')
		expect(url('/users', { query: { page: undefined } })).toBe('/users')
	})

	it('fails loudly on a missing param at runtime', () => {
		// @ts-expect-error params are required for this path
		expect(() => url('/users/:id')).toThrow('Missing "id"')
	})
})

describe('action()', () => {
	it('returns a { url, method } target for form.submit()', () => {
		const update = action('put', '/users/:id', { params: { id: '7' } })
		expect(update.url).toBe('/users/7')
		expect(update.method).toBe('put')
		expect(update.fields({ name: 'Ada' })).toEqual({ name: 'Ada' })
	})
})
