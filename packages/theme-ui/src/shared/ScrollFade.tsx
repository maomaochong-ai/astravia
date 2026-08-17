import {
	type CSSProperties,
	type HTMLAttributes,
	type JSX,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from "react";

/** Default fade height (px) at the bottom edge when more content is below. */
const DEFAULT_FADE_SIZE = 28;

export interface ScrollFadeProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
	children: ReactNode;
	/** Callback ref for the scroll element (e.g. Virtuoso customScrollParent). */
	onScrollRef?: (el: HTMLDivElement | null) => void;
	/** Bottom fade height in px. Default 28. */
	fadeSize?: number;
}

/**
 * Scroll container that applies a bottom edge fade (via mask-image) when content
 * overflows and the user is not scrolled to the bottom — a scroll affordance
 * without showing a scrollbar.
 */
export function ScrollFade({
	children,
	className,
	fadeSize = DEFAULT_FADE_SIZE,
	onScrollRef,
	style,
	...rest
}: ScrollFadeProps): JSX.Element {
	const [el, setEl] = useState<HTMLDivElement | null>(null);
	const [canScrollMore, setCanScrollMore] = useState(false);

	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			setEl(node);
			onScrollRef?.(node);
		},
		[onScrollRef],
	);

	useEffect(() => {
		if (!el) {
			setCanScrollMore(false);
			return;
		}

		const sync = () => {
			const more = el.scrollHeight - el.scrollTop - el.clientHeight > 1;
			setCanScrollMore((prev) => (prev === more ? prev : more));
		};

		sync();
		el.addEventListener("scroll", sync, { passive: true });

		const ro = new ResizeObserver(sync);
		ro.observe(el);
		for (const child of el.children) {
			ro.observe(child);
		}

		const mo = new MutationObserver(() => {
			for (const child of el.children) {
				ro.observe(child);
			}
			sync();
		});
		mo.observe(el, { childList: true, subtree: true });

		return () => {
			el.removeEventListener("scroll", sync);
			ro.disconnect();
			mo.disconnect();
		};
	}, [el]);

	const maskImage = canScrollMore
		? `linear-gradient(to bottom, black 0%, black calc(100% - ${fadeSize}px), transparent 100%)`
		: undefined;

	const mergedStyle: CSSProperties = {
		...style,
		...(maskImage
			? {
					WebkitMaskImage: maskImage,
					maskImage,
				}
			: undefined),
	};

	return (
		<div ref={setRef} className={className} style={mergedStyle} {...rest}>
			{children}
		</div>
	);
}
