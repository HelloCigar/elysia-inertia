// Prints what the client helpers build: bun demo/step-6.ts
import { Elysia, t } from 'elysia'
import { createRoutes } from '../src/client'

export const app = new Elysia()
	.get('/users', { query: t.Object({ page: t.Optional(t.Number()), tags: t.Optional(t.Array(t.String())) }) }, () => '')
	.get('/users/:id', () => '')
	.post('/users', { body: t.Object({ name: t.String(), email: t.String({ format: 'email' }) }) }, () => '')
	.put('/users/:id', { body: t.Object({ name: t.String() }) }, () => '')
	.get('/files/*', () => '')

const { url, action } = createRoutes<typeof app>()

const show = (code: string, value: unknown) => console.log(`${code}\n// → ${JSON.stringify(value)}\n`)
console.log('```ts')
show(`url('/users', { query: { page: 2, tags: ['a', 'b c'] } })`, url('/users', { query: { page: 2, tags: ['a', 'b c'] } }))
show(`url('/users/:id', { params: { id: 'a/b' } })`, url('/users/:id', { params: { id: 'a/b' } }))
show(`url('/files/*', { params: { '*': 'docs/report 1.pdf' } })`, url('/files/*', { params: { '*': 'docs/report 1.pdf' } }))
const update = action('put', '/users/:id', { params: { id: '7' } })
show(`action('put', '/users/:id', { params: { id: '7' } })`, { url: update.url, method: update.method })
console.log('```')
