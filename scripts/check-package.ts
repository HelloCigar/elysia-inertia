import assert from 'node:assert/strict'
import { Elysia } from 'elysia'
// Explicit build paths keep Bun's development aliases out of this check.
// test/package/consumer.ts separately checks package export resolution.
import { inertia, merge } from '../dist/index.js'
import { createRoutes } from '../dist/client.js'
import { isInertiaProp } from '../dist/internal.js'
import { inertiaPages } from '../dist/vite-entry.js'

// Shared classes must retain their identity across package entry points.
assert.ok(isInertiaProp(merge([1, 2])))
assert.equal(typeof inertiaPages, 'function')
assert.equal(createRoutes<any>().url('/users/:id', { params: { id: 1 } }), '/users/1')

const app = new Elysia()
	.use(inertia())
	.get('/', ({ inertia }) => inertia.render('home', { greeting: 'Hello' }))
const response = await app.handle(new Request('http://localhost/', {
	headers: { 'X-Inertia': 'true' }
}))
assert.equal(response.status, 200)
assert.equal((await response.json()).props.greeting, 'Hello')

// The client entry must bundle for browsers without pulling in server modules.
const client = await Bun.build({
	entrypoints: ['./dist/client.js'],
	target: 'browser'
})
assert.ok(client.success, client.logs.map(String).join('\n'))
assert.ok(client.outputs.length > 0)
console.log('Package exports, route rendering, and browser client bundle passed.')
