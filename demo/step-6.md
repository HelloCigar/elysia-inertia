# Step 6 output: typed client helpers

The client imports the server app's **type** only, and `createRoutes` reads Elysia's route table: paths, params, query and body schemas. Routes used here (`demo/step-6.ts`):

```ts
export const app = new Elysia()
	.get('/users', { query: t.Object({ page: t.Optional(t.Number()), tags: t.Optional(t.Array(t.String())) }) }, () => '')
	.get('/users/:id', () => '')
	.post('/users', { body: t.Object({ name: t.String(), email: t.String({ format: 'email' }) }) }, () => '')
	.put('/users/:id', { body: t.Object({ name: t.String() }) }, () => '')
	.get('/files/*', () => '')

```

## What the helpers build at runtime

```ts
url('/users', { query: { page: 2, tags: ['a', 'b c'] } })
// → "/users?page=2&tags=a&tags=b+c"

url('/users/:id', { params: { id: 'a/b' } })
// → "/users/a%2Fb"

url('/files/*', { params: { '*': 'docs/report 1.pdf' } })
// → "/files/docs/report%201.pdf"

action('put', '/users/:id', { params: { id: '7' } })
// → {"url":"/users/7","method":"put"}

```

## In a React page

```tsx
export function CreateUser() {
	const store = action('post', '/users')
	// fields() is typed by the POST /users body schema
	const form = useForm(store.fields({ name: '' }))
	// form.errors is keyed by the same fields
	form.errors.emial
	form.submit(store)
}
```

## Type checks

`demo/type-errors/step-6.tsx` makes five mistakes against those routes and Inertia's own `useForm` from `@inertiajs/react` 3.9.1. `tsc` reports:

```text
demo/type-errors/step-6.tsx(9,5): error TS2345: Argument of type '"/user/:id"' is not assignable to parameter of type '"/files/*" | "/users" | "/users/:id"'.
demo/type-errors/step-6.tsx(11,1): error TS2554: Expected 2 arguments, but got 1.
demo/type-errors/step-6.tsx(13,26): error TS2322: Type 'string' is not assignable to type 'number'.
demo/type-errors/step-6.tsx(18,36): error TS2741: Property 'email' is missing in type '{ name: string; }' but required in type '{ name: string; email: string; }'.
demo/type-errors/step-6.tsx(20,14): error TS2551: Property 'emial' does not exist on type 'FormDataErrors<{ name: string; email: string; }>'. Did you mean 'email'?
```

## Test run

```text
 74 pass
 0 fail
 197 expect() calls
Ran 74 tests across 6 files. [269.00ms]
```
