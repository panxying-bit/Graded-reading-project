import JSZip from "jszip";
import { getTtsEnabled } from "./api/client";
import {
  collectReadingTtsSegments,
  collectVocabTtsWords,
  getTtsMp3Blob,
} from "./ttsAudioCache";
import {
  getLesson,
  resolveLessonTextForExport,
  type VocabFinalRow,
} from "./lessonLibrary";

function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

/** Safe single-line basename (no extension); mirrors user-visible sentence/word text. */
export function sanitizeAudioBasename(label: string): string {
  const s = label
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return s || "clip";
}

function allocMp3Filename(label: string, used: Map<string, number>): string {
  let base = sanitizeAudioBasename(label);
  if (!base) {
    base = "clip";
  }
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? `${base}.mp3` : `${base}_${n}.mp3`;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const nWorkers = Math.max(1, Math.min(concurrency, items.length || 1));
  const workers = Array.from(
    { length: items.length ? nWorkers : 0 },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * ZIP: per lesson `lesson-NNN-audio/正文/*.mp3` + `lesson-NNN-audio/定表词/*.mp3`.
 * Filenames from utterance text (sentence or headword phrase).
 */
export async function zipLessonsAudioPack(options: {
  levelId: string;
  lessonNumbers: number[];
  concurrency?: number;
}): Promise<Blob> {
  const { levelId, lessonNumbers } = options;
  const conc = Math.max(1, Math.min(4, options.concurrency ?? 3));

  if (!(await getTtsEnabled())) {
    throw new Error(
      "语音合成未启用：请在后端配置 AZURE_SPEECH_KEY 并重启 API。",
    );
  }

  const zip = new JSZip();
  let fileCount = 0;

  for (const n of lessonNumbers) {
    const rec = getLesson(levelId, n);
    if (!rec) {
      continue;
    }
    const passage = (
      resolveLessonTextForExport(levelId, rec) ??
      rec.text ??
      ""
    ).trim();
    if (!passage) {
      continue;
    }

    const rootPath = `lesson-${pad3(n)}-audio`;
    const sentences = collectReadingTtsSegments(passage);
    const sentenceUsed = new Map<string, number>();
    await runPool(sentences, conc, async (sent) => {
      const blob = await getTtsMp3Blob(sent);
      const name = allocMp3Filename(sent, sentenceUsed);
      zip.file(`${rootPath}/正文/${name}`, blob);
      fileCount += 1;
    });

    const rows: VocabFinalRow[] = Array.isArray(rec.vocabFinalTable?.items)
      ? rec.vocabFinalTable.items.filter(
          (r) => r.word?.trim() && r.sentence?.trim(),
        )
      : [];
    const words = collectVocabTtsWords(rows);
    const wordUsed = new Map<string, number>();
    await runPool(words, conc, async (w) => {
      const blob = await getTtsMp3Blob(w);
      const name = allocMp3Filename(w, wordUsed);
      zip.file(`${rootPath}/定表词/${name}`, blob);
      fileCount += 1;
    });
  }

  if (fileCount === 0) {
    throw new Error(
      "所选课次没有可导出的正文或定表词，或课文为空。请确认已定稿并生成过朗读音频（可先在本页播放预加载）。",
    );
  }

  return zip.generateAsync({
    type: "blob",
    compression: "STORE",
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function makeAudioZipFilename(levelId: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  return `${levelId}-lessons-audio-${stamp}.zip`;
}
