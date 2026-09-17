import { get, writable } from "svelte/store";
import type { Writable } from "svelte/store";
import type { SubscriptionsRouter } from "/src/subscriptions-router";
import type { EditorWrapper } from "/wrapper/pkg/graphite_wasm_wrapper";

export type SlideshowStore = ReturnType<typeof createSlideshowStore>;

type SlideshowStoreState = {
	windowSlideshow: boolean;
	keyboardLocked: boolean;
	artboardIndex: number;
	artboardCount: number | undefined;
};
const initialState: SlideshowStoreState = {
	windowSlideshow: false,
	keyboardLocked: false,
	artboardIndex: 0,
	artboardCount: undefined,
};

let subscriptionsRouter: SubscriptionsRouter | undefined = undefined;
let editorWrapper: EditorWrapper | undefined = undefined;

// Store state persisted across HMR to maintain reactive subscriptions in the component tree
const store: Writable<SlideshowStoreState> = import.meta.hot?.data?.store || writable<SlideshowStoreState>(initialState);
if (import.meta.hot) import.meta.hot.data.store = store;
const { subscribe, update } = store;

function clampArtboardIndex(index: number, count: number | undefined) {
	if (count === undefined) return Math.max(index, 0);
	if (count <= 0) return 0;
	return Math.min(Math.max(index, 0), count - 1);
}

export function isSlideshowActive() {
	return get(store).windowSlideshow;
}

export function createSlideshowStore(subscriptions: SubscriptionsRouter, editor: EditorWrapper) {
	destroySlideshowStore();

	subscriptionsRouter = subscriptions;
	editorWrapper = editor;
	update((state) => {
		state.artboardIndex = Number.isSafeInteger(state.artboardIndex) ? state.artboardIndex : 0;
		state.artboardCount = Number.isSafeInteger(state.artboardCount) ? state.artboardCount : undefined;
		return state;
	});

	subscriptions.subscribeFrontendMessage("WindowSlideshow", () => {
		toggleSlideshow();
	});
	subscriptions.subscribeFrontendMessage("UpdateSlideshowArtboardCount", (data) => {
		update((state) => {
			state.artboardCount = data.artboardCount;
			state.artboardIndex = clampArtboardIndex(state.artboardIndex, state.artboardCount);
			return state;
		});
	});

	return { subscribe };
}

export function destroySlideshowStore() {
	const subscriptions = subscriptionsRouter;
	if (!subscriptions) return;

	subscriptions.unsubscribeFrontendMessage("WindowSlideshow");
	subscriptions.unsubscribeFrontendMessage("UpdateSlideshowArtboardCount");
	subscriptionsRouter = undefined;
	editorWrapper = undefined;
}

export function slideshowModeChanged() {
	update((state) => {
		if (document.fullscreenElement) return state;
		state.windowSlideshow = false;
		state.keyboardLocked = false;
		return state;
	});
}

export async function enterSlideshow() {
	await document.documentElement.requestFullscreen();
	update((state) => {
		state.windowSlideshow = true;
		return state;
	});
	editorWrapper?.requestSlideshowArtboardCount();

	const keyboardLockApiSupported = navigator.keyboard !== undefined && "lock" in navigator.keyboard;

	if (keyboardLockApiSupported && navigator.keyboard) {
		await navigator.keyboard.lock(["ControlLeft", "ControlRight"]);

		update((state) => {
			state.keyboardLocked = true;
			return state;
		});
	}
}

export async function exitSlideshow() {
	await document.exitFullscreen();
}

export async function toggleSlideshow() {
	const state = get(store);
	if (state.windowSlideshow) await exitSlideshow();
	else await enterSlideshow();
}

export function stepSlideshowArtboard(direction: -1 | 1) {
	update((state) => {
		state.artboardIndex = clampArtboardIndex(state.artboardIndex + direction, state.artboardCount);
		return state;
	});
	return get(store).artboardIndex;
}
