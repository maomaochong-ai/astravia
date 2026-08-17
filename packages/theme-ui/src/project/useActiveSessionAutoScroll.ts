import { type RefObject, useEffect, useRef } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { VIRTUAL_SESSION_ROW_HEIGHT } from "./types";

const SAFE_ZONE_TOP_RATIO = 1 / 3;
const SAFE_ZONE_BOTTOM_RATIO = 2 / 3;
const MIN_SCROLL_RANGE = VIRTUAL_SESSION_ROW_HEIGHT;
const MIN_SCROLL_DELTA = VIRTUAL_SESSION_ROW_HEIGHT / 2;
const LAYOUT_SETTLE_DELAY_MS = 370;
const SIDEBAR_SELECTION_DELAY_MS = 370;
const SCROLL_END_FALLBACK_MS = 800;
let latestSelectionRequest = 0;

type ScrollAdjustment = "moved" | "stable" | "unavailable";
export type SidebarSelectionWait = boolean | Promise<void>;

interface ActiveSessionAutoScrollOptions {
	activeIndex: number;
	activeKey: string | undefined;
	enabled?: boolean;
	scrollParent: HTMLElement | null;
	virtuosoRef: RefObject<VirtuosoHandle | null>;
}

interface ExpandedProjectAutoScrollOptions {
	expanded: boolean;
	projectRowRef: RefObject<HTMLElement | null>;
	scrollParent: HTMLElement | null;
}

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasUsefulScrollRange(scrollParent: HTMLElement): boolean {
	return scrollParent.scrollHeight - scrollParent.clientHeight > MIN_SCROLL_RANGE;
}

function scrollElementIntoSafeZone(scrollParent: HTMLElement, element: HTMLElement): ScrollAdjustment {
	if (!hasUsefulScrollRange(scrollParent)) return "unavailable";
	const containerRect = scrollParent.getBoundingClientRect();
	const rowRect = element.getBoundingClientRect();
	const viewportHeight = containerRect.height;
	const rowCenter = rowRect.top - containerRect.top + rowRect.height / 2;
	const safeTop = viewportHeight * SAFE_ZONE_TOP_RATIO;
	const safeBottom = viewportHeight * SAFE_ZONE_BOTTOM_RATIO;
	if (rowCenter >= safeTop && rowCenter <= safeBottom) return "stable";

	const delta = rowCenter - safeTop;
	if (Math.abs(delta) <= MIN_SCROLL_DELTA) return "stable";

	const maxScrollTop = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
	const targetTop = Math.min(maxScrollTop, Math.max(0, scrollParent.scrollTop + delta));
	if (Math.abs(targetTop - scrollParent.scrollTop) <= MIN_SCROLL_DELTA) return "stable";

	scrollParent.scrollTo({
		top: targetTop,
		behavior: prefersReducedMotion() ? "auto" : "smooth",
	});
	return "moved";
}

function scrollMountedActiveRow(scrollParent: HTMLElement): boolean {
	const activeRow = scrollParent.querySelector<HTMLElement>('[data-session-active="true"]');
	return activeRow ? scrollElementIntoSafeZone(scrollParent, activeRow) !== "unavailable" : false;
}

function waitForScrollEnd(scrollParent: HTMLElement): Promise<void> {
	return new Promise((resolve) => {
		let fallbackTimer = 0;
		const finish = () => {
			window.clearTimeout(fallbackTimer);
			scrollParent.removeEventListener("scrollend", finish);
			resolve();
		};

		scrollParent.addEventListener("scrollend", finish, { once: true });
		fallbackTimer = window.setTimeout(finish, SCROLL_END_FALLBACK_MS);
	});
}

function waitForDelay(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, SIDEBAR_SELECTION_DELAY_MS));
}

/** Starts click-time sidebar positioning before expensive session or project navigation. */
export function prepareSidebarSelection(element: HTMLElement): SidebarSelectionWait {
	const scrollParent = element.closest<HTMLElement>('[data-sidebar-selection-scroll="true"]');
	if (!scrollParent) return false;
	const moved = scrollElementIntoSafeZone(scrollParent, element) === "moved";
	if (!moved || prefersReducedMotion()) return false;
	return waitForScrollEnd(scrollParent);
}

