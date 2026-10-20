import { usePage } from '@inertiajs/react'

interface User {
	id: number
	name: string
	joined: string
}

export interface Props {
	users: User[]
	total: number
	filters: { search: string | null; role?: string }
	stats?: { visits: number }
	appName: string
}

// Reads the shared props through Register while its own props type the route
export default function Users({ users, stats }: Props) {
	const { props } = usePage()
	return (
		<ul title={props.appName}>
			{users.map((user) => (
				<li key={user.id}>{user.name}</li>
			))}
			{stats?.visits}
		</ul>
	)
}
