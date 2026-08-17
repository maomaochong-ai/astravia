import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import {
	AmbientLight,
	CanvasTexture,
	Color,
	DirectionalLight,
	DoubleSide,
	ExtrudeGeometry,
	Group,
	LinearFilter,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	Shape,
	SRGBColorSpace,
	Texture,
	TextureLoader,
	Vector2,
	WebGLRenderer,
} from "three";

export interface AchievementPromotionBadge3DProps {
	imageUrl: string;
	onCelebrate: () => void;
	onComplete: () => void;
	onHideText: () => void;
	onRevealText: () => void;
}

const ANIMATION_DURATION_MS = 4300;
const BADGE_RENDER_SCALE = 0.6;
const BADGE_WIDTH = 2.35;
const BADGE_DEPTH = 0.22;
const OUTLINE_RESOLUTION = 512;
const OUTLINE_POINT_COUNT = 384;

function easeOutCubic(value: number): number {
	return 1 - (1 - value) ** 3;
}

function interpolateKeyframes(
	progress: number,
	times: readonly number[],
	values: readonly number[],
): number {
	const lastIndex = times.length - 1;
	if (progress <= times[0]) return values[0];
	if (progress >= times[lastIndex]) return values[lastIndex];

	for (let index = 1; index <= lastIndex; index += 1) {
		if (progress > times[index]) continue;
		const segmentProgress = (progress - times[index - 1]) / (times[index] - times[index - 1]);
		return values[index - 1] + (values[index] - values[index - 1]) * segmentProgress;
	}
	return values[lastIndex];
}

function createFallbackTexture(): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = 2;
	canvas.height = 2;
	const context = canvas.getContext("2d");
	if (context) {
		context.fillStyle = "#b9893f";
		context.fillRect(0, 0, 2, 2);
	}
	return new CanvasTexture(canvas);
}

function smoothClosedOutline(points: readonly Vector2[]): Vector2[] {
	let smoothed = points.map((point) => point.clone());
	for (let pass = 0; pass < 4; pass += 1) {
		smoothed = smoothed.map((point, index, allPoints) => {
			const previous = allPoints[(index - 1 + allPoints.length) % allPoints.length];
			const next = allPoints[(index + 1) % allPoints.length];
			return new Vector2(
				previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
				previous.y * 0.25 + point.y * 0.5 + next.y * 0.25,
			);
		});
	}
	return smoothed;
}

function createBadgeShape(image: HTMLImageElement): Shape {
	const canvas = document.createElement("canvas");
	canvas.width = OUTLINE_RESOLUTION;
	canvas.height = OUTLINE_RESOLUTION;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	const aspectRatio = image.naturalWidth / image.naturalHeight;
	const drawWidth = aspectRatio >= 1
		? OUTLINE_RESOLUTION
		: OUTLINE_RESOLUTION * aspectRatio;
	const drawHeight = aspectRatio >= 1
		? OUTLINE_RESOLUTION / aspectRatio
		: OUTLINE_RESOLUTION;
	const drawX = (OUTLINE_RESOLUTION - drawWidth) / 2;
	const drawY = (OUTLINE_RESOLUTION - drawHeight) / 2;
	context?.drawImage(image, drawX, drawY, drawWidth, drawHeight);
	const pixels = context?.getImageData(0, 0, OUTLINE_RESOLUTION, OUTLINE_RESOLUTION).data;
	const center = OUTLINE_RESOLUTION / 2;
	const maxRadius = Math.SQRT2 * center;
	const badgeHeight = BADGE_WIDTH / aspectRatio;
	const points: Vector2[] = [];

	if (pixels) {
		for (let step = 0; step < OUTLINE_POINT_COUNT; step += 1) {
			const angle = (step / OUTLINE_POINT_COUNT) * Math.PI * 2;
			for (let radius = maxRadius; radius >= 0; radius -= 1) {
				const pixelX = Math.round(center + Math.cos(angle) * radius);
				const pixelY = Math.round(center - Math.sin(angle) * radius);
				if (
					pixelX < 0
					|| pixelX >= OUTLINE_RESOLUTION
					|| pixelY < 0
					|| pixelY >= OUTLINE_RESOLUTION
				) {
					continue;
				}
				const alpha = pixels[(pixelY * OUTLINE_RESOLUTION + pixelX) * 4 + 3];
				if (alpha < 64) continue;
				points.push(new Vector2(
					(pixelX / OUTLINE_RESOLUTION - 0.5) * BADGE_WIDTH,
					(0.5 - pixelY / OUTLINE_RESOLUTION) * badgeHeight,
				));
				break;
			}
		}
	}

	if (points.length >= 24) return new Shape(smoothClosedOutline(points));
	const fallback = new Shape();
	fallback.absellipse(0, 0, BADGE_WIDTH / 2, badgeHeight / 2, 0, Math.PI * 2);
	return fallback;
}

