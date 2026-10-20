// Deliberate mistakes for step 5, to show what the compiler reports
import type { FlashData } from '@inertiajs/core'
import { Elysia } from 'elysia'
import { inertia, type InertiaConfigOf } from '../../src'

declare module '../../src' {
	interface InertiaFlash {
		toast: { kind: 'success' | 'error'; text: string }
	}
}

const app = new Elysia()
	.use(inertia())
	// 1. Flashing a value of the wrong shape
	.post('/a', ({ inertia }) => inertia.flash('toast', { kind: 'info', text: 'hi' }).back())
	// 2. Flashing a key that was never registered
	.post('/b', ({ inertia }) => inertia.flash('banner', 'hi').back())

declare module '@inertiajs/core' {
	interface InertiaConfig extends InertiaConfigOf<typeof app> {}
}

// The client's page.flash is typed from the same registration
declare const flash: FlashData
// 3. Reading a flash key that doesn't exist
flash.banner
// Correct
flash.toast?.text
