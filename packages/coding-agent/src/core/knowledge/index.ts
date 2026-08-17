/**
 * LLM Wiki 知识库核心模块。
 * 见 docs/prd-knowledge-base-llm-wiki.md。
 */

export {
	type BatchPlanOptions,
	planProcessingBatches,
} from "./batch-planner.js";
export {
	rebuildManifest,
	rebuildTagsIndex,
	type WikiPageRef,
} from "./cache.js";
export {
	type AddedChange,
	type ChangedChange,
	type DeletedChange,
	diffNeedsProcessing,
	diffRaws,
	isEmptyDiff,
	type MovedChange,
	type OrphanPlan,
	planOrphans,
	type RawsDiff,
} from "./differ.js";
export {
	type AttemptedFile,
	applyQuarantine,
	attemptedFiles,
	clearFailures,
	EMPTY_FAILURES,
	type FailureEntry,
	type FailuresRecord,
	KB_MAX_PROCESSING_ATTEMPTS,
	quarantinedPaths,
	reconcileFailures,
} from "./failures.js";
export {
	type ParsedWikiPage,
	parseWikiPage,
	serializeWikiPage,
	validateWikiFrontmatter,
	WikiFrontmatterError,
} from "./frontmatter.js";
export { buildIndexMap } from "./index-map.js";
export {
	finalizeRound,
	type PreparedRound,
	prepareRound,
	type RebuildResult,
	rebuildAllCaches,
	reconcileRoundFailures,
} from "./ingest.js";
export { buildProcessingPrompt, KB_PROCESSING_GUIDE } from "./processing-prompt.js";
export { type FilteredPage, listAvailableTags, queryByTags, type TagCount } from "./query.js";
export {
	deleteWikiPage,
	ensureKnowledgeDirs,
	failuresPath,
	generatePageId,
	hashContent,
	indexesDir,
	indexMapPath,
	knowledgeRoot,
	manifestPath,
	processingRecordsCwd,
	pruneEmptyWikiDirs,
	rawsDir,
	rawsExists,
	readFailures,
	readManifest,
	readTagsIndex,
	type ScannedWikiPage,
	scanRaws,
	scanWikiPages,
	tagsPath,
	type WikiScanResult,
	wikiDir,
	writeFailures,
	writeIndexMap,
	writeManifest,
	writeTagsIndex,
	writeWikiPage,
} from "./store.js";
export { filterByTags, type TaggedPage, type TagQuery } from "./tag-filter.js";
export * from "./types.js";
export {
	resolveUpsert,
	type UpsertDecision,
	type UpsertInput,
	type UpsertLookup,
} from "./upsert.js";
export {
	createKbWriteSession,
	type KbWriteSession,
	type WritePageRequest,
	type WritePageResult,
	writeKnowledgePage,
} from "./writer.js";
