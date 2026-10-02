<script lang="ts">
	import { onMount } from 'svelte';
	let host: HTMLDivElement;
	let failed = $state(false);
	let ready = $state(false);
	let reduced = $state(false);

	onMount(() => {
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('lapki:reduced-motion') === 'true';
		if (reduced) return;
		let renderer: import('three').WebGLRenderer | undefined;
		let frame = 0;
		let resize: ResizeObserver | undefined;
		let idleCallback: number | undefined;
		let fallbackTimer = 0;
		let dead = false;
		const loadScene = () => void import('three').then((THREE) => {
			if (dead) return;
			try {
				const scene = new THREE.Scene();
				scene.background = new THREE.Color('#eef0dc');
				const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
				camera.position.set(0, 2.8, 6.8);
				camera.lookAt(0, 0.65, 0);
				renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFSoftShadowMap;
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				host.appendChild(renderer.domElement);
				const hemi = new THREE.HemisphereLight('#fffbea', '#b0a985', 2.1); scene.add(hemi);
				const key = new THREE.DirectionalLight('#fff7d5', 3.2); key.position.set(-3, 6, 4); key.castShadow = true; scene.add(key);
				const bowlMat = new THREE.MeshStandardMaterial({ color: '#bb6244', roughness: 0.34, metalness: 0.1 });
				const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.07, 0.7, 48, 1, true), bowlMat);
				bowl.position.y = 0.48; bowl.castShadow = true; bowl.receiveShadow = true; scene.add(bowl);
				const inside = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshStandardMaterial({ color: '#d17c53', roughness: 0.48, side: THREE.DoubleSide }));
				inside.rotation.x = -Math.PI / 2; inside.position.y = 0.79; scene.add(inside);
				const rim = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.08, 10, 56), new THREE.MeshStandardMaterial({ color: '#e4a278', roughness: 0.31 }));
				rim.rotation.x = Math.PI / 2; rim.position.y = 0.79; scene.add(rim);
				const kibbleMat = new THREE.MeshStandardMaterial({ color: '#67442c', roughness: 0.7 });
				for (let i = 0; i < 22; i++) {
					const angle = i * 2.4; const radius = (i % 5) * 0.17;
					const kibble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11 + (i % 3) * 0.018, 0), kibbleMat);
					kibble.position.set(Math.cos(angle) * radius, 0.88 + (i % 2) * 0.035, Math.sin(angle) * radius);
					kibble.rotation.set(i, i * 0.6, i * 0.4); kibble.castShadow = true; scene.add(kibble);
				}
				const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: '#eef0dc', roughness: 0.9 }));
				floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; scene.add(floor);
				resize = new ResizeObserver(([entry]) => {
					const width = entry.contentRect.width; const height = entry.contentRect.height;
					if (width < 1 || height < 1) return;
					renderer?.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
				}); resize.observe(host);
				const animate = (time: number) => {
					if (!renderer) return;
					bowl.rotation.y = Math.sin(time * 0.0004) * 0.06;
					renderer.render(scene, camera);
					if (!ready) ready = true;
					frame = requestAnimationFrame(animate);
				};
				frame = requestAnimationFrame(animate);
			} catch { failed = true; }
		}).catch(() => { failed = true; });
		if (typeof window.requestIdleCallback === 'function') idleCallback = window.requestIdleCallback(loadScene, { timeout: 1200 });
		else fallbackTimer = window.setTimeout(loadScene, 250);
		return () => {
			dead = true;
			if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback);
			clearTimeout(fallbackTimer);
			cancelAnimationFrame(frame); resize?.disconnect(); renderer?.dispose(); renderer?.domElement.remove();
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
