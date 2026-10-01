<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import '../app.css';
	onMount(() => {
		if ('serviceWorker' in navigator) void navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => undefined);
	});
</script>

<slot />
