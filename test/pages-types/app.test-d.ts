import { Elysia } from 'elysia'
import { inertia } from '../../src'

new Elysia()
	.use(inertia())
	.get('/', { inertia: 'home' }, ({ render }) => render())
	.get('/users', ({ inertia }) => inertia.render('users/index'))
	// @ts-expect-error no page file for this name
	.get('/gone', { inertia: 'users/show' }, ({ render }) => render())
	// @ts-expect-error no page file for this name
	.get('/typo', ({ inertia }) => inertia.render('user/index'))
