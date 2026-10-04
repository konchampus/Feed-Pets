import {
	CircleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	DodecahedronGeometry,
	DoubleSide,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	PCFSoftShadowMap,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	TorusGeometry,
	WebGLRenderer
} from 'three';

export function mountBowlScene(host: HTMLDivElement, onReady: () => void) {
	let renderer: WebGLRenderer | undefined;
	let frame = 0;
	let resize: ResizeObserver | undefined;
	const scene = new Scene();

	function stopScene() {
		cancelAnimationFrame(frame);
		resize?.disconnect();
		renderer?.dispose();
		renderer?.domElement.remove();
	}

	try {
		scene.background = new Color('#eef0dc');
		const camera = new PerspectiveCamera(34, 1, 0.1, 100);
		camera.position.set(0, 2.8, 6.8);
		camera.lookAt(0, 0.65, 0);
		renderer = new WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = PCFSoftShadowMap;
		renderer.outputColorSpace = SRGBColorSpace;
		host.appendChild(renderer.domElement);

		const hemi = new HemisphereLight('#fffbea', '#b0a985', 2.1);
		scene.add(hemi);
		const key = new DirectionalLight('#fff7d5', 3.2);
		key.position.set(-3, 6, 4);
		key.castShadow = true;
		scene.add(key);

		const bowlMat = new MeshStandardMaterial({ color: '#bb6244', roughness: 0.34, metalness: 0.1 });
		const bowl = new Mesh(new CylinderGeometry(1.5, 1.07, 0.7, 48, 1, true), bowlMat);
		bowl.position.y = 0.48;
		bowl.castShadow = true;
		bowl.receiveShadow = true;
		scene.add(bowl);

		const inside = new Mesh(
			new CircleGeometry(1.5, 48),
			new MeshStandardMaterial({ color: '#d17c53', roughness: 0.48, side: DoubleSide })
		);
		inside.rotation.x = -Math.PI / 2;
		inside.position.y = 0.79;
		scene.add(inside);

		const rim = new Mesh(
			new TorusGeometry(1.48, 0.08, 10, 56),
			new MeshStandardMaterial({ color: '#e4a278', roughness: 0.31 })
		);
		rim.rotation.x = Math.PI / 2;
		rim.position.y = 0.79;
		scene.add(rim);

		const kibbleMat = new MeshStandardMaterial({ color: '#67442c', roughness: 0.7 });
		for (let i = 0; i < 22; i++) {
			const angle = i * 2.4;
			const radius = (i % 5) * 0.17;
			const kibble = new Mesh(new DodecahedronGeometry(0.11 + (i % 3) * 0.018, 0), kibbleMat);
			kibble.position.set(Math.cos(angle) * radius, 0.88 + (i % 2) * 0.035, Math.sin(angle) * radius);
			kibble.rotation.set(i, i * 0.6, i * 0.4);
			kibble.castShadow = true;
			scene.add(kibble);
		}

		const floor = new Mesh(
			new CircleGeometry(4, 64),
			new MeshStandardMaterial({ color: '#eef0dc', roughness: 0.9 })
		);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = 0.02;
		floor.receiveShadow = true;
		scene.add(floor);

		resize = new ResizeObserver(([entry]) => {
			const width = entry.contentRect.width;
			const height = entry.contentRect.height;
			if (width < 1 || height < 1) return;
			renderer?.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		});
		resize.observe(host);

		const animate = (time: number) => {
			if (!renderer) return;
			bowl.rotation.y = Math.sin(time * 0.0004) * 0.06;
			renderer.render(scene, camera);
			onReady();
			frame = requestAnimationFrame(animate);
		};
		frame = requestAnimationFrame(animate);
	} catch (error) {
		stopScene();
		throw error;
	}

	return stopScene;
}