function createBadgeGeometry(shape: Shape): ExtrudeGeometry {
	const geometry = new ExtrudeGeometry(shape, {
		bevelEnabled: true,
		bevelSegments: 6,
		bevelSize: 0.025,
		bevelThickness: 0.035,
		curveSegments: 4,
		depth: BADGE_DEPTH,
	});
	geometry.translate(0, 0, -BADGE_DEPTH / 2);
	return geometry;
}

export function AchievementPromotionBadge3D({
	imageUrl,
	onCelebrate,
	onComplete,
	onHideText,
	onRevealText,
}: AchievementPromotionBadge3DProps): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const renderer = new WebGLRenderer({
			alpha: true,
			antialias: true,
			canvas,
			powerPreference: "high-performance",
		});
		renderer.setClearColor(0x000000, 0);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.outputColorSpace = SRGBColorSpace;

		const scene = new Scene();
		const camera = new PerspectiveCamera(34, 1, 0.1, 100);
		camera.position.set(0, 0.15, 7);

		scene.add(new AmbientLight(0xffffff, 2.1));
		const keyLight = new DirectionalLight(0xffe0a3, 4.8);
		keyLight.position.set(3, 4, 6);
		scene.add(keyLight);
		const rimLight = new DirectionalLight(0xc1472d, 3.2);
		rimLight.position.set(-4, 1, -3);
		scene.add(rimLight);

		const badge = new Group();
		badge.scale.setScalar(BADGE_RENDER_SCALE);
		scene.add(badge);

		const fallbackShape = new Shape();
		fallbackShape.absellipse(0, 0, 1.08, 1, 0, Math.PI * 2);
		let edgeGeometry = createBadgeGeometry(fallbackShape);
		const edgeMaterial = new MeshPhysicalMaterial({
			color: new Color("#c58a32"),
			metalness: 0.86,
			roughness: 0.22,
			clearcoat: 0.78,
			clearcoatRoughness: 0.16,
			transparent: true,
		});
		const edge = new Mesh(edgeGeometry, edgeMaterial);
		badge.add(edge);

		const faceGeometry = new PlaneGeometry(1, 1);
		const texture = createFallbackTexture();
		texture.colorSpace = SRGBColorSpace;
		texture.minFilter = LinearFilter;
		texture.magFilter = LinearFilter;
		const faceMaterial = new MeshBasicMaterial({
			alphaTest: 0.02,
			map: texture,
			side: DoubleSide,
			toneMapped: false,
			transparent: true,
		});
		const front = new Mesh(faceGeometry, faceMaterial);
		front.position.z = BADGE_DEPTH / 2 + 0.04;
		front.scale.set(BADGE_WIDTH, 2.16, 1);
		badge.add(front);

		const back = new Mesh(faceGeometry, faceMaterial);
		back.position.z = -(BADGE_DEPTH / 2 + 0.04);
		back.rotation.y = Math.PI;
		back.scale.copy(front.scale);
		badge.add(back);

		let active = true;
		const loadedTexture = new TextureLoader().load(imageUrl, (nextTexture: Texture) => {
			if (!active) {
				nextTexture.dispose();
				return;
			}
			nextTexture.colorSpace = SRGBColorSpace;
			nextTexture.minFilter = LinearFilter;
			nextTexture.magFilter = LinearFilter;
			faceMaterial.map = nextTexture;
			faceMaterial.needsUpdate = true;
			const image = nextTexture.image as HTMLImageElement;
			const badgeHeight = BADGE_WIDTH * image.naturalHeight / image.naturalWidth;
			front.scale.set(BADGE_WIDTH, badgeHeight, 1);
			back.scale.copy(front.scale);
			const nextGeometry = createBadgeGeometry(createBadgeShape(image));
			edge.geometry = nextGeometry;
			edgeGeometry.dispose();
			edgeGeometry = nextGeometry;
			texture.dispose();
		});

		const resizeObserver = new ResizeObserver(([entry]) => {
			const width = Math.max(1, entry.contentRect.width);
			const height = Math.max(1, entry.contentRect.height);
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		});
		resizeObserver.observe(canvas);

		let animationFrame = 0;
		let celebrated = false;
		let completed = false;
		let textHidden = false;
		let textRevealed = false;
		const startTime = performance.now();
		const materials = [edgeMaterial, faceMaterial];

		const renderFrame = (time: number) => {
			const elapsed = time - startTime;
			const progress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
			if (!celebrated && progress >= 0.28) {
				celebrated = true;
				onCelebrate();
			}
			if (!textRevealed && progress >= 0.52) {
				textRevealed = true;
				onRevealText();
			}
			if (textRevealed && !textHidden && progress >= 0.78) {
				textHidden = true;
				onHideText();
			}

			if (reduceMotion) {
				badge.position.y = 0.18;
				badge.rotation.set(0, 0, 0);
				badge.scale.setScalar(BADGE_RENDER_SCALE);
			} else {
				badge.position.y = interpolateKeyframes(
					progress,
					[0, 0.1, 0.25, 0.36, 0.44, 0.53, 1],
					[-1.48, -1.48, 0.86, 0.02, 0.31, 0.18, 0.18],
				);
				const stretch = interpolateKeyframes(
					progress,
					[0, 0.1, 0.2, 0.28, 0.36, 0.44, 0.53, 1],
					[0.68, 0.68, 1.34, 1.12, 0.88, 1.08, 1, 1],
				);
				badge.scale.set(
					(2 - stretch) * BADGE_RENDER_SCALE,
					stretch * BADGE_RENDER_SCALE,
					BADGE_RENDER_SCALE,
				);
				const rotationProgress = easeOutCubic(Math.min(progress / 0.58, 1));
				badge.rotation.y = -0.8 * (1 - rotationProgress) + rotationProgress * Math.PI * 4;
				badge.rotation.x = Math.sin(progress * Math.PI * 5) * (1 - rotationProgress) * 0.38;
				badge.rotation.z = Math.sin(progress * Math.PI * 3) * (1 - rotationProgress) * 0.16;
			}

			const opacity = interpolateKeyframes(
				progress,
				[0, 0.09, 0.14, 0.78, 1],
				[0, 0, 1, 1, 0],
			);
			for (const material of materials) {
				material.opacity = opacity;
			}

			renderer.render(scene, camera);
			if (progress < 1) {
				animationFrame = requestAnimationFrame(renderFrame);
				return;
			}
			if (!completed) {
				completed = true;
				onComplete();
			}
		};

		animationFrame = requestAnimationFrame(renderFrame);

		return () => {
			active = false;
			cancelAnimationFrame(animationFrame);
			resizeObserver.disconnect();
			loadedTexture.dispose();
			texture.dispose();
			edgeGeometry.dispose();
			faceGeometry.dispose();
			edgeMaterial.dispose();
			faceMaterial.dispose();
			renderer.dispose();
		};
	}, [imageUrl, onCelebrate, onComplete, onHideText, onRevealText, reduceMotion]);

	return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
