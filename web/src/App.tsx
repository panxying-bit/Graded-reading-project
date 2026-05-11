import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  analyzeSentencePattern,
  fetchLessonPlan,
  fetchLevels,
  fetchVocabCandidates,
  generateDraft,
  generateProofread,
  generateRefine,
  generateText,
  type Level3WordCountField,
  type LevelItem,
  type LessonPlan,
  type SentencePatternResponse,
  type VocabCandidateItem,
} from "./api/client";
import { DEFAULT_STRUCTURE, STRUCTURE_TYPES } from "./structureOptions";
import {
  DEFAULT_STRUCTURE_LEVEL2,
  STRUCTURE_TYPES_LEVEL2,
} from "./structureOptionsLevel2";
import {
  DEFAULT_STRUCTURE_LEVEL1,
  STRUCTURE_TYPES_LEVEL1,
} from "./structureOptionsLevel1";
import { DEFAULT_TENSE_FOCUS, TENSE_FOCUS_OPTIONS } from "./tenseOptions";
import { DEFAULT_GENRE_FOCUS, GENRE_FOCUS_OPTIONS } from "./genreOptions";
import {
  GENRE_FOCUS_OPTIONS_LEVEL4,
  DEFAULT_GENRE_FOCUS_LEVEL4,
} from "./genreOptionsLevel4";
import {
  TENSE_FOCUS_OPTIONS_LEVEL4,
  DEFAULT_TENSE_FOCUS_LEVEL4,
} from "./tenseOptionsLevel4";
import {
  findLessonPlanRow,
  getLevel1Band,
  getLevel1WordCountBounds,
  getLevel2Band,
  getLevel2WordCountBounds,
  getPagedBookBand,
  getPagedBookWordCountBounds,
  getVocabFinalMaxRows,
  isBookPipelineLevel,
  levelHasLessonPlan,
  isPagedBookLevel,
  type PagedBookLevelId,
} from "./bookPhase";
import {
  collectFinalVocabHeadwordsFromAllLessons,
  collectFinalVocabHeadwordsFromOtherLessons,
  getLesson,
  isUsableSentencePatternSnapshot,
  pagedBookDraftRefinedPatch,
  pagedBookDraftOnlyPatch,
  pagedBookRefinedOnlyPatch,
  pagedBookRefinedSnapshotPatch,
  readPagedBookStages,
  resolveLessonTextForExport,
  saveLesson,
  type SentencePatternSnapshot,
  type VocabFinalRow,
} from "./lessonLibrary";
import { LessonDownloadPanel } from "./LessonDownloadPanel";
import { LessonPanel } from "./LessonPanel";
import { PromptEditorPanel } from "./PromptEditorPanel";
import { ContentBriefIdeasBlock } from "./ContentBriefIdeasBlock";
import { BookDraftEditor } from "./BookDraftEditor";
import { ReadingOutput } from "./ReadingOutput";
import { SentencePatternBlock } from "./SentencePatternBlock";
import { VocabCandidateBlock } from "./VocabCandidateBlock";
import { VocabFinalTableBlock } from "./VocabFinalTableBlock";
import { BookIllustrationPrepPanel } from "./BookIllustrationPrepPanel";
import { BookIllustrationGeneratePanel } from "./BookIllustrationGeneratePanel";
import type { IllustrationPageDirection } from "./bookIllustration";
import {
  bookToPlainText,
  countWordsInModelOutput,
  tryParseBookOutput,
} from "./parseBookOutput";
import { filterVocabCandidatesByExcludedHeadwords } from "./vocabCandidateLocalFilter";
import {
  collectReadingTtsSegments,
  collectVocabTtsWords,
  prefetchTtsBatch,
} from "./ttsAudioCache";
import {
  APP_VERSION_SHORT,
  APP_VERSION_TAG,
} from "./appVersion";
import {
  WorkflowTabBar,
  WorkflowTabEmpty,
  type WorkflowTabId,
} from "./workflowTabs";

