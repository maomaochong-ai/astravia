/**
 * A reference to an image produced out-of-band by the host (e.g. an image
 * tool's result). The bytes are NOT carried inline — `url` is a host media
 * URL (Range-capable, usable directly as an `<img src>`).
 */
export interface PluginImageRef {
	id: string;
	url: string;
	mimeType?: string;
	/**
	 * The edit-lineage root id this image belongs to (base image + all its edits
	 * share one rootId). Lets the host dedup per-message previews — only the
	 * latest message producing a given rootId renders the version swiper.
	 */
	rootId?: string;
}
