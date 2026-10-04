<script lang="ts">
	import { onMount } from 'svelte';
	let host: HTMLDivElement;
	let failed = $state(false);
	let ready = $state(false);
	let reduced = $state(false);

	onMount(() => {
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('lapki:reduced-motion') === 'true';
		if (reduced) return;
		let stopScene: (() => void) | undefined;
		let idleCallback: number | undefined;
		let fallbackTimer = 0;
		let dead = false;
		const loadScene = () => void import('$lib/bowlSceneRenderer').then(({ mountBowlScene }) => {
			if (dead) return;
			try { stopScene = mountBowlScene(host, () => { if (!ready) ready = true; }); }
			catch { failed = true; }
		}).catch(() => { failed = true; });
		if (typeof window.requestIdleCallback === 'function') idleCallback = window.requestIdleCallback(loadScene, { timeout: 1200 });
		else fallbackTimer = window.setTimeout(loadScene, 250);
		return () => {
			dead = true;
			if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback);
			clearTimeout(fallbackTimer);
			stopScene?.();
		};
	});
</script>

<div class="bowl-art" bind:this={host} aria-hidden="true">
	{#if failed || reduced || !ready}
		<div class="bowl-fallback"><span>🥣</span><i>● ● ● ●</i></div>
	{/if}
</div>

<style>
	.bowl-art { position: relative; width: 100%; height: 212px; overflow: hidden; border-radius: 44% 56% 38% 43% / 42% 36% 56% 51%; background: #eef0dc; }
	.bowl-art :global(canvas) { display: block; width: 100%; height: 100%; }
	.bowl-fallback { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 2px; background: radial-gradient(ellipse at 50% 72%, #dee4c4 0 37%, transparent 38%); pointer-events: none; }
	.bowl-fallback span { font-size: 106px; line-height: 1; filter: drop-shadow(0 16px 8px #c0b69c); }
	.bowl-fallback i { color: #67442c; letter-spacing: 8px; font-style: normal; font-size: 12px; margin-top: -21px; }
</style>