export function App() {
  const [levels, setLevels] = useState<LevelItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  /** Optional outline for generation (any language); persisted per lesson slot. */
  const [contentBrief, setContentBrief] = useState("");
  const [wordCount, setWordCount] = useState(30);
  const [fictionOrNonfiction, setFictionOrNonfiction] = useState<
    "fiction" | "nonfiction"
  >("fiction");
  const [structureType, setStructureType] = useState(DEFAULT_STRUCTURE);
  const [tenseFocus, setTenseFocus] = useState(DEFAULT_TENSE_FOCUS);
  const [genreFocus, setGenreFocus] = useState(DEFAULT_GENRE_FOCUS);
  const [out, setOut] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ cefr?: string; level?: string }>({});
  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [level3GenStats, setLevel3GenStats] =
    useState<Level3WordCountField | null>(null);
  const [lessonNum, setLessonNum] = useState(1);
  const [libVersion, setLibVersion] = useState(0);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  /** User is editing the final proofread text (stage 3). */
  const [outEditing, setOutEditing] = useState(false);
  const [outDraft, setOutDraft] = useState("");
  /** Level3 stage-1 book JSON (draft). */
  const [l3Draft, setL3Draft] = useState("");
  const [l3DraftEditing, setL3DraftEditing] = useState(false);
  const [l3DraftBuffer, setL3DraftBuffer] = useState("");
  /** Level3 stage-2 精修 JSON (before language proofread). */
  const [l3Refined, setL3Refined] = useState("");
  const [l3RefinedEditing, setL3RefinedEditing] = useState(false);
  const [l3RefinedBuffer, setL3RefinedBuffer] = useState("");
  /** Shown in 第一阶段 when a draft exists; problems & revision direction for (re)generate draft. */
  const [l3DraftNotes, setL3DraftNotes] = useState("");
  /** After 定稿: teachable pattern + example + variations (config/sentence-pattern-prompt.md). */
  const [sentencePattern, setSentencePattern] =
    useState<SentencePatternResponse | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternError, setPatternError] = useState<string | null>(null);
  /** Optional notes when re-running sentence-pattern (like 初稿修改说明). */
  const [patternNotes, setPatternNotes] = useState("");
  /** Optional: teacher already knows pattern — constrain LLM pick (L1–L4). */
  const [patternProvidedStructure, setPatternProvidedStructure] =
    useState("");
  /** Step-1 LLM vocabulary candidates (not persisted; step 2 = de-dup). */
  const [vocabCandidates, setVocabCandidates] = useState<
    VocabCandidateItem[] | null
  >(null);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabError, setVocabError] = useState<string | null>(null);
  const [vocabExcludedByMastery, setVocabExcludedByMastery] = useState<
    VocabCandidateItem[] | null
  >(null);
  const [vocabPriorMasteryNote, setVocabPriorMasteryNote] = useState<
    string | null
  >(null);
  const [vocabExcludedByOtherLessons, setVocabExcludedByOtherLessons] =
    useState<VocabCandidateItem[] | null>(null);
  const [vocabOtherLessonsNote, setVocabOtherLessonsNote] = useState<
    string | null
  >(null);
  /** Step 3: up to 4 final words, persisted in lesson record. */
  const [vocabFinal, setVocabFinal] = useState<VocabFinalRow[]>([]);
  const lessonRef = useRef(lessonNum);
  useEffect(() => {
    lessonRef.current = lessonNum;
  }, [lessonNum]);

  const lessonsPerLevel = levels.find((l) => l.id === level)?.lessonsPerLevel ?? 144;
  /** LocalStorage + UI slot (1..N); must match 当前第几课, not raw lessonNum when that exceeds N. */
  const lessonSlotRaw = Math.max(1, Math.min(lessonNum, lessonsPerLevel));
  const lessonSlot = Number.isFinite(lessonSlotRaw)
    ? Math.floor(lessonSlotRaw)
    : 1;

  /** In-memory per-page storyboard from Generate; Prep preview merges over saved lesson. */
  const [illustrationPageDirsLive, setIllustrationPageDirsLive] = useState<
    Record<number, IllustrationPageDirection>
  >({});
  /** Only one workflow region mounts at a time to cut React render cost. */
  const [workflowTab, setWorkflowTab] = useState<WorkflowTabId>("compose");

  useEffect(() => {
    setIllustrationPageDirsLive({});
  }, [level, lessonSlot]);

  const onIllustrationPageDirectionsLive = useCallback(
    (dirs: Record<number, IllustrationPageDirection>) => {
      // Non-urgent: avoid blocking scroll/clicks while syncing prep preview from generate panel.
      startTransition(() => {
        setIllustrationPageDirsLive(dirs);
      });
    },
    [],
  );

  // Prefetch reading lines after final text settles (debounced). lessonSlot in deps cancels a stale timer when switching lessons before `out` updates.
  useEffect(() => {
    const text = out?.trim();
    if (!text) {
      return;
    }
    if (
      level !== "level1" &&
      level !== "level2" &&
      level !== "level3" &&
      level !== "level4"
    ) {
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void prefetchTtsBatch(collectReadingTtsSegments(text), {
        signal: ac.signal,
      });
    }, 700);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [out, level, lessonSlot]);

  useEffect(() => {
    if (
      level !== "level1" &&
      level !== "level2" &&
      level !== "level3" &&
      level !== "level4"
    ) {
      return;
    }
    if (vocabFinal.length === 0) {
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void prefetchTtsBatch(collectVocabTtsWords(vocabFinal), {
        signal: ac.signal,
        concurrency: 3,
      });
    }, 900);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [vocabFinal, level, lessonSlot]);

  useEffect(() => {
    if (!level || !Number.isFinite(lessonsPerLevel) || lessonsPerLevel < 1) {
      return;
    }
    if (lessonNum > lessonsPerLevel) {
      setLessonNum(lessonsPerLevel);
    }
  }, [level, lessonNum, lessonsPerLevel]);

  const curriculumRow =
    levelHasLessonPlan(level) && lessonPlan
      ? findLessonPlanRow(lessonPlan.lessons, lessonSlot)
      : undefined;
  const curriculumTheme = curriculumRow?.theme;
  const curriculumLessonTitle = curriculumRow?.lessonTitle;
  /** True when this slot has a title in the level lesson JSON. */
  const hasOutlineLessonTitle = Boolean(
    levelHasLessonPlan(level) && curriculumLessonTitle?.trim(),
  );

  const l3phase = isPagedBookLevel(level)
    ? getPagedBookBand(level, lessonSlot)
    : null;
  const l3WordBounds = l3phase
    ? getPagedBookWordCountBounds(level, lessonSlot)
    : null;
  const l1phase = level === "level1" ? getLevel1Band(lessonSlot) : null;
  const l1WordBounds = l1phase
    ? getLevel1WordCountBounds(l1phase.targetWords)
    : null;
  const l2phase = level === "level2" ? getLevel2Band(lessonSlot) : null;
  const l2WordBounds = l2phase
    ? getLevel2WordCountBounds(lessonSlot)
    : null;

  const genreOptions =
    level === "level4" ? GENRE_FOCUS_OPTIONS_LEVEL4 : GENRE_FOCUS_OPTIONS;
  const tenseOptions =
    level === "level4" ? TENSE_FOCUS_OPTIONS_LEVEL4 : TENSE_FOCUS_OPTIONS;

  useEffect(() => {
    if (level === "level1") {
      setStructureType((s) =>
        STRUCTURE_TYPES_LEVEL1.some((o) => o.value === s)
          ? s
          : DEFAULT_STRUCTURE_LEVEL1,
      );
    } else if (level === "level2") {
      setStructureType((s) =>
        STRUCTURE_TYPES_LEVEL2.some((o) => o.value === s)
          ? s
          : DEFAULT_STRUCTURE_LEVEL2,
      );
    }
  }, [level]);

  useEffect(() => {
    void fetchLevels()
      .then((list) => {
        setLevels(list);
        if (list.length) {
          setLevel((current) => current || list[0]!.id);
        }
        setLoadError(null);
      })
      .catch((e: Error) => {
        setLoadError(e.message);
      });
  }, []);

  // Load per-level lesson curriculum (level1 / level3 / level4 JSON with 144 rows).
  useEffect(() => {
    if (!levelHasLessonPlan(level)) {
      setLessonPlan(null);
      return;
    }
    let cancelled = false;
    void fetchLessonPlan(level)
      .then((p) => {
        if (!cancelled) {
          setLessonPlan(p);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLessonPlan(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [level]);

  // Keep genre/tense selects valid when switching between L3 and L4 option lists.
  useEffect(() => {
    if (level === "level4") {
      setGenreFocus((g) =>
        GENRE_FOCUS_OPTIONS_LEVEL4.some((o) => o.value === g)
          ? g
          : DEFAULT_GENRE_FOCUS_LEVEL4,
      );
      setTenseFocus((t) =>
        TENSE_FOCUS_OPTIONS_LEVEL4.some((o) => o.value === t)
          ? t
          : DEFAULT_TENSE_FOCUS_LEVEL4,
      );
    } else if (level === "level3" || level === "level2") {
      setGenreFocus((g) =>
        GENRE_FOCUS_OPTIONS.some((o) => o.value === g)
          ? g
          : DEFAULT_GENRE_FOCUS,
      );
      setTenseFocus((t) =>
        TENSE_FOCUS_OPTIONS.some((o) => o.value === t)
          ? t
          : DEFAULT_TENSE_FOCUS,
      );
    }
  }, [level]);

  // Single pass on lesson / outline change: one getLesson + batched sets (was 3 effects × parse).
  useEffect(() => {
    if (!level || !levels.length) {
      return;
    }
    const n = lessonSlot;
    const rec = getLesson(level, n);
    const c = levels.find((l) => l.id === level);

    setMeta({ level, cefr: c?.cefr });
    setContentBrief(rec?.contentBrief ?? "");

    if (levelHasLessonPlan(level) && !lessonPlan?.lessons?.length) {
      const savedTopic = rec?.topic?.trim() ?? "";
      setTopic(savedTopic || "");
      const savedLt = rec?.lessonTitle?.trim() ?? "";
      setLessonTitle(savedLt || "");
      setFictionOrNonfiction(rec?.fictionOrNonfiction ?? "fiction");
    } else if (levelHasLessonPlan(level) && lessonPlan?.lessons?.length) {
      const row = findLessonPlanRow(lessonPlan.lessons, n);
      const savedTopic = rec?.topic?.trim() ?? "";
      const outlineTheme = row?.theme?.trim() ?? "";
      setTopic(savedTopic || outlineTheme || "");
      const savedLt = rec?.lessonTitle?.trim() ?? "";
      const outlineLt = row?.lessonTitle?.trim() ?? "";
      setLessonTitle(savedLt || outlineLt || "");
      setFictionOrNonfiction(
        rec?.fictionOrNonfiction ??
          row?.suggestedFictionOrNonfiction ??
          "fiction",
      );
    } else {
      setTopic(rec?.topic ? rec.topic : "");
      setLessonTitle("");
    }

    if (isBookPipelineLevel(level)) {
      if (level === "level1") {
        setWordCount(getLevel1Band(n).targetWords);
      } else if (level === "level2") {
        setWordCount(getLevel2Band(n).targetWords);
      } else {
        setWordCount(
          getPagedBookBand(level as PagedBookLevelId, n).targetWords,
        );
      }
    } else {
      const cfg = levels.find((l) => l.id === level);
      if (cfg && typeof cfg.defaultWordCount === "number") {
        setWordCount(cfg.defaultWordCount);
      }
    }

    setOut(rec?.text ?? null);
    setOutEditing(false);
    if (isBookPipelineLevel(level)) {
      const { draft, refined } = readPagedBookStages(level, rec);
      setL3Draft(draft);
      setL3DraftEditing(false);
      setL3Refined(refined);
      setL3RefinedEditing(false);
      setL3DraftNotes("");
    }
    setPatternError(null);
    setPatternNotes("");
    setPatternProvidedStructure("");
    setVocabCandidates(null);
    setVocabError(null);
    setVocabExcludedByMastery(null);
    setVocabPriorMasteryNote(null);
    setVocabExcludedByOtherLessons(null);
    setVocabOtherLessonsNote(null);
    const vrows = rec?.vocabFinalTable?.items;
    setVocabFinal(
      Array.isArray(vrows)
        ? vrows
            .filter((r) => r.word?.trim() && r.sentence?.trim())
            .slice(0, getVocabFinalMaxRows(level))
        : [],
    );

    const snap = rec?.sentencePatternSnapshot;
    if (snap && isUsableSentencePatternSnapshot(snap)) {
      setSentencePattern(snap as unknown as SentencePatternResponse);
    } else {
      setSentencePattern(null);
    }
  }, [level, lessonSlot, lessonPlan, levels, lessonsPerLevel]);

  // Re-hydrate 句型 after saves that bump libVersion only (slot sync is in the effect above).
  useEffect(() => {
    if (!level || !levels.length) {
      return;
    }
    const rec2 = getLesson(level, lessonSlot);
    const s = rec2?.sentencePatternSnapshot;
    if (s && isUsableSentencePatternSnapshot(s)) {
      setSentencePattern(s as unknown as SentencePatternResponse);
    } else {
      setSentencePattern(null);
    }
  }, [libVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- only when save bumps libVersion; level/slot from render

  useEffect(() => {
    if (!isBookPipelineLevel(level)) {
      setLevel3GenStats(null);
      setL3Draft("");
      setL3DraftEditing(false);
      setL3Refined("");
      setL3RefinedEditing(false);
      setL3DraftNotes("");
    }
  }, [level]);

  async function runGenerate() {
    if (!level) {
      return;
    }
    const slotLesson = lessonSlot;
    setGenError(null);
    setLevel3GenStats(null);
    setLoading(true);
    try {
      const body: {
        level: string;
        topic?: string;
        lessonTitle?: string;
        contentBrief?: string;
        wordCount?: number;
        lesson?: number;
        fictionOrNonfiction: "fiction" | "nonfiction";
        structureType: string;
        tenseFocus?: string;
        genreFocus?: string;
      } = { level, fictionOrNonfiction, structureType };
      if (topic.trim()) {
        body.topic = topic.trim();
      }
      if (isBookPipelineLevel(level) && lessonTitle.trim()) {
        body.lessonTitle = lessonTitle.trim();
      }
      if (contentBrief.trim()) {
        body.contentBrief = contentBrief.trim();
      }
      if (genreFocus.trim()) {
        body.genreFocus = genreFocus.trim();
      }
      if (tenseFocus.trim()) {
        body.tenseFocus = tenseFocus.trim();
      }
      if (isBookPipelineLevel(level)) {
        body.lesson = slotLesson;
        body.wordCount =
          level === "level1"
            ? getLevel1Band(slotLesson).targetWords
            : level === "level2"
              ? getLevel2Band(slotLesson).targetWords
              : getPagedBookBand(level as PagedBookLevelId, slotLesson)
                  .targetWords;
      } else if (wordCount > 0) {
        body.wordCount = wordCount;
      }
      const res = await generateText(body);
      const w = countWordsInModelOutput(res.text);
      saveLesson(level, slotLesson, {
        text: res.text,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle: isBookPipelineLevel(level)
          ? lessonTitle.trim() || undefined
          : undefined,
        contentBrief: contentBrief.trim() || undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        ...(isBookPipelineLevel(level)
          ? pagedBookDraftRefinedPatch(level, res.text, res.text)
          : {}),
        sentencePatternSnapshot: null,
        vocabFinalTable: null,
      });
      setLibVersion((v) => v + 1);
      if (slotLesson === lessonRef.current) {
        setOut(res.text);
        setOutEditing(false);
        setMeta({ cefr: res.cefr, level: res.level });
        setLevel3GenStats(res.level3WordCount ?? null);
        if (isBookPipelineLevel(level)) {
          setL3Draft(res.text);
          setL3Refined(res.text);
        }
        setSentencePattern(null);
        setVocabFinal([]);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runGenerateDraft() {
    if (!isBookPipelineLevel(level)) {
      return;
    }
    const slotLesson = lessonSlot;
    setGenError(null);
    setLoading(true);
    try {
      const body: Parameters<typeof generateText>[0] = {
        level,
        fictionOrNonfiction,
        structureType,
      };
      if (topic.trim()) {
        body.topic = topic.trim();
      }
      if (lessonTitle.trim()) {
        body.lessonTitle = lessonTitle.trim();
      }
      if (genreFocus.trim()) {
        body.genreFocus = genreFocus.trim();
      }
      if (tenseFocus.trim()) {
        body.tenseFocus = tenseFocus.trim();
      }
      if (contentBrief.trim()) {
        body.contentBrief = contentBrief.trim();
      }
      body.lesson = slotLesson;
      body.wordCount =
        level === "level1"
          ? getLevel1Band(slotLesson).targetWords
          : level === "level2"
            ? getLevel2Band(slotLesson).targetWords
            : getPagedBookBand(level as PagedBookLevelId, slotLesson)
                .targetWords;
      const note = l3DraftNotes.trim();
      if (note) {
        body.draftExtraInstructions = note;
      }
      const prevDraft = (l3DraftEditing ? l3DraftBuffer : l3Draft).trim();
      if (prevDraft) {
        body.previousDraftText = prevDraft;
      }
      const res = await generateDraft(body);
      const draftText = res.text;
      saveLesson(level, slotLesson, {
        text: "",
        wordCount: 0,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        contentBrief: contentBrief.trim() || undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        ...pagedBookDraftRefinedPatch(level, draftText, ""),
        sentencePatternSnapshot: null,
        vocabFinalTable: null,
      });
      setLibVersion((v) => v + 1);
      if (slotLesson === lessonRef.current) {
        setL3Draft(draftText);
        setL3DraftEditing(false);
        setL3Refined("");
        setOut(null);
        setLevel3GenStats(null);
        setSentencePattern(null);
        setVocabFinal([]);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runRefine() {
    if (!isBookPipelineLevel(level)) {
      return;
    }
    const rawDraft = (l3DraftEditing ? l3DraftBuffer : l3Draft).trim();
    if (!rawDraft) {
      setGenError("请先生成初稿或粘贴初稿 JSON，再精修。");
      return;
    }
    const slotLesson = lessonSlot;
    setGenError(null);
    setLevel3GenStats(null);
    setLoading(true);
    try {
      const res = await generateRefine({
        level,
        lesson: slotLesson,
        draftText: rawDraft,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        contentBrief: contentBrief.trim() || undefined,
        fictionOrNonfiction,
        ...(level === "level1" || level === "level2"
          ? { structureType: structureType.trim() || undefined }
          : {}),
      });
      const w = countWordsInModelOutput(res.text);
      saveLesson(level, slotLesson, {
        text: res.text,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        contentBrief: contentBrief.trim() || undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        ...pagedBookDraftRefinedPatch(level, rawDraft, res.text),
        sentencePatternSnapshot: null,
        vocabFinalTable: null,
      });
      setLibVersion((v) => v + 1);
      if (slotLesson === lessonRef.current) {
        setOut(res.text);
        setOutEditing(false);
        setL3Refined(res.text);
        setL3RefinedEditing(false);
        setL3Draft(rawDraft);
        setL3DraftEditing(false);
        setMeta({ cefr: res.cefr, level: res.level });
        setLevel3GenStats(res.level3WordCount ?? null);
        setSentencePattern(null);
        setVocabFinal([]);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runProofread() {
    if (!isBookPipelineLevel(level)) {
      return;
    }
    const bookText = (l3RefinedEditing ? l3RefinedBuffer : l3Refined).trim();
    if (!bookText) {
      setGenError("请先完成精修（或粘贴精修 JSON），再语言校核定稿。");
      return;
    }
    const slotLesson = lessonSlot;
    setGenError(null);
    setLevel3GenStats(null);
    setLoading(true);
    try {
      const res = await generateProofread({
        level,
        bookText,
        lesson: slotLesson,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        contentBrief: contentBrief.trim() || undefined,
      });
      const w = countWordsInModelOutput(res.text);
      saveLesson(level, slotLesson, {
        text: res.text,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        contentBrief: contentBrief.trim() || undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        ...pagedBookRefinedSnapshotPatch(level, bookText),
        sentencePatternSnapshot: null,
        vocabFinalTable: null,
      });
      setLibVersion((v) => v + 1);
      if (slotLesson === lessonRef.current) {
        setOut(res.text);
        setOutEditing(false);
        setL3Refined(bookText);
        setL3RefinedEditing(false);
        setMeta({ cefr: res.cefr, level: res.level });
        setSentencePattern(null);
        setVocabFinal([]);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runSentencePattern() {
    if (
      level !== "level1" &&
      level !== "level2" &&
      level !== "level3" &&
      level !== "level4"
    ) {
      return;
    }
    // Use lesson storage as fallback when `out` is stale/empty; level3 also falls back
    // from empty `text` to 精修/初稿 (same as export) — see resolveLessonTextForExport.
    const recSp = getLesson(level, lessonSlot);
    const fromStore = recSp
      ? resolveLessonTextForExport(level, recSp)
      : null;
    // Prefer the longer of in-memory vs persisted (整书定稿 is usually longer; stale `out` can be short)
    const oTrim = (out?.trim() || "");
    const sTrim = (fromStore?.trim() || "");
    const t = (oTrim.length >= sTrim.length ? oTrim : sTrim).trim() || oTrim || sTrim;
    if (!t) {
      setPatternError(
        "定稿正文为空，无法分析句型。请确认本课有定稿内容后再点「按说明重新分析」或「重新分析句型」。",
      );
      return;
    }
    setPatternError(null);
    setPatternLoading(true);
    try {
      const note = patternNotes.trim();
      const provided = patternProvidedStructure.trim();
      const r = await analyzeSentencePattern({
        level,
        text: t,
        ...(note ? { patternExtraInstructions: note } : {}),
        ...(provided ? { providedPatternStructure: provided } : {}),
      });
      setSentencePattern(r);
      const w = countWordsInModelOutput(t);
      const snap: SentencePatternSnapshot = {
        level: r.level,
        cefr: r.cefr,
        pattern: r.pattern,
        exampleSentence: r.exampleSentence,
        exampleMatchedInText: r.exampleMatchedInText,
        whyPattern: r.whyPattern,
        variations: r.variations,
        teachingFocus: r.teachingFocus,
      };
      const saved = saveLesson(level, lessonSlot, {
        text: t,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle: isBookPipelineLevel(level)
          ? lessonTitle.trim() || undefined
          : undefined,
        contentBrief: contentBrief.trim() || undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        sentencePatternSnapshot: snap,
      });
      if (!saved) {
        setPatternError(
          "句型已显示在上方，但未能写入本机（如存储已满或隐私模式禁用了本地存储），刷新后可能看不到。可尝试本机有空间、允许 localhost 存数据后，再点一次「按说明重新分析」或「重新分析句型」。",
        );
        return;
      }
      setLibVersion((v) => v + 1);
    } catch (e) {
      setPatternError((e as Error).message);
      setSentencePattern(null);
    } finally {
      setPatternLoading(false);
    }
  }

  async function runVocabCandidates() {
    if (
      level !== "level1" &&
      level !== "level2" &&
      level !== "level3" &&
      level !== "level4"
    ) {
      return;
    }
    const recSp = getLesson(level, lessonSlot);
    const fromStore = recSp
      ? resolveLessonTextForExport(level, recSp)
      : null;
    const oTrim = out?.trim() || "";
    const sTrim = fromStore?.trim() || "";
    const t = (oTrim.length >= sTrim.length ? oTrim : sTrim).trim() || oTrim || sTrim;
    if (!t) {
      setVocabError(
        "定稿正文为空，无法筛选词汇。请确认本课有定稿内容后再点「筛选候选词」。",
      );
      return;
    }
    setVocabError(null);
    setVocabLoading(true);
    try {
      let priorHeadwords = collectFinalVocabHeadwordsFromOtherLessons(
        level,
        lessonSlot,
        lessonsPerLevel,
      );
      if (level === "level4") {
        const l3Slots =
          levels.find((x) => x.id === "level3")?.lessonsPerLevel ??
          lessonsPerLevel;
        const l3Headwords = collectFinalVocabHeadwordsFromAllLessons(
          "level3",
          l3Slots,
        );
        priorHeadwords = [
          ...new Set([...priorHeadwords, ...l3Headwords]),
        ].sort((a, b) => a.localeCompare(b, "en"));
      }
      const r = await fetchVocabCandidates({
        level,
        text: t,
        excludeHeadwords: priorHeadwords,
      });
      const { kept, removed } = filterVocabCandidatesByExcludedHeadwords(
        r.candidates,
        priorHeadwords,
      );
      setVocabCandidates(kept);
      setVocabExcludedByMastery(r.excludedByPriorMastery ?? null);
      setVocabPriorMasteryNote(r.priorMasteryFilterNote ?? null);
      setVocabExcludedByOtherLessons(removed.length > 0 ? removed : null);
      setVocabOtherLessonsNote(
        removed.length > 0
          ? level === "level4"
            ? `已剔除 ${removed.length} 个与 Level 4 其他课或 Level 3 已定表词重名的候选项；当前保留 ${kept.length} 个。`
            : `已剔除 ${removed.length} 个与本级别其他课已保存「定表词」重名的候选项；当前保留 ${kept.length} 个。`
          : null,
      );
    } catch (e) {
      setVocabError((e as Error).message);
      setVocabCandidates(null);
      setVocabExcludedByMastery(null);
      setVocabPriorMasteryNote(null);
      setVocabExcludedByOtherLessons(null);
      setVocabOtherLessonsNote(null);
    } finally {
      setVocabLoading(false);
    }
  }

  function persistVocabFinalTable(rows: VocabFinalRow[]) {
    if (!level) {
      return;
    }
    const rec = getLesson(level, lessonSlot);
    if (!rec) {
      return;
    }
    const t = (
      out?.trim() ||
      resolveLessonTextForExport(level, rec) ||
      rec.text ||
      ""
    ).trim();
    if (!t) {
      return;
    }
    const w = countWordsInModelOutput(t);
    const items = rows.slice(0, getVocabFinalMaxRows(level));
    const ok = saveLesson(level, lessonSlot, {
      text: t,
      wordCount: w,
      topic: topic.trim() || undefined,
      lessonTitle: isBookPipelineLevel(level)
        ? lessonTitle.trim() || undefined
        : undefined,
      contentBrief: contentBrief.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      vocabFinalTable: { items },
    });
    if (ok) {
      setLibVersion((v) => v + 1);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBookPipelineLevel(level)) {
      return;
    }
    void runGenerate();
  }

  function copy() {
    const raw = outEditing ? outDraft : out;
    if (!raw) {
      return;
    }
    const book = tryParseBookOutput(raw);
    const payload = book ? bookToPlainText(book) : raw;
    void navigator.clipboard.writeText(payload);
  }

  function copyL3Draft() {
    const raw = l3DraftEditing ? l3DraftBuffer : l3Draft;
    if (!raw) {
      return;
    }
    const book = tryParseBookOutput(raw);
    const payload = book ? bookToPlainText(book) : raw;
    void navigator.clipboard.writeText(payload);
  }

  function copyL3Refined() {
    const raw = l3RefinedEditing ? l3RefinedBuffer : l3Refined;
    if (!raw) {
      return;
    }
    const book = tryParseBookOutput(raw);
    const payload = book ? bookToPlainText(book) : raw;
    void navigator.clipboard.writeText(payload);
  }

  function startOutEdit() {
    if (out == null) {
      return;
    }
    setOutDraft(out);
    setOutEditing(true);
  }

  function confirmOutEdit() {
    if (!level) {
      return;
    }
    const t = outDraft;
    const w = countWordsInModelOutput(t);
    saveLesson(level, lessonSlot, {
      text: t,
      wordCount: w,
      topic: topic.trim() || undefined,
      lessonTitle: isBookPipelineLevel(level)
        ? lessonTitle.trim() || undefined
        : undefined,
      contentBrief: contentBrief.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      sentencePatternSnapshot: null,
      vocabFinalTable: null,
    });
    setOut(t);
    setLibVersion((v) => v + 1);
    setOutEditing(false);
    setSentencePattern(null);
    setVocabFinal([]);
  }

  function cancelOutEdit() {
    setOutEditing(false);
    if (out != null) {
      setOutDraft(out);
    }
  }

  const outForWordCount = outEditing ? outDraft : out ?? "";
  const l3DraftForWordCount = l3DraftEditing ? l3DraftBuffer : l3Draft;
  const l3RefinedForWordCount = l3RefinedEditing
    ? l3RefinedBuffer
    : l3Refined;
  const refinedMatchesOut =
    out != null && out === l3Refined && l3Refined.length > 0;

  function trySetLessonNum(n: number) {
    if (outEditing || l3DraftEditing || l3RefinedEditing) {
      if (
        typeof window !== "undefined" &&
        !window.confirm("当前有未确认保存的编辑，确定放弃并切换课次吗？")
      ) {
        return;
      }
      setOutEditing(false);
      setL3DraftEditing(false);
      setL3RefinedEditing(false);
    }
    setLessonNum(n);
  }

  function startL3DraftEdit() {
    setL3DraftBuffer(l3Draft);
    setL3DraftEditing(true);
  }

  function confirmL3DraftEdit() {
    if (!level) {
      return;
    }
    const t = l3DraftBuffer;
    setL3Draft(t);
    saveLesson(level, lessonSlot, {
      text: out ?? "",
      wordCount: countWordsInModelOutput(out ?? ""),
      topic: topic.trim() || undefined,
      lessonTitle: lessonTitle.trim() || undefined,
      contentBrief: contentBrief.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      ...pagedBookDraftOnlyPatch(level, t),
    });
    setLibVersion((v) => v + 1);
    setL3DraftEditing(false);
  }

  function cancelL3DraftEdit() {
    setL3DraftEditing(false);
    setL3DraftBuffer(l3Draft);
  }

  function startL3RefinedEdit() {
    if (!l3Refined.trim()) {
      return;
    }
    setL3RefinedBuffer(l3Refined);
    setL3RefinedEditing(true);
  }

  function confirmL3RefinedEdit() {
    if (!level) {
      return;
    }
    const t = l3RefinedBuffer;
    const prevRefined = l3Refined;
    setL3Refined(t);
    const syncFinal = out != null && out === prevRefined;
    const nextText = syncFinal
      ? t
      : out != null && out.length > 0
        ? out
        : t;
    const w = countWordsInModelOutput(nextText);
    saveLesson(level, lessonSlot, {
      text: nextText,
      wordCount: w,
      topic: topic.trim() || undefined,
      lessonTitle: lessonTitle.trim() || undefined,
      contentBrief: contentBrief.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      ...pagedBookRefinedOnlyPatch(level, t),
      ...(syncFinal
        ? { sentencePatternSnapshot: null as const, vocabFinalTable: null as const }
        : {}),
    });
    if (syncFinal) {
      setOut(t);
    }
    setLibVersion((v) => v + 1);
    setL3RefinedEditing(false);
    if (syncFinal) {
      setSentencePattern(null);
      setVocabFinal([]);
    }
  }

  function cancelL3RefinedEdit() {
    setL3RefinedEditing(false);
    setL3RefinedBuffer(l3Refined);
  }

  function useDraftInsteadOfRefined() {
    if (!isBookPipelineLevel(level)) {
      return;
    }
    const draft = (l3DraftEditing ? l3DraftBuffer : l3Draft).trim();
    if (!draft) {
      setGenError("当前没有可用初稿，无法取消精修。");
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm("将放弃当前精修结果，改用初稿作为后续稿件。是否继续？")
    ) {
      return;
    }
    const prevRefined = l3Refined;
    const syncFinal = out == null || out === prevRefined;
    const nextFinal = syncFinal ? draft : out;
    saveLesson(level, lessonSlot, {
      text: nextFinal ?? "",
      wordCount: countWordsInModelOutput(nextFinal ?? ""),
      topic: topic.trim() || undefined,
      lessonTitle: lessonTitle.trim() || undefined,
      contentBrief: contentBrief.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      ...pagedBookDraftRefinedPatch(level, draft, draft),
      ...(syncFinal
        ? { sentencePatternSnapshot: null as const, vocabFinalTable: null as const }
        : {}),
    });
    setL3Refined(draft);
    setL3RefinedEditing(false);
    if (syncFinal) {
      setOut(draft);
      setOutEditing(false);
    }
    setLibVersion((v) => v + 1);
    if (syncFinal) {
      setSentencePattern(null);
      setVocabFinal([]);
    }
  }

  const illustrateReady =
    Boolean(level) && isBookPipelineLevel(level) && Boolean(out) && !outEditing;

  const languageLevelIds =
    level === "level1" ||
    level === "level2" ||
    level === "level3" ||
    level === "level4";

  const languageReady =
    Boolean(level) && languageLevelIds && Boolean(out) && !outEditing;

  return (
    <div className="app">
      <header className="head">
        <h1>Graded reading</h1>
        <p className="app-release-tagline" lang="zh-CN">
          <span className="app-release-ver">v{APP_VERSION_SHORT}</span>
          <span className="app-release-sep" aria-hidden>
            {" · "}
          </span>
          <span className="app-release-label">{APP_VERSION_TAG}</span>
        </p>
        <p>
          每个阅读级别有固定课文槽位（与课程一致，例如 1–144
          课），生成结果会保存到本机当前所选课次；在下方格子里可总览与切换已保存的课文。
        </p>
      </header>

      {levels.length > 0 && (
        <PromptEditorPanel levelIds={levels.map((l) => l.id)} />
      )}

      {loadError && (
        <p className="err" role="alert">
          无法加载级别列表，请确认后端已启动且地址正确：{loadError}
        </p>
      )}

      {!!level && levels.length > 0 && (
        <Fragment key={level}>
          <LessonPanel
            levelId={level}
            lessonsPerLevel={lessonsPerLevel}
            currentLesson={Math.min(lessonNum, lessonsPerLevel)}
            onSelectLesson={trySetLessonNum}
            version={libVersion}
            curriculumTheme={curriculumTheme ?? null}
            curriculumLessonTitle={curriculumLessonTitle ?? null}
          />
          <LessonDownloadPanel
            levelId={level}
            levelOrder={Math.max(
              1,
              levels.findIndex((l) => l.id === level) + 1,
            )}
            levelName={levels.find((l) => l.id === level)?.name ?? level}
            lessonsPerLevel={lessonsPerLevel}
            version={libVersion}
            themeForLesson={(n) => {
              if (!levelHasLessonPlan(level) || !lessonPlan) {
                return undefined;
              }
              return findLessonPlanRow(lessonPlan.lessons, n)?.theme;
            }}
            planLessonTitleForLesson={(n) => {
              if (!levelHasLessonPlan(level) || !lessonPlan) {
                return undefined;
              }
              return findLessonPlanRow(lessonPlan.lessons, n)?.lessonTitle;
            }}
          />
        </Fragment>
      )}

      {levels.length > 0 && (
        <WorkflowTabBar active={workflowTab} onChange={setWorkflowTab} />
      )}

      {workflowTab === "compose" && (
        <>
      <form className="form" onSubmit={onSubmit}>
        <label className="row">
          <span>阅读级别</span>
          <select
            value={level}
            onChange={(e) => {
              const v = e.target.value;
              if (outEditing || l3DraftEditing || l3RefinedEditing) {
                if (
                  typeof window !== "undefined" &&
                  !window.confirm("当前有未确认保存的编辑，确定放弃并切换级别吗？")
                ) {
                  return;
                }
                setOutEditing(false);
                setL3DraftEditing(false);
                setL3RefinedEditing(false);
              }
              setLevel(v);
              setLessonNum(1);
              setWorkflowTab("compose");
              if (!isBookPipelineLevel(v)) {
                setTopic("");
                setLessonTitle("");
              }
            }}
            required
            disabled={!levels.length}
          >
            {levels.length === 0 && <option value="">加载中…</option>}
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.cefr}
              </option>
            ))}
          </select>
        </label>

        <label className="row">
          <span>
            主题
            {levelHasLessonPlan(level) && lessonPlan
              ? "（课纲自动同步，可改）"
              : "（选填）"}
          </span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              levelHasLessonPlan(level) && lessonPlan
                ? "与当前课次课纲主题一致，可直接生成"
                : "e.g. A day at the park with my friend"
            }
            autoComplete="off"
          />
        </label>

        {!isBookPipelineLevel(level) && (
          <ContentBriefIdeasBlock
            value={contentBrief}
            onChange={setContentBrief}
            disabled={loading || !levels.length}
            context={{
              level,
              topic,
              lessonTitle: curriculumLessonTitle?.trim() ?? "",
              lesson: lessonSlot,
              fictionOrNonfiction,
              structureType,
              genreFocus,
              tenseFocus,
            }}
          />
        )}

        {isBookPipelineLevel(level) && (
          <label className="row">
            <span>课文标题 (Lesson title)</span>
            <input
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
              title={
                levelHasLessonPlan(level) && lessonPlan?.lessons?.length
                  ? hasOutlineLessonTitle
                    ? "表内给定的课次已预填，可改"
                    : level === "level1"
                      ? "本课无课纲标题，可自填或留空"
                      : level === "level2"
                        ? "本课无课纲预填（中段或非课纲槽），可自填或留空"
                        : "本课不在表内 48 条课纲中，可自填或留空"
                  : level === "level1"
                    ? "可选；可与输出 JSON 的 title 字段对应（课纲加载后将自动同步）"
                    : "课纲加载中，亦可手填"
              }
              placeholder={
                levelHasLessonPlan(level) && lessonPlan?.lessons?.length
                  ? hasOutlineLessonTitle
                    ? "与课纲一致，可改"
                    : level === "level1"
                      ? "本课无课纲标题"
                      : level === "level2"
                        ? "本课无课纲标题（中段或非课纲槽）"
                        : "本课无课纲标题，可自填或留空"
                  : level === "level1"
                    ? "可选书名 / lesson title"
                    : "课纲加载中…"
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        {isBookPipelineLevel(level) && (
          <ContentBriefIdeasBlock
            value={contentBrief}
            onChange={setContentBrief}
            disabled={loading || !levels.length}
            context={{
              level,
              topic,
              lessonTitle,
              lesson: lessonSlot,
              fictionOrNonfiction,
              structureType,
              genreFocus,
              tenseFocus,
            }}
          />
        )}

        {levelHasLessonPlan(level) && lessonPlan && (
          <p className="form-slot-hint" role="note">
            {level === "level1" ? (
              <>
                一级：三段（<strong>1–48</strong> / <strong>49–96</strong> /{" "}
                <strong>97–144</strong>
                ）各含 <strong>24</strong>{" "}
                个大主题；每主题占连续两课（两个短语书槽位），全级别{" "}
                <strong>144</strong> 槽位对应 <strong>72</strong>{" "}
                个「主题×阶段」书位；主题与课文标题已按课次预填。
              </>
            ) : level === "level2" ? (
              <>
                二级：<strong>第 1–34</strong> 课（第一段）与 <strong>第 97–130</strong>{" "}
                课（第三段）含课纲主题与课文标题：<strong>17</strong> 个大主题各{" "}
                <strong>1</strong> 本 fiction + <strong>1</strong> 本 nonfiction，两段合计{" "}
                <strong>68</strong> 本书位；<strong>第 35–48</strong>、
                <strong>49–96</strong>、<strong>131–144</strong>{" "}
                课无课纲预填，体裁与主题请按需自填。
              </>
            ) : level === "level4" ? (
              <>
                第 <strong>1–8</strong>、<strong>49–56</strong>、
                <strong>97–104</strong>{" "}
                课含课纲中的主题与课文标题（每单元 fiction→nonfiction 两课）；其余课次不预填，需要时请自填。
              </>
            ) : (
              <>
                第 <strong>1–16</strong>、<strong>49–64</strong>、
                <strong>97–112</strong>{" "}
                课含表格中的主题与课文标题，已预填；其余课次不预填，需要时请自填。
              </>
            )}
          </p>
        )}

        {level !== "level1" && (
          <>
            <label className="row">
              <span>虚构 / 非虚构</span>
              <select
                value={fictionOrNonfiction}
                onChange={(e) =>
                  setFictionOrNonfiction(
                    e.target.value === "nonfiction" ? "nonfiction" : "fiction",
                  )
                }
                disabled={!levels.length}
              >
                <option value="fiction">虚构 (fiction)</option>
                <option value="nonfiction">非虚构 (nonfiction)</option>
              </select>
            </label>

            <label className="row">
              <span>体裁 / 具体形式（选填）</span>
              <select
                value={genreFocus}
                onChange={(e) => setGenreFocus(e.target.value)}
                disabled={!levels.length}
                title="不选则只按上项虚构/非虚构；可选童话、寓言等，Level2/3 可选用"
              >
                {genreOptions.map((o) => (
                  <option key={o.value || "g-none"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="row">
          <span>结构类型</span>
          <select
            value={structureType}
            onChange={(e) => setStructureType(e.target.value)}
            disabled={!levels.length}
          >
            {(level === "level1"
              ? STRUCTURE_TYPES_LEVEL1
              : level === "level2"
                ? STRUCTURE_TYPES_LEVEL2
                : STRUCTURE_TYPES
            ).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {level !== "level1" && (
          <label className="row">
            <span>时态重点（选填）</span>
            <select
              value={tenseFocus}
              onChange={(e) => setTenseFocus(e.target.value)}
              disabled={!levels.length}
              title="不选则不限定；若选，生成时会突出该时态/用法"
            >
              {tenseOptions.map((o) => (
                <option key={o.value || "none"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="row">
          <span>
            {l1phase
              ? "本段目标词数（只读，随课次三档 12/18/24）"
              : l2phase
                ? "本段目标词数（只读，Level 2 三档短文）"
                : l3phase
                  ? level === "level4"
                    ? "本段目标词数（只读，随课次三档 90/100/110）"
                    : "本段目标词数（只读，随课次三档 70/80/90）"
                  : "约词数"}
          </span>
          <input
            type="number"
            min={1}
            max={10000}
            value={
              l1phase
                ? l1phase.targetWords
                : l2phase
                  ? l2phase.targetWords
                  : l3phase
                    ? l3phase.targetWords
                    : wordCount
            }
            readOnly={
              l1phase != null || l2phase != null || l3phase != null
            }
            title={
              l1phase && l1WordBounds
                ? `Level 1：固定 6 页 JSON；全书总词目标约 ${l1WordBounds.target}（带 ${l1WordBounds.min}–${l1WordBounds.max}）；每页短语 ${l1phase.minPhraseWords}–${l1phase.maxPhraseWords} 词。`
                : l2phase && l2WordBounds
                  ? `Level 2：${l2phase.pageCountMin}–${l2phase.pageCountMax} 页 JSON；全书约 ${l2WordBounds.min}–${l2WordBounds.max} 词（目标约 ${l2WordBounds.target}）；单句约 ${l2phase.minWordsPerSentence}–${l2phase.maxWordsPerSentence} 词。`
                  : l3phase && l3WordBounds
                    ? level === "level4"
                      ? `Level4：${l3phase.pageCountMin}–${l3phase.pageCountMax} 页 JSON 绘本。本段目标约 ${l3WordBounds.target} 词，词数带约 ${l3WordBounds.min}–${l3WordBounds.max} 词；三档为前 48 课 90、中 48 课 100、后 48 课 110。`
                      : `Level3：${l3phase.pageCountMin}–${l3phase.pageCountMax} 页 JSON 绘本。本段目标约 ${l3WordBounds.target} 词，词数带约 ${l3WordBounds.min}–${l3WordBounds.max} 词；三档为前 48 课 70、中 48 课 80、后 48 课 90。`
                    : undefined
            }
            onChange={(e) => setWordCount(Number(e.target.value) || 0)}
          />
        </label>
        {l1phase && l1WordBounds && (
          <p className="form-slot-hint" role="note">
            Level 1 阶段课 <strong>{l1phase.phaseRange}</strong>：须输出 <strong>一个</strong>{" "}
            JSON 绘本，固定 <strong>6 页</strong>；每页 <strong>一句</strong>短语{" "}
            <strong>
              {l1phase.minPhraseWords}–{l1phase.maxPhraseWords}
            </strong>{" "}
            个英文词；全书总词数目标约 <strong>{l1WordBounds.target}</strong>，后端按{" "}
            <strong>
              {l1WordBounds.min}–{l1WordBounds.max}
            </strong>{" "}
            控制。三档：第 1–48 课约 12 词、49–96 约 18 词、97–144 约 24 词。须选定结构类型（labeling /
            pattern），无虚构/非虚构区分。
          </p>
        )}
        {l2phase && l2WordBounds && (
          <p className="form-slot-hint" role="note">
            Level 2 阶段课 <strong>{l2phase.phaseRange}</strong>（CEFR A1，6–7
            岁）：输出 <strong>一个</strong> JSON，<strong>
              {l2phase.pageCountMin}–{l2phase.pageCountMax} 页
            </strong>
            ；全书英文词约{" "}
            <strong>
              {l2WordBounds.min}–{l2WordBounds.max}
            </strong>{" "}
            （目标约 <strong>{l2WordBounds.target}</strong>
            ）；每句约 {l2phase.minWordsPerSentence}–{l2phase.maxWordsPerSentence}{" "}
            词。须选结构类型（pattern / concept / question_answer /
            action_sequence），并区分虚构/非虚构；参考段按课次与体裁自动切换（与教研参考表一致）。
          </p>
        )}
        {l3phase && l3WordBounds && (
          <p className="form-slot-hint" role="note">
            阶段课 <strong>{l3phase.phaseRange}</strong>：须输出 <strong>一个</strong>{" "}
            JSON，含 <strong>
              {l3phase.pageCountMin}–{l3phase.pageCountMax} 页
            </strong>
            （由模型在范围内选 6/7/8 页，每页 1–2 句英文，按意群拆分）；全书总词数目标约{" "}
            <strong>{l3WordBounds.target}</strong> 个英文词，后端会按{" "}
            <strong>
              {l3WordBounds.min}–{l3WordBounds.max}
            </strong>{" "}
            这一词数带控制，超出时常自动多轮压缩/补足。单句习惯约             {l3phase.minWordsPerSentence}–
            {l3phase.maxWordsPerSentence} 词。三档总目标：
            {level === "level4"
              ? "第 1–48 课约 90 词、49–96 约 100 词、97–144 约 110 词"
              : "第 1–48 课约 70 词、49–96 约 80 词、97–144 约 90 词"}
            。参考范文仅作语气与课堂用语参考，版式以本 JSON 为准。
          </p>
        )}

        {isBookPipelineLevel(level) ? (
          <>
            <p className="form-slot-hint" role="status">
              <strong>三阶段（推荐）：</strong>
              ①「生成初稿」可读故事与参考；②「精修」由模型控页数/词数；精修可编辑后
              ③「语言校核」仅做拼写/语法/标点，输出定稿。② 与 ③
              分别基于当前初稿与精修内容。初稿生成后，在下方「第一阶段」里可填写
              初稿修改说明再点「重新生成初稿」。
            </p>
            <div className="l3-gen-actions">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void runGenerateDraft();
                }}
                disabled={
                  loading ||
                  !level ||
                  outEditing ||
                  l3DraftEditing ||
                  l3RefinedEditing
                }
                title={
                  outEditing || l3DraftEditing || l3RefinedEditing
                    ? "请先结束下方在线编辑"
                    : "阶段一：故事与参考"
                }
              >
                {loading ? "请求中…" : "① 生成初稿"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void runRefine();
                }}
                disabled={
                  loading ||
                  !level ||
                  outEditing ||
                  l3DraftEditing ||
                  l3RefinedEditing ||
                  !(l3DraftEditing ? l3DraftBuffer : l3Draft).trim()
                }
                title="阶段二：在初稿上精修页数与词数"
              >
                {loading ? "请求中…" : "② 精修"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void runProofread();
                }}
                disabled={
                  loading ||
                  !level ||
                  outEditing ||
                  l3DraftEditing ||
                  l3RefinedEditing ||
                  !(
                    l3RefinedEditing ? l3RefinedBuffer : l3Refined
                  ).trim()
                }
                title="阶段三：在精修上仅做语言校对，不改编情节与页数"
              >
                {loading ? "请求中…" : "③ 语言校核定稿"}
              </button>
              <button
                className="btn sec"
                type="button"
                onClick={() => {
                  void runGenerate();
                }}
                disabled={
                  loading ||
                  !level ||
                  outEditing ||
                  l3DraftEditing ||
                  l3RefinedEditing
                }
                title="旧版：单次请求内同时写故事并控字数（质量可能弱于三阶段）"
              >
                一次性生成（旧）
              </button>
            </div>
            {(outEditing || l3DraftEditing || l3RefinedEditing) && (
              <p className="form-slot-hint" role="status">
                正在在线编辑，请先「确认保存」或「取消」再点生成 / 精修 / 校核。
              </p>
            )}
          </>
        ) : (
          <>
            <p className="form-slot-hint" role="status">
              将生成并保存到<strong> 第 {Math.min(lessonNum, lessonsPerLevel)} 课</strong>（会覆盖本课已保存内容）。
            </p>
            <button
              className="btn"
              type="submit"
              disabled={loading || !level || outEditing}
              title={outEditing ? "请先对下方课文「确认保存」或「取消」" : undefined}
            >
              {loading ? "生成中…" : `保存到第 ${Math.min(lessonNum, lessonsPerLevel)} 课并生成`}
            </button>
            {outEditing && (
              <p className="form-slot-hint" role="status">
                正在在线编辑本课课文，请先「确认保存」或「取消」再生成。
              </p>
            )}
          </>
        )}
      </form>

      {genError && (
        <p className="err" role="alert">
          {genError}
        </p>
      )}
      {isBookPipelineLevel(level) && level3GenStats && (
        <p
          className={level3GenStats.inRange ? "form-slot-hint" : "err"}
          role="status"
        >
          精修后词数：实测 {level3GenStats.actual} 词，目标带{" "}
          {level3GenStats.min}–{level3GenStats.max}（约 {level3GenStats.target}
          词）
          {level3GenStats.repairRounds > 0
            ? `，后端已自动修订 ${level3GenStats.repairRounds} 轮。`
            : "。"}
          {!level3GenStats.inRange &&
            " 若仍偏离，可再点「重新精修」、手改后点「③ 语言校核」或在定稿区保存。"}
        </p>
      )}

      {isBookPipelineLevel(level) && (
        <section className="out l3-draft" aria-label="初稿">
          <div className="out-head">
            <h2>
              第 {Math.min(lessonNum, lessonsPerLevel)} 课 · 第一阶段 · 初稿
            </h2>
            {l3Draft || l3DraftEditing ? (
              <p className="word-total" aria-label="初稿词数">
                初稿约 <strong>{countWordsInModelOutput(l3DraftForWordCount)}</strong>{" "}
                词
                <span className="word-total-sub">
                  （精修前不强制课纲带，以故事为主）
                </span>
                {l3DraftEditing && (
                  <span className="edit-badge"> 初稿编辑中</span>
                )}
              </p>
            ) : (
              <p className="word-total empty-note">尚无初稿</p>
            )}
            {(l3Draft || l3DraftEditing) && (
              <div className="l3-revision-wrap">
                <label className="l3-revision-label" htmlFor="l3-draft-revision-notes">
                  初稿修改说明（选填）
                </label>
                <p className="l3-revision-hint" id="l3-draft-revision-hint">
                  针对当前初稿说明哪里不满意、希望改成的方向，再点「重新生成初稿」或到上方点「①
                  生成初稿」。不填则按本课主题与课纲重刷。
                </p>
                <textarea
                  id="l3-draft-revision-notes"
                  className="l3-revision-ta"
                  value={l3DraftNotes}
                  onChange={(e) => {
                    setL3DraftNotes(e.target.value);
                  }}
                  rows={3}
                  placeholder="例：第二页对话太幼龄，希望语气更自然；或希望多体现本课句型 I like…"
                  spellCheck={true}
                  disabled={loading}
                  aria-describedby="l3-draft-revision-hint"
                />
              </div>
            )}
            {l3Draft && !l3DraftEditing && (
              <div className="out-actions">
                <button
                  className="btn sec"
                  type="button"
                  onClick={startL3DraftEdit}
                  disabled={loading || outEditing || l3RefinedEditing}
                  title={
                    outEditing
                      ? "请先结束定稿在线编辑"
                      : l3RefinedEditing
                        ? "请先结束精修在线编辑"
                        : undefined
                  }
                >
                  在线编辑初稿
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={() => {
                    void runGenerateDraft();
                  }}
                  disabled={loading || outEditing || l3RefinedEditing}
                >
                  {loading ? "请求中…" : "重新生成初稿"}
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={copyL3Draft}
                >
                  复制初稿
                </button>
              </div>
            )}
            {l3Draft && l3DraftEditing && (
              <div className="out-actions out-actions-edit">
                <button
                  className="btn"
                  type="button"
                  onClick={confirmL3DraftEdit}
                  disabled={loading}
                >
                  确认保存初稿
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={cancelL3DraftEdit}
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={copyL3Draft}
                >
                  复制当前初稿
                </button>
              </div>
            )}
          </div>
          {l3DraftEditing ? (
            <div className="text-block out-edit-wrap book-draft-wrap">
              <label className="out-edit-label" id="l3-draft-editor-label">
                编辑初稿（确认后用于「精修」）
              </label>
              <BookDraftEditor
                variant="draft"
                value={l3DraftBuffer}
                onChange={setL3DraftBuffer}
              />
            </div>
          ) : l3Draft ? (
            <div className="text-block">
              <ReadingOutput text={l3Draft} showTts={false} />
            </div>
          ) : (
            <p className="out-placeholder">
              在上方点击「① 生成初稿」。初稿以故事与参考范文为主，词数与页数在第二步精修。
            </p>
          )}
        </section>
      )}

      {isBookPipelineLevel(level) && (
        <section className="out l3-draft" aria-label="精修">
          <div className="out-head">
            <h2>
              第 {Math.min(lessonNum, lessonsPerLevel)} 课 · 第二阶段 · 精修
            </h2>
            {l3Refined || l3RefinedEditing ? (
              <p className="word-total" aria-label="精修词数">
                精修约 <strong>{countWordsInModelOutput(l3RefinedForWordCount)}</strong>{" "}
                词
                <span className="word-total-sub">（与课纲词数带对齐）</span>
                {l3RefinedEditing && (
                  <span className="edit-badge"> 精修编辑中</span>
                )}
              </p>
            ) : (
              <p className="word-total empty-note">尚无精修</p>
            )}
            {l3Refined && !l3RefinedEditing && (
              <div className="out-actions">
                <button
                  className="btn sec"
                  type="button"
                  onClick={startL3RefinedEdit}
                  disabled={loading || outEditing || l3DraftEditing}
                  title={
                    outEditing
                      ? "请先结束定稿在线编辑"
                      : l3DraftEditing
                        ? "请先结束初稿在线编辑"
                        : "按页与标题编辑精修 JSON"
                  }
                >
                  在线编辑精修
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={() => {
                    void runRefine();
                  }}
                  disabled={
                    loading ||
                    outEditing ||
                    l3DraftEditing ||
                    !(l3DraftEditing ? l3DraftBuffer : l3Draft).trim()
                  }
                >
                  {loading ? "请求中…" : "重新精修"}
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={useDraftInsteadOfRefined}
                  disabled={
                    loading ||
                    outEditing ||
                    l3DraftEditing ||
                    !(l3DraftEditing ? l3DraftBuffer : l3Draft).trim()
                  }
                  title="放弃当前精修，改用初稿作为后续语言校核与导出基底"
                >
                  放弃精修，改用初稿
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={copyL3Refined}
                >
                  复制精修
                </button>
              </div>
            )}
            {l3Refined && l3RefinedEditing && (
              <div className="out-actions out-actions-edit">
                <button
                  className="btn"
                  type="button"
                  onClick={confirmL3RefinedEdit}
                  disabled={loading}
                >
                  确认保存精修
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={cancelL3RefinedEdit}
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={copyL3Refined}
                >
                  复制当前精修
                </button>
              </div>
            )}
          </div>
          {l3RefinedEditing ? (
            <div className="text-block out-edit-wrap book-draft-wrap">
              <label
                className="out-edit-label"
                id="l3-refined-editor-label"
              >
                编辑精修（确认后用于「语言校核」）
              </label>
              <BookDraftEditor
                variant="refined"
                value={l3RefinedBuffer}
                onChange={setL3RefinedBuffer}
              />
            </div>
          ) : l3Refined ? (
            <div className="text-block">
              <ReadingOutput text={l3Refined} showTts={false} />
            </div>
          ) : (
            <p className="out-placeholder">
              在初稿上点击「②
              精修」后，此处显示控页/控词结果；可在线编辑后，用「③
              语言校核」得到定稿。
            </p>
          )}
          {!l3Refined && l3Draft.trim() && !l3RefinedEditing && (
            <div className="out-actions">
              <button
                className="btn sec"
                type="button"
                onClick={useDraftInsteadOfRefined}
                disabled={loading || outEditing || l3DraftEditing}
                title="跳过精修，直接采用初稿进入后续流程"
              >
                跳过精修，直接用初稿
              </button>
            </div>
          )}
        </section>
      )}

      {level && (
        <section className="out" aria-label="定稿">
          <div className="out-head">
            <h2>
              第 {Math.min(lessonNum, lessonsPerLevel)} 课 ·
              {isBookPipelineLevel(level)
                ? " 第三阶段 · 定稿（语言校对后）"
                : " 已保存的课文"}
            </h2>
            {out || outEditing ? (
              <p className="word-total" aria-label="英文总词数">
                共 <strong>{countWordsInModelOutput(outForWordCount)}</strong> 词
                {l1phase &&
                  l1WordBounds &&
                  !outEditing &&
                  level === "level1" && (
                    <span className="word-total-sub">
                      {" "}
                      （本段目标带约 {l1WordBounds.min}–{l1WordBounds.max} 词，6 页 JSON）
                    </span>
                  )}
                {l2phase &&
                  l2WordBounds &&
                  !outEditing &&
                  level === "level2" && (
                    <span className="word-total-sub">
                      {" "}
                      （本段目标带约 {l2WordBounds.min}–{l2WordBounds.max} 词，短绘本
                      JSON）
                    </span>
                  )}
                {l3phase &&
                  l3WordBounds &&
                  !outEditing &&
                  isPagedBookLevel(level) && (
                  <span className="word-total-sub">
                    {" "}
                    （本段目标带约 {l3WordBounds.min}–{l3WordBounds.max} 词，6–8 页
                    JSON）
                  </span>
                )}
                {isBookPipelineLevel(level) &&
                  refinedMatchesOut &&
                  !outEditing &&
                  l3Refined.trim() && (
                    <span className="word-total-sub">
                      {" "}
                      · 当前与精修相同，可点「③
                      语言校核」做终稿级语言纠错
                    </span>
                  )}
                {outEditing && (
                  <span className="edit-badge">
                    {" "}
                    {isBookPipelineLevel(level) ? "定稿编辑中" : "编辑中"}
                  </span>
                )}
              </p>
            ) : (
              <p className="word-total empty-note">
                {isBookPipelineLevel(level)
                  ? "本课还没有定稿"
                  : "本课还没有保存的生成"}
              </p>
            )}
            {(meta.cefr || meta.level) && (
              <p className="sub">
                {meta.level} · {meta.cefr}
              </p>
            )}
            {out && !outEditing && (
              <div className="out-actions">
                <button
                  className="btn sec"
                  type="button"
                  onClick={startOutEdit}
                  disabled={loading || l3DraftEditing || l3RefinedEditing}
                  title={
                    l3DraftEditing
                      ? "请先结束初稿在线编辑"
                      : l3RefinedEditing
                        ? "请先结束精修在线编辑"
                        : "在本页调整定稿（Level3/4 为表单 + 增减页）"
                  }
                >
                  {isBookPipelineLevel(level) ? "在线编辑定稿" : "在线编辑"}
                </button>
                {isBookPipelineLevel(level) ? (
                  <button
                    className="btn sec"
                    type="button"
                    onClick={() => {
                      void runProofread();
                    }}
                    disabled={
                      loading ||
                      l3RefinedEditing ||
                      !(
                        l3RefinedEditing ? l3RefinedBuffer : l3Refined
                      ).trim()
                    }
                    title="对当前精修做语言校核，更新为此处定稿"
                  >
                    {loading ? "请求中…" : "重新语言校核"}
                  </button>
                ) : (
                  <button
                    className="btn sec"
                    type="button"
                    onClick={() => {
                      void runGenerate();
                    }}
                    disabled={loading}
                    title="用当前表单参数再生成，并覆盖本课已保存内容"
                  >
                    {loading ? "生成中…" : "重新生成"}
                  </button>
                )}
                <button className="btn sec" type="button" onClick={copy}>
                  复制
                </button>
              </div>
            )}
            {out && outEditing && (
              <div className="out-actions out-actions-edit">
                <button
                  className="btn"
                  type="button"
                  onClick={confirmOutEdit}
                  disabled={loading}
                >
                  确认保存
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={cancelOutEdit}
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  className="btn sec"
                  type="button"
                  onClick={copy}
                >
                  复制当前内容
                </button>
              </div>
            )}
          </div>
          {outEditing && out != null ? (
            <div
              className={`text-block out-edit-wrap${isBookPipelineLevel(level) ? " book-draft-wrap" : ""}`}
            >
              <label
                className="out-edit-label"
                htmlFor={isBookPipelineLevel(level) ? undefined : "out-edit-ta"}
                id="out-editor-label"
              >
                {isBookPipelineLevel(level)
                  ? `编辑定稿 / 终稿（确认后写回第 ${Math.min(lessonNum, lessonsPerLevel)} 课，为默认导出正文）`
                  : `编辑正文（确认保存后写回第 ${Math.min(lessonNum, lessonsPerLevel)} 课）`}
              </label>
              {isBookPipelineLevel(level) ? (
                <BookDraftEditor
                  variant="final"
                  value={outDraft}
                  onChange={setOutDraft}
                />
              ) : (
                <textarea
                  id="out-edit-ta"
                  className="out-edit-ta"
                  value={outDraft}
                  onChange={(e) => setOutDraft(e.target.value)}
                  disabled={loading}
                  spellCheck={true}
                  lang="en"
                />
              )}
            </div>
          ) : out ? (
            <div className="text-block">
              <ReadingOutput
                text={out}
                highlightPhrase={
                  sentencePattern?.exampleMatchedInText
                    ? sentencePattern.exampleSentence
                    : null
                }
              />
            </div>
          ) : (
            <p className="out-placeholder">
              {isBookPipelineLevel(level)
                ? "定稿在「② 精修」后先与精修相同；经「③ 语言校核」后为终稿。亦可「一次性生成（旧）」单步得到初稿+精修合一结果。"
                : `在上方选课后填写表单，点击「保存到第 ${Math.min(lessonNum, lessonsPerLevel)} 课并生成」。已有内容的格子为绿色。`}
            </p>
          )}
        </section>
      )}
        </>
      )}

      {workflowTab === "illustrate" &&
        (illustrateReady ? (
          <>
            <BookIllustrationPrepPanel
              levelId={level}
              lessonSlot={lessonSlot}
              finalBookText={out!}
              libVersion={libVersion}
              onSaved={() => setLibVersion((v) => v + 1)}
              illustrationPageDirectionsLive={illustrationPageDirsLive}
            />
            <BookIllustrationGeneratePanel
              levelId={level}
              lessonSlot={lessonSlot}
              finalBookText={out!}
              libVersion={libVersion}
              onSaved={() => setLibVersion((v) => v + 1)}
              onIllustrationPageDirectionsLive={onIllustrationPageDirectionsLive}
            />
          </>
        ) : (
          <WorkflowTabEmpty>
            {!level ? (
              <p>请先选择阅读级别。</p>
            ) : !isBookPipelineLevel(level) ? (
              <p>当前阅读级别不使用绘本配图工作台。</p>
            ) : outEditing ? (
              <p>
                定稿正在在线编辑中，请先在本页第一个分区「生成与课文」里确认保存或取消，再使用配图。
              </p>
            ) : (
              <p>
                请先在「生成与课文」中完成生成与定稿（保存正文），再切换到本分区使用配图准备与生图。
              </p>
            )}
          </WorkflowTabEmpty>
        ))}

      {workflowTab === "language" &&
        (languageReady ? (
          <>
            <SentencePatternBlock
              levelName={levels.find((l) => l.id === level)?.name ?? level}
              outText={out!}
              pattern={sentencePattern}
              patternError={patternError}
              patternLoading={patternLoading}
              patternProvidedStructure={patternProvidedStructure}
              onPatternProvidedStructureChange={setPatternProvidedStructure}
              patternNotes={patternNotes}
              onPatternNotesChange={setPatternNotes}
              onAnalyze={() => {
                void runSentencePattern();
              }}
              disableAnalyze={patternLoading}
            />
            <VocabCandidateBlock
              levelName={levels.find((l) => l.id === level)?.name ?? level}
              cefrLabel={
                levels.find((l) => l.id === level)?.cefr ?? meta.cefr ?? ""
              }
              levelId={level}
              isLevel3={isBookPipelineLevel(level)}
              items={vocabCandidates}
              error={vocabError}
              loading={vocabLoading}
              onRun={() => {
                void runVocabCandidates();
              }}
              disableRun={vocabLoading}
              excludedByPriorMastery={vocabExcludedByMastery}
              priorMasteryFilterNote={vocabPriorMasteryNote}
              excludedByOtherLessons={vocabExcludedByOtherLessons}
              otherLessonsFilterNote={vocabOtherLessonsNote}
            />
            <VocabFinalTableBlock
              pool={vocabCandidates}
              value={vocabFinal}
              onChange={(rows) => {
                setVocabFinal(rows);
                persistVocabFinalTable(rows);
              }}
              disabled={loading || vocabLoading}
              enableMasteryWordlistCheck={isBookPipelineLevel(level)}
              masteryScope={level === "level4" ? "l0-l3" : "l0-l2"}
              isLevel3={isBookPipelineLevel(level)}
              maxRows={getVocabFinalMaxRows(level)}
              levelId={level}
            />
          </>
        ) : (
          <WorkflowTabEmpty>
            {!level ? (
              <p>请先选择阅读级别。</p>
            ) : !languageLevelIds ? (
              <p>当前阅读级别不提供句型分析与词汇定表工作台。</p>
            ) : outEditing ? (
              <p>
                正文正在编辑中，请先在「生成与课文」里确认保存或取消，再使用句型与词汇分区。
              </p>
            ) : (
              <p>
                请先在「生成与课文」中生成并保存课文正文，再切换到本分区分析句型与管理词汇。
              </p>
            )}
          </WorkflowTabEmpty>
        ))}
    </div>
  );
}
