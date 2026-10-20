import { definePage } from 'elysia-inertia/client'

export default definePage('users/index', ({ users }) => (
	<ul>
		{users.map((user) => (
			<li key={user.id}>{user.name}</li>
		))}
	</ul>
))
