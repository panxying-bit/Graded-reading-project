import { fetchTtsBlob, getTtsEnabled } from "./api/client";
import { tryParseBookOutput } from "./parseBookOutput";
import type { VocabFinalRow } from "./lessonLibrary";
import { splitPlaybackSentences } from "./splitPlaybackSentences";
import { idbGetMp3, idbPutMp3 } from "./ttsIdb";

function normKey(text: string): string {
  return text.trim();
}

/** object URLs for current tab playback */
const urlByKey = new Map<string, string>();
const inflightBlob = new Map<string, Promise<Blob>>();
const inflightUrl = new Map<string, Promise<string>>();

/** Resolve blob URL for this utterance if already in memory. */
export function getCachedTtsUrl(text: string): string | undefined {
  const k = normKey(text);
  return k ? urlByKey.get(k) : undefined;
}

function revokeAllMemoryUrls(): void {
  for (const u of urlByKey.values()) {
    URL.revokeObjectURL(u);
  }
  urlByKey.clear();
  inflightUrl.clear();
}

/**
 * Revoke in-memory object URLs only. IndexedDB clips are kept (survives reload / lesson change).
 */
export function clearTtsAudioCache(): void {
  revokeAllMemoryUrls();
  inflightBlob.clear();
}

async function resolveBlobForKey(k: string): Promise<Blob> {
  const fromIdb = await idbGetMp3(k);
  if (fromIdb) {
    return fromIdb;
  }

  let p = inflightBlob.get(k);
  if (!p) {
    p = fetchTtsBlob(k)
      .then(async (blob) => {
        await idbPutMp3(k, blob);
        inflightBlob.delete(k);
        return blob;
      })
      .catch((err) => {
        inflightBlob.delete(k);
        throw err;
      });
    inflightBlob.set(k, p);
  }
  return p;
}

/** Raw MP3 blob (IndexedDB hit or network). For ZIP export. */
export async function getTtsMp3Blob(text: string): Promise<Blob> {
  const k = normKey(text);
  if (!k) {
    throw new Error("Empty text");
  }
  return resolveBlobForKey(k);
}

/** Ensure blob is stored (IDB prefetch). Does not create object URLs. */
export async function ensureTtsBlobPersisted(text: string): Promise<void> {
  const k = normKey(text);
  if (!k) {
    return;
  }
  try {
    await resolveBlobForKey(k);
  } catch {
    // prefetch tolerance
  }
}

export async function getOrFetchTtsUrl(text: string): Promise<string> {
  const k = normKey(text);
  if (!k) {
    throw new Error("Empty text");
  }
  const mem = urlByKey.get(k);
  if (mem) {
    return mem;
  }

  let chain = inflightUrl.get(k);
  if (!chain) {
    chain = (async () => {
      try {
        const blob = await resolveBlobForKey(k);
        if (!urlByKey.has(k)) {
          urlByKey.set(k, URL.createObjectURL(blob));
        }
        return urlByKey.get(k)!;
      } finally {
        inflightUrl.delete(k);
      }
    })();
    inflightUrl.set(k, chain);
  }
  return chain;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const nWorkers = Math.max(1, Math.min(concurrency, items.length || 1));
  const workers = Array.from({ length: items.length ? nWorkers : 0 }, async () => {
    while (i < items.length) {
      const idx = i;
      i += 1;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * Prefetch TTS into IndexedDB (deduped). Skips when Azure Speech is disabled.
 */
export async function prefetchTtsBatch(
  texts: string[],
  options?: { concurrency?: number; signal?: AbortSignal },
): Promise<void> {
  const enabled = await getTtsEnabled();
  if (!enabled) {
    return;
  }
  const sig = options?.signal;
  const unique = [...new Set(texts.map(normKey).filter(Boolean))];
  if (unique.length === 0) {
    return;
  }
  const conc = Math.max(1, Math.min(6, options?.concurrency ?? 4));
  await runPool(unique, conc, async (t) => {
    if (sig?.aborted) {
      return;
    }
    await ensureTtsBlobPersisted(t);
  });
}

export function collectReadingTtsSegments(finalText: string): string[] {
  const t = finalText.trim();
  if (!t) {
    return [];
  }
  const book = tryParseBookOutput(t);
  if (book) {
    const segs: string[] = [];
    const pages = [...book.pages].sort((a, b) => a.page - b.page);
    for (const pg of pages) {
      segs.push(...splitPlaybackSentences(pg.text));
    }
    return segs;
  }
  return splitPlaybackSentences(t);
}

export function collectVocabTtsWords(rows: VocabFinalRow[]): string[] {
  return rows.map((r) => r.word.trim()).filter(Boolean);
}
