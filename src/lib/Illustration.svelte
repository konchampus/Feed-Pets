<script lang="ts">
	import { base } from '$app/paths';

	let { kind, className = '' } = $props<{ kind: 'dog' | 'bowl' | 'heart'; className?: string }>();
	let imagePath = $derived(`${base}/${kind}-illustration.svg`);
</script>

<img class={className} src={imagePath} alt="" aria-hidden="true" draggable="false" />
