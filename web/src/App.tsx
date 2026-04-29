import { Fragment, useEffect, useRef, useState } from "react";
import {
  analyzeSentencePattern,
  fetchLessonPlan,
  fetchLevels,
  generateDraft,
  generateProofread,
  generateRefine,
  generateText,
  type Level3WordCountField,
  type LevelItem,
  type LessonPlan,
  type SentencePatternResponse,
} from "./api/client";
import { DEFAULT_STRUCTURE, STRUCTURE_TYPES } from "./structureOptions";
import { DEFAULT_TENSE_FOCUS, TENSE_FOCUS_OPTIONS } from "./tenseOptions";
import { DEFAULT_GENRE_FOCUS, GENRE_FOCUS_OPTIONS } from "./genreOptions";
import { getLevel3Phase, getLevel3WordCountBounds } from "./level3Phase";
import {
  getLesson,
  isUsableSentencePatternSnapshot,
  saveLesson,
  type SentencePatternSnapshot,
} from "./lessonLibrary";
import { LessonDownloadPanel } from "./LessonDownloadPanel";
import { LessonPanel } from "./LessonPanel";
import { PromptEditorPanel } from "./PromptEditorPanel";
import { BookDraftEditor } from "./BookDraftEditor";
import { ReadingOutput } from "./ReadingOutput";
import { SentencePatternBlock } from "./SentencePatternBlock";
import {
  bookToPlainText,
  countWordsInModelOutput,
  tryParseBookOutput,
} from "./parseBookOutput";

