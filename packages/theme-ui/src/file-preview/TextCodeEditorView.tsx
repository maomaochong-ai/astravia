import { EditorState } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef, type JSX } from "react";
import { textCodeEditorTheme } from "./text-code-editor-theme";
import {
	getTextEditorLanguageExtension,
	normalizeFileExtension,
} from "./text-editor-language";

export interface TextCodeEditorViewProps {
	documentKey: string;
	initialValue: string;
	extension: string;
	lineEnding: "lf" | "crlf";
	onChange: (content: string) => void;
	/**
	 * When false, the host keeps this editor mounted but hidden (e.g. preview mode).
	 * Becoming true again remeasures layout and restores focus without wiping undo history.
	 */
	active?: boolean;
	/**
	 * Optional controlled value: when the external content differs from the
	 * editor doc, the editor is updated via dispatch (undo history preserved,
	 * onChange not re-fired). Used e.g. by the database query panel to sync
	 * history replay / AI backfill into the editor.
	 */
	value?: string;
	/** Shown when the document is empty. */
	placeholder?: string;
}

export function TextCodeEditorView({
	documentKey,
	initialValue,
	extension,
	lineEnding,
	onChange,
	active = true,
	value,
	placeholder: placeholderText,
}: TextCodeEditorViewProps): JSX.Element {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const initialValueRef = useRef(initialValue);
	const onChangeRef = useRef(onChange);
	initialValueRef.current = initialValue;
	onChangeRef.current = onChange;
	const languageKey = normalizeFileExtension(extension);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const state = EditorState.create({
			doc: initialValueRef.current,
			extensions: [
				basicSetup,
				EditorState.lineSeparator.of(lineEnding === "crlf" ? "\r\n" : "\n"),
				getTextEditorLanguageExtension(languageKey),
				textCodeEditorTheme,
				placeholderText ? placeholder(placeholderText) : [],
				EditorView.updateListener.of((update) => {
					if (update.docChanged) onChangeRef.current(update.state.doc.toString());
				}),
			],
		});
		const view = new EditorView({ state, parent: host });
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [documentKey, languageKey, lineEnding]);

	// Controlled value sync: external programmatic changes (history replay, AI
	// backfill) are dispatched into the editor; typing does not loop because
	// onChange already kept the parent value equal to the doc.
	useEffect(() => {
		const view = viewRef.current;
		if (!view || value === undefined) return;
		const current = view.state.doc.toString();
		if (value === current) return;
		view.dispatch({
			changes: { from: 0, to: current.length, insert: value },
		});
	}, [value, documentKey]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view || !active) return;
		// Hidden→visible: geometry was 0 or stale; remeasure so scrollbars/cursor align.
		view.requestMeasure();
		view.focus();
	}, [active, documentKey, languageKey, lineEnding]);

	return <div ref={hostRef} className="min-h-0 h-full w-full flex-1 overflow-hidden bg-background" />;
}
