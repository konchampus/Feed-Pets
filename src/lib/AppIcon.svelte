<script lang="ts">
	import type { CareKind } from '$lib/types';

	type IconKind = CareKind | 'paw' | 'home' | 'history' | 'calendar' | 'settings' | 'sunrise' | 'sparkle' | 'clock' | 'family' | 'bell' | 'appearance' | 'download' | 'sync' | 'device' | 'edit' | 'trash' | 'close' | 'add' | 'arrow';
	let { kind, className = '' } = $props<{ kind: IconKind; className?: string }>();
</script>

<svg class={`app-icon ${className}`} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
	{#if kind === 'meal'}
		<path d="M8 25.5h32l-3 10.3a4 4 0 0 1-3.85 2.9h-18.3A4 4 0 0 1 11 35.8L8 25.5Z" fill="#DDE6CF" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
		<path d="M7 23.5c1.9 4.2 5.8 6.3 17 6.3s15.1-2.1 17-6.3M17 15c1.6-1.4 1.6-3.1 0-4.7M24 14c1.7-1.6 1.7-3.5 0-5.2M31 15c1.5-1.5 1.5-3.1 0-4.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
		<path d="M15 34h18" stroke="#81916B" stroke-width="1.6" stroke-linecap="round" />
	{:else if kind === 'walk'}
		<path d="M16.5 9.2c2.7-.7 4.9 1.6 5 4.1.1 2.3-1.3 4.6-3.5 5-2.4.4-4.6-1.8-4.7-4.2-.1-2.3 1-4.3 3.2-4.9ZM31 14.4c2.5-.4 4.3 1.8 4.3 4 0 2-1.4 3.9-3.5 4-2.1.1-3.8-1.7-3.8-3.9 0-2 1-3.8 3-4.1Z" fill="#DDE6CF" stroke="currentColor" stroke-width="1.8" />
		<path d="M14.2 24.1c-4.4 1.3-6.6 8.5-3.4 11.7 2.7 2.7 6.9.2 8.9-1.9 2.2 2.2 6.4 4.6 9 1.9 3.2-3.2 1-10.4-3.4-11.7-2.3-.7-4.1.8-5.6 2.8-1.4-2-3.2-3.5-5.5-2.8Z" fill="#EFF1E5" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
	{:else if kind === 'water'}
		<path d="M24 7.5c-3.4 5.3-12.3 15.1-12.3 22.6a12.3 12.3 0 1 0 24.6 0C36.3 22.6 27.4 12.8 24 7.5Z" fill="#DDE9E3" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
		<path d="M18 30.5c0 3.6 2.3 5.9 5.7 6.2M30 28c-.2-1.5-.7-2.8-1.7-4.2" stroke="#6E9585" stroke-width="2" stroke-linecap="round" />
	{:else if kind === 'medicine'}
		<path d="M14.1 34.2a8 8 0 0 1 0-11.3l10.7-10.7a8 8 0 0 1 11.3 11.3L25.4 34.2a8 8 0 0 1-11.3 0Z" fill="#F1DFD1" stroke="currentColor" stroke-width="2.2" />
		<path d="m20.2 17.4 10.4 10.4M22.7 22.7h.1M25.4 25.4h.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
	{:else if kind === 'weight'}
		<path d="M13 9.5h22a3 3 0 0 1 3 3v24H10v-24a3 3 0 0 1 3-3Z" fill="#E8E9D9" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
		<path d="M17 16a7 7 0 0 1 14 0H17Z" fill="#FFFDF6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
		<path d="m24 16 2.7-3.2M17 30h14M20 34h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
	{:else if kind === 'vet'}
		<path d="M13 16h22a3 3 0 0 1 3 3v17H10V19a3 3 0 0 1 3-3Z" fill="#E8E9D9" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
		<path d="M18 16v-3.5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V16M24 21v10M19 26h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
		<path d="M14 36v3m20-3v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
	{:else if kind === 'vaccine'}
		<path d="m30.8 8.4 8.8 8.8M27.3 11.9l8.8 8.8M12 35l18.6-18.6 5 5L17 40h-5v-5Z" fill="#E7E9D9" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" />
		<path d="m17.5 29.5 3.8 3.8M9 39l-2 2m6-9-4-4m7-3-4-4m7-3-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
	{:else if kind === 'paw'}
		<ellipse cx="14.3" cy="16.6" rx="4.3" ry="5.6" transform="rotate(-25 14.3 16.6)" fill="#DCE5CE" stroke="currentColor" stroke-width="1.8" />
		<ellipse cx="23.5" cy="12.8" rx="4.1" ry="5.3" transform="rotate(-5 23.5 12.8)" fill="#DCE5CE" stroke="currentColor" stroke-width="1.8" />
		<ellipse cx="32.9" cy="16.5" rx="4.2" ry="5.5" transform="rotate(23 32.9 16.5)" fill="#DCE5CE" stroke="currentColor" stroke-width="1.8" />
		<ellipse cx="38.3" cy="24.2" rx="3.7" ry="4.9" transform="rotate(42 38.3 24.2)" fill="#DCE5CE" stroke="currentColor" stroke-width="1.8" />
		<path d="M13 31c0-5.4 5.2-9.2 11-9.2s11 3.8 11 9.2c0 4.1-3.4 6.7-7.6 5.1-2.1-.8-4.7-.8-6.8 0-4.2 1.6-7.6-1-7.6-5.1Z" fill="#AAB998" stroke="currentColor" stroke-width="2" />
	{:else if kind === 'home'}
		<path d="m7.5 22.2 16.5-13 16.5 13v16H27V27H21v11H7.5v-16Z" fill="#E1E7D5" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
		<path d="M17 18.5h.1M31 18.5h.1" stroke="#82916D" stroke-width="2.4" stroke-linecap="round" />
	{:else if kind === 'history'}
		<path d="M9 14h30M9 24h30M9 34h22" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
		<circle cx="5.8" cy="14" r="1.5" fill="#AAB998" /><circle cx="5.8" cy="24" r="1.5" fill="#AAB998" /><circle cx="5.8" cy="34" r="1.5" fill="#AAB998" />
	{:else if kind === 'calendar'}
		<rect x="8" y="11" width="32" height="29" rx="5" fill="#E8EBDD" stroke="currentColor" stroke-width="2.1" />
		<path d="M15 8v7m18-7v7M8 19h32M16 26h5m6 0h5m-16 7h5m6 0h5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
	{:else if kind === 'settings'}
		<path d="M8 14h32M8 24h32M8 34h32" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" />
		<circle cx="18" cy="14" r="4" fill="#F8F6EC" stroke="currentColor" stroke-width="2" />
		<circle cx="31" cy="24" r="4" fill="#F8F6EC" stroke="currentColor" stroke-width="2" />
		<circle cx="21" cy="34" r="4" fill="#F8F6EC" stroke="currentColor" stroke-width="2" />
	{:else if kind === 'sunrise'}
		<path d="M7 33h34M12 33a12 12 0 0 1 24 0M24 8v5m-12 .5 3.4 3.4m17.2-3.4-3.4 3.4M7 24h4m26 0h4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
		<path d="M24 21a12 12 0 0 1 12 12H12a12 12 0 0 1 12-12Z" fill="#E9E7D4" />
	{:else if kind === 'sparkle'}
		<path d="M24 6c1.9 9.2 5.8 13.1 15 15-9.2 1.9-13.1 5.8-15 15-1.9-9.2-5.8-13.1-15-15 9.2-1.9 13.1-5.8 15-15Z" fill="#EFE5C9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
		<path d="m37 31 1.6 4.4L43 37l-4.4 1.6L37 43l-1.6-4.4L31 37l4.4-1.6L37 31Z" fill="#D4BB84" />
	{:else if kind === 'clock'}
		<circle cx="24" cy="24" r="17" fill="#F4F0E1" stroke="currentColor" stroke-width="2.2" />
		<path d="M24 13v11l7.5 4.5M19 6h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
	{:else if kind === 'family'}
		<circle cx="17" cy="17" r="5.5" fill="#DCE5CE" stroke="currentColor" stroke-width="1.8" />
		<circle cx="32" cy="18.5" r="4.5" fill="#EADBC8" stroke="currentColor" stroke-width="1.8" />
		<path d="M6.5 36c.5-6.5 4.4-10.5 10.5-10.5S27 29.5 27.5 36H6.5Zm20.5 0c.3-4.9 3.1-8 7.4-8 4.5 0 6.9 3.1 7.1 8H27Z" fill="#E9EBDD" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
	{:else if kind === 'bell'}
		<path d="M12 31c2.6-3 3.2-6.7 3.2-11a8.8 8.8 0 0 1 17.6 0c0 4.3.6 8 3.2 11l2.1 2.4H9.9L12 31Z" fill="#E9EBDD" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" />
		<path d="M20 38a4.2 4.2 0 0 0 8 0M24 7V5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
	{:else if kind === 'appearance'}
		<circle cx="24" cy="24" r="16" fill="#E8E7D6" stroke="currentColor" stroke-width="2" />
		<path d="M24 8v32a16 16 0 0 0 0-32Z" fill="#AAB998" />
		<path d="M24 8v32" stroke="currentColor" stroke-width="1.8" />
	{:else if kind === 'download'}
		<path d="M24 7v22m-8-8 8 8 8-8M10 31v7a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
		<path d="M14 35h20" stroke="#AAB998" stroke-width="2" stroke-linecap="round" />
	{:else if kind === 'sync'}
		<path d="M38 18a15 15 0 0 0-26-5l-3 3m0 0V9m0 7h7M10 30a15 15 0 0 0 26 5l3-3m0 0v7m0-7h-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
	{:else if kind === 'device'}
		<rect x="12" y="6" width="24" height="36" rx="5" fill="#E8EBDD" stroke="currentColor" stroke-width="2.2" />
		<path d="M20 11h8m-6 26h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
	{:else if kind === 'edit'}
		<path d="m29 10 9 9M11 37l2-9L31 10a4.2 4.2 0 0 1 6 6L19 34l-8 3Z" fill="#EAE7D9" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
		<path d="m13 28 6 6" stroke="currentColor" stroke-width="2" />
	{:else if kind === 'trash'}
		<path d="M10 14h28m-18-4h8m-16 4 2 25h20l2-25M20 20v13m8-13v13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
	{:else if kind === 'close'}
		<path d="m14 14 20 20m0-20L14 34" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" />
	{:else if kind === 'add'}
		<circle cx="24" cy="24" r="16" fill="#E7EBDD" />
		<path d="M24 15v18m-9-9h18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
	{:else if kind === 'arrow'}
		<path d="M14 34 34 14m-16 0h16v16" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
	{/if}
</svg>
