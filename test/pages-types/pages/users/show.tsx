import { Component } from 'react'

export default class Show extends Component<{ user: { id: number } }> {
	render() {
		return this.props.user.id
	}
}
