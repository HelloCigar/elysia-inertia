// Deliberate mistakes for step 6, to show what the compiler reports
import { useForm } from '@inertiajs/react'
import { createRoutes } from '../../src/client'
import type { app } from '../step-6'

const { url, action } = createRoutes<typeof app>()

// 1. A path the app doesn't serve
url('/user/:id', { params: { id: '1' } })
// 2. Forgetting a path parameter
url('/users/:id')
// 3. A query value of the wrong type
url('/users', { query: { page: 'two' } })

export function CreateUser() {
	const store = action('post', '/users')
	// 4. Form data missing a field of the body schema
	const form = useForm(store.fields({ name: '' }))
	// 5. A misspelt error key
	form.errors.emial
	form.submit(store)
}