/** Gives a required sidebar movement priority over navigation and cancels stale rapid-click requests. */
export function runAfterSidebarSelection(
	callback: () => void,
	waits: SidebarSelectionWait | readonly SidebarSelectionWait[],
): void {
	const request = ++latestSelectionRequest;
	const waitList = (Array.isArray(waits) ? waits : [waits]).flatMap((wait) => {
		if (wait === false) return [];
		return [wait === true ? waitForDelay() : wait];
	});
	if (waitList.length === 0) {
		callback();
		return;
	}

	void Promise.all(waitList).then(() => {
		if (request !== latestSelectionRequest) return;
		requestAnimationFrame(() => {
			window.setTimeout(() => {
				if (request === latestSelectionRequest) callback();
			}, 0);
		});
	});
}

/** Scrolls a newly expanded project row only when it falls outside the shared safety band. */
export function useExpandedProjectAutoScroll({
	expanded,
	projectRowRef,
	scrollParent,
}: ExpandedProjectAutoScrollOptions): void {
	const wasExpandedRef = useRef(expanded);

	useEffect(() => {
		if (!expanded) {
			wasExpandedRef.current = false;
			return;
		}
		if (wasExpandedRef.current || !scrollParent) return;
		wasExpandedRef.current = true;

		let firstFrame = 0;
		let secondFrame = 0;
		let settleTimer = 0;
		let cancelled = false;
		const ensureProjectVisible = () => {
			if (cancelled || !projectRowRef.current) return;
			scrollElementIntoSafeZone(scrollParent, projectRowRef.current);
		};

		firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(ensureProjectVisible);
		});
		settleTimer = window.setTimeout(ensureProjectVisible, LAYOUT_SETTLE_DELAY_MS);

		return () => {
			cancelled = true;
			cancelAnimationFrame(firstFrame);
			cancelAnimationFrame(secondFrame);
			window.clearTimeout(settleTimer);
		};
	}, [expanded, projectRowRef, scrollParent]);
}

/**
 * Keeps a newly selected session inside the middle safety band of its scroll viewport.
 * Tiny scroll ranges and corrections are intentionally ignored to avoid distracting micro-movements.
 */
export function useActiveSessionAutoScroll({
	activeIndex,
	activeKey,
	enabled = true,
	scrollParent,
	virtuosoRef,
}: ActiveSessionAutoScrollOptions): void {
	const handledActiveKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!activeKey) {
			handledActiveKeyRef.current = null;
			return;
		}
		if (!enabled || !scrollParent || activeIndex < 0 || handledActiveKeyRef.current === activeKey) return;
		handledActiveKeyRef.current = activeKey;

		let firstFrame = 0;
		let secondFrame = 0;
		let settleTimer = 0;
		let cancelled = false;

		const ensureVisible = () => {
			if (cancelled || !hasUsefulScrollRange(scrollParent)) return;
			if (scrollMountedActiveRow(scrollParent)) return;

			const viewportHeight = scrollParent.clientHeight;
			virtuosoRef.current?.scrollToIndex({
				index: activeIndex,
				align: "start",
				offset: -(viewportHeight * SAFE_ZONE_TOP_RATIO - VIRTUAL_SESSION_ROW_HEIGHT / 2),
				behavior: prefersReducedMotion() ? "auto" : "smooth",
			});
		};

		firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(ensureVisible);
		});
		settleTimer = window.setTimeout(ensureVisible, LAYOUT_SETTLE_DELAY_MS);

		return () => {
			cancelled = true;
			cancelAnimationFrame(firstFrame);
			cancelAnimationFrame(secondFrame);
			window.clearTimeout(settleTimer);
		};
	}, [activeIndex, activeKey, enabled, scrollParent, virtuosoRef]);
}