export function App() {
  const [levels, setLevels] = useState<LevelItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
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
  const lessonRef = useRef(lessonNum);
  useEffect(() => {
    lessonRef.current = lessonNum;
  }, [lessonNum]);

  const lessonsPerLevel = levels.find((l) => l.id === level)?.lessonsPerLevel ?? 144;

  const curriculumRow =
    level === "level3" && lessonPlan
      ? lessonPlan.lessons.find(
          (r) => r.lesson === Math.min(lessonNum, lessonsPerLevel),
        )
      : undefined;
  const curriculumTheme = curriculumRow?.theme;
  const curriculumLessonTitle = curriculumRow?.lessonTitle;
  /** True when this slot has a title in level3.json (the 48 outline lessons). */
  const hasOutlineLessonTitle = Boolean(
    level === "level3" && curriculumLessonTitle?.trim(),
  );

  const l3phase = level === "level3" ? getLevel3Phase(lessonNum) : null;
  const l3WordBounds = l3phase
    ? getLevel3WordCountBounds(lessonNum)
    : null;

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

  // Load per-level lesson curriculum (e.g. level3.json with 144 theme rows).
  useEffect(() => {
    if (level !== "level3") {
      setLessonPlan(null);
      return;
    }
    let cancelled = false;
    void fetchLessonPlan("level3")
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

  // Sync topic / lesson title / fiction mode from saved slot or curriculum outline.
  useEffect(() => {
    if (!level || !levels.length) {
      return;
    }
    const n = Math.min(lessonNum, lessonsPerLevel);
    const rec = getLesson(level, n);
    if (level === "level3" && !lessonPlan?.lessons?.length) {
      if (rec?.topic) {
        setTopic(rec.topic);
      } else {
        setTopic("");
      }
      if (rec?.lessonTitle) {
        setLessonTitle(rec.lessonTitle);
      } else {
        setLessonTitle("");
      }
      if (rec?.fictionOrNonfiction) {
        setFictionOrNonfiction(rec.fictionOrNonfiction);
      } else {
        setFictionOrNonfiction("fiction");
      }
      return;
    }
    if (level === "level3" && lessonPlan?.lessons?.length) {
      const row = lessonPlan.lessons.find((r) => r.lesson === n);
      if (rec?.topic != null && rec.topic !== "") {
        setTopic(rec.topic);
      } else if (row?.theme) {
        setTopic(row.theme);
      } else {
        setTopic("");
      }
      if (rec?.lessonTitle != null && rec.lessonTitle !== "") {
        setLessonTitle(rec.lessonTitle);
      } else if (row?.lessonTitle) {
        setLessonTitle(row.lessonTitle);
      } else {
        setLessonTitle("");
      }
      if (rec?.fictionOrNonfiction) {
        setFictionOrNonfiction(rec.fictionOrNonfiction);
      } else if (row?.suggestedFictionOrNonfiction) {
        setFictionOrNonfiction(row.suggestedFictionOrNonfiction);
      } else {
        setFictionOrNonfiction("fiction");
      }
      return;
    }
    if (rec?.topic) {
      setTopic(rec.topic);
    } else {
      setTopic("");
    }
    // Non–level3: no lesson title field; keep state clean for API.
    setLessonTitle("");
  }, [level, lessonNum, lessonPlan, lessonsPerLevel, levels.length]);

  // Word count: level3 follows lesson band (70/80/90); others use server defaultWordCount.
  useEffect(() => {
    if (!level || !levels.length) {
      return;
    }
    if (level === "level3") {
      setWordCount(getLevel3Phase(lessonNum).targetWords);
      return;
    }
    const cfg = levels.find((l) => l.id === level);
    if (cfg && typeof cfg.defaultWordCount === "number") {
      setWordCount(cfg.defaultWordCount);
    }
  }, [level, levels, lessonNum]);

  // When user switches level / lesson, load that slot from the local library.
  useEffect(() => {
    if (!level || !levels.length) {
      return;
    }
    const c = levels.find((l) => l.id === level);
    setMeta({ level, cefr: c?.cefr });
    const rec = getLesson(level, lessonNum);
    setOut(rec?.text ?? null);
    setOutEditing(false);
    if (level === "level3") {
      setL3Draft(rec?.level3DraftText ?? "");
      setL3DraftEditing(false);
      const refined = rec?.level3RefinedText;
      if (refined != null && refined !== "") {
        setL3Refined(refined);
      } else if (rec?.text) {
        setL3Refined(rec.text);
      } else {
        setL3Refined("");
      }
      setL3RefinedEditing(false);
      setL3DraftNotes("");
    }
    setPatternError(null);
    setPatternNotes("");
  }, [level, lessonNum, levels]);

  // Re-hydrate 句型 from localStorage after 分析保存 / 任意 save 引起的 libVersion 变化
  // (wider than snap?.pattern so 例句 alone still restores; save 失败不 bump 时不会清掉已显示句型)
  useEffect(() => {
    if (!level || !levels.length) {
      return;
    }
    const rec2 = getLesson(level, lessonNum);
    const s = rec2?.sentencePatternSnapshot;
    if (s && isUsableSentencePatternSnapshot(s)) {
      setSentencePattern(s as unknown as SentencePatternResponse);
    } else {
      setSentencePattern(null);
    }
  }, [libVersion, level, lessonNum, levels.length]);

  useEffect(() => {
    if (level !== "level3") {
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
    const slotLesson = lessonNum;
    setGenError(null);
    setLevel3GenStats(null);
    setLoading(true);
    try {
      const body: {
        level: string;
        topic?: string;
        lessonTitle?: string;
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
      if (level === "level3" && lessonTitle.trim()) {
        body.lessonTitle = lessonTitle.trim();
      }
      if (genreFocus.trim()) {
        body.genreFocus = genreFocus.trim();
      }
      if (tenseFocus.trim()) {
        body.tenseFocus = tenseFocus.trim();
      }
      if (level === "level3") {
        body.lesson = slotLesson;
        body.wordCount = getLevel3Phase(slotLesson).targetWords;
      } else if (wordCount > 0) {
        body.wordCount = wordCount;
      }
      const res = await generateText(body);
      const w = countWordsInModelOutput(res.text);
      saveLesson(level, slotLesson, {
        text: res.text,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle:
          level === "level3" ? lessonTitle.trim() || undefined : undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        ...(level === "level3"
          ? { level3DraftText: res.text, level3RefinedText: res.text }
          : {}),
        sentencePatternSnapshot: null,
      });
      setLibVersion((v) => v + 1);
      if (slotLesson === lessonRef.current) {
        setOut(res.text);
        setOutEditing(false);
        setMeta({ cefr: res.cefr, level: res.level });
        setLevel3GenStats(res.level3WordCount ?? null);
        if (level === "level3") {
          setL3Draft(res.text);
          setL3Refined(res.text);
        }
        setSentencePattern(null);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runGenerateDraft() {
    if (level !== "level3") {
      return;
    }
    const slotLesson = lessonNum;
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
      body.lesson = slotLesson;
      body.wordCount = getLevel3Phase(slotLesson).targetWords;
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
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        level3DraftText: draftText,
        level3RefinedText: "",
        sentencePatternSnapshot: null,
      });
      setLibVersion((v) => v + 1);
      if (slotLesson === lessonRef.current) {
        setL3Draft(draftText);
        setL3DraftEditing(false);
        setL3Refined("");
        setOut(null);
        setLevel3GenStats(null);
        setSentencePattern(null);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runRefine() {
    if (level !== "level3") {
      return;
    }
    const rawDraft = (l3DraftEditing ? l3DraftBuffer : l3Draft).trim();
    if (!rawDraft) {
      setGenError("请先生成初稿或粘贴初稿 JSON，再精修。");
      return;
    }
    const slotLesson = lessonNum;
    setGenError(null);
    setLevel3GenStats(null);
    setLoading(true);
    try {
      const res = await generateRefine({
        lesson: slotLesson,
        draftText: rawDraft,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        fictionOrNonfiction,
      });
      const w = countWordsInModelOutput(res.text);
      saveLesson(level, slotLesson, {
        text: res.text,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        level3DraftText: rawDraft,
        level3RefinedText: res.text,
        sentencePatternSnapshot: null,
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
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runProofread() {
    if (level !== "level3") {
      return;
    }
    const bookText = (l3RefinedEditing ? l3RefinedBuffer : l3Refined).trim();
    if (!bookText) {
      setGenError("请先完成精修（或粘贴精修 JSON），再语言校核定稿。");
      return;
    }
    const slotLesson = lessonNum;
    setGenError(null);
    setLevel3GenStats(null);
    setLoading(true);
    try {
      const res = await generateProofread({
        bookText,
        lesson: slotLesson,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
      });
      const w = countWordsInModelOutput(res.text);
      saveLesson(level, slotLesson, {
        text: res.text,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        fictionOrNonfiction,
        structureType,
        tenseFocus: tenseFocus.trim() || undefined,
        genreFocus: genreFocus.trim() || undefined,
        level3RefinedText: bookText,
        sentencePatternSnapshot: null,
      });
      setLibVersion((v) => v + 1);
      if (slotLesson === lessonRef.current) {
        setOut(res.text);
        setOutEditing(false);
        setL3Refined(bookText);
        setL3RefinedEditing(false);
        setMeta({ cefr: res.cefr, level: res.level });
        setSentencePattern(null);
      }
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runSentencePattern() {
    if (level !== "level1" && level !== "level2" && level !== "level3") {
      return;
    }
    const t = out?.trim();
    if (!t) {
      return;
    }
    setPatternError(null);
    setPatternLoading(true);
    try {
      const note = patternNotes.trim();
      const r = await analyzeSentencePattern({
        level,
        text: t,
        ...(note ? { patternExtraInstructions: note } : {}),
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
      const saved = saveLesson(level, lessonNum, {
        text: t,
        wordCount: w,
        topic: topic.trim() || undefined,
        lessonTitle:
          level === "level3" ? lessonTitle.trim() || undefined : undefined,
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (level === "level3") {
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
    saveLesson(level, lessonNum, {
      text: t,
      wordCount: w,
      topic: topic.trim() || undefined,
      lessonTitle:
        level === "level3" ? lessonTitle.trim() || undefined : undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      sentencePatternSnapshot: null,
    });
    setOut(t);
    setLibVersion((v) => v + 1);
    setOutEditing(false);
    setSentencePattern(null);
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
    saveLesson(level, lessonNum, {
      text: out ?? "",
      wordCount: countWordsInModelOutput(out ?? ""),
      topic: topic.trim() || undefined,
      lessonTitle: lessonTitle.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      level3DraftText: t,
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
    saveLesson(level, lessonNum, {
      text: nextText,
      wordCount: w,
      topic: topic.trim() || undefined,
      lessonTitle: lessonTitle.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      level3RefinedText: t,
      ...(syncFinal ? { sentencePatternSnapshot: null as const } : {}),
    });
    if (syncFinal) {
      setOut(t);
    }
    setLibVersion((v) => v + 1);
    setL3RefinedEditing(false);
    if (syncFinal) {
      setSentencePattern(null);
    }
  }

  function cancelL3RefinedEdit() {
    setL3RefinedEditing(false);
    setL3RefinedBuffer(l3Refined);
  }

  function useDraftInsteadOfRefined() {
    if (level !== "level3") {
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
    saveLesson(level, lessonNum, {
      text: nextFinal ?? "",
      wordCount: countWordsInModelOutput(nextFinal ?? ""),
      topic: topic.trim() || undefined,
      lessonTitle: lessonTitle.trim() || undefined,
      fictionOrNonfiction,
      structureType,
      tenseFocus: tenseFocus.trim() || undefined,
      genreFocus: genreFocus.trim() || undefined,
      level3DraftText: draft,
      level3RefinedText: draft,
      ...(syncFinal ? { sentencePatternSnapshot: null as const } : {}),
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
    }
  }

  return (
    <div className="app">
      <header className="head">
        <h1>Graded reading</h1>
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
              if (level !== "level3" || !lessonPlan) {
                return undefined;
              }
              return lessonPlan.lessons.find((r) => r.lesson === n)?.theme;
            }}
            planLessonTitleForLesson={(n) => {
              if (level !== "level3" || !lessonPlan) {
                return undefined;
              }
              return lessonPlan.lessons.find((r) => r.lesson === n)?.lessonTitle;
            }}
          />
        </Fragment>
      )}

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
              if (v !== "level3") {
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
            {level === "level3" && lessonPlan
              ? "（课纲自动同步，可改）"
              : "（选填）"}
          </span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              level === "level3" && lessonPlan
                ? "与当前课次课纲主题一致，可直接生成"
                : "e.g. A day at the park with my friend"
            }
            autoComplete="off"
          />
        </label>

        {level === "level3" && (
          <label className="row">
            <span>课文标题 (Lesson title)</span>
            <input
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
              title={
                !lessonPlan
                  ? "课纲加载中，亦可手填"
                  : hasOutlineLessonTitle
                    ? "表内给定的课次已预填，可改"
                    : "本课不在表内 48 条课纲中，可自填或留空"
              }
              placeholder={
                !lessonPlan
                  ? "课纲加载中…"
                  : hasOutlineLessonTitle
                    ? "与课纲一致，可改"
                    : "本课无课纲标题，可自填或留空"
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        {level === "level3" && lessonPlan && (
          <p className="form-slot-hint" role="note">
            第 <strong>1–16</strong>、<strong>49–64</strong>、<strong>97–112</strong>{" "}
            课含表格中的主题与课文标题，已预填；其余课次不预填，需要时请自填。
          </p>
        )}

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
            title="不选则只按上项虚构/非虚构；可选童话、寓言等，Level3 常用来试写"
          >
            {GENRE_FOCUS_OPTIONS.map((o) => (
              <option key={o.value || "g-none"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="row">
          <span>结构类型</span>
          <select
            value={structureType}
            onChange={(e) => setStructureType(e.target.value)}
            disabled={!levels.length}
          >
            {STRUCTURE_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="row">
          <span>时态重点（选填）</span>
          <select
            value={tenseFocus}
            onChange={(e) => setTenseFocus(e.target.value)}
            disabled={!levels.length}
            title="不选则不限定；若选，生成时会突出该时态/用法"
          >
            {TENSE_FOCUS_OPTIONS.map((o) => (
              <option key={o.value || "none"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="row">
          <span>
            {l3phase ? "本段目标词数（只读，随课次三档 70/80/90）" : "约词数"}
          </span>
          <input
            type="number"
            min={1}
            max={10000}
            value={l3phase ? l3phase.targetWords : wordCount}
            readOnly={l3phase != null}
            title={
              l3phase && l3WordBounds
                ? `Level3：${l3phase.pageCountMin}–${l3phase.pageCountMax} 页 JSON 绘本。本段目标约 ${l3WordBounds.target} 词，词数带约 ${l3WordBounds.min}–${l3WordBounds.max} 词；三档为前 48 课 70、中 48 课 80、后 48 课 90。`
                : undefined
            }
            onChange={(e) => setWordCount(Number(e.target.value) || 0)}
          />
        </label>
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
            这一词数带控制，超出时常自动多轮压缩/补足。单句习惯约 {l3phase.minWordsPerSentence}–
            {l3phase.maxWordsPerSentence} 词。三档总目标：第 1–48 课约 70 词、49–96 约 80 词、97–144 约
            90 词。参考范文仅作语气与课堂用语参考，版式以本 JSON 为准。
          </p>
        )}

        {level === "level3" ? (
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
      {level === "level3" && level3GenStats && (
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

      {level === "level3" && (
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
              <ReadingOutput text={l3Draft} />
            </div>
          ) : (
            <p className="out-placeholder">
              在上方点击「① 生成初稿」。初稿以故事与参考范文为主，词数与页数在第二步精修。
            </p>
          )}
        </section>
      )}

      {level === "level3" && (
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
              <ReadingOutput text={l3Refined} />
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
              {level === "level3"
                ? " 第三阶段 · 定稿（语言校对后）"
                : " 已保存的课文"}
            </h2>
            {out || outEditing ? (
              <p className="word-total" aria-label="英文总词数">
                共 <strong>{countWordsInModelOutput(outForWordCount)}</strong> 词
                {l3phase && l3WordBounds && !outEditing && level === "level3" && (
                  <span className="word-total-sub">
                    {" "}
                    （本段目标带约 {l3WordBounds.min}–{l3WordBounds.max} 词，6–8 页
                    JSON）
                  </span>
                )}
                {level === "level3" &&
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
                    {level === "level3" ? "定稿编辑中" : "编辑中"}
                  </span>
                )}
              </p>
            ) : (
              <p className="word-total empty-note">
                {level === "level3" ? "本课还没有定稿" : "本课还没有保存的生成"}
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
                        : "在本页调整定稿（Level3 为表单 + 增减页）"
                  }
                >
                  {level === "level3" ? "在线编辑定稿" : "在线编辑"}
                </button>
                {level === "level3" ? (
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
              className={`text-block out-edit-wrap${level === "level3" ? " book-draft-wrap" : ""}`}
            >
              <label
                className="out-edit-label"
                htmlFor={level === "level3" ? undefined : "out-edit-ta"}
                id="out-editor-label"
              >
                {level === "level3"
                  ? `编辑定稿 / 终稿（确认后写回第 ${Math.min(lessonNum, lessonsPerLevel)} 课，为默认导出正文）`
                  : `编辑正文（确认保存后写回第 ${Math.min(lessonNum, lessonsPerLevel)} 课）`}
              </label>
              {level === "level3" ? (
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
              {level === "level3"
                ? "定稿在「② 精修」后先与精修相同；经「③ 语言校核」后为终稿。亦可「一次性生成（旧）」单步得到初稿+精修合一结果。"
                : `在上方选课后填写表单，点击「保存到第 ${Math.min(lessonNum, lessonsPerLevel)} 课并生成」。已有内容的格子为绿色。`}
            </p>
          )}
        </section>
      )}

      {level &&
        (level === "level1" || level === "level2" || level === "level3") &&
        out &&
        !outEditing && (
          <SentencePatternBlock
            levelName={levels.find((l) => l.id === level)?.name ?? level}
            outText={out}
            pattern={sentencePattern}
            patternError={patternError}
            patternLoading={patternLoading}
            patternNotes={patternNotes}
            onPatternNotesChange={setPatternNotes}
            onAnalyze={() => {
              void runSentencePattern();
            }}
            disableAnalyze={loading}
          />
        )}
    </div>
  );
}
