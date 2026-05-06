/**
 * Persist TTS MP3 blobs in IndexedDB so audio survives lesson switches and refresh.
 */

const DB_NAME = "graded-reading-tts-v1";
const STORE = "mp3";
const VERSION = 1;

type Mp3Row = { key: string; blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });
}

export async function idbGetMp3(key: string): Promise<Blob | null> {
  const k = key.trim();
  if (!k) {
    return null;
  }
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(k);
      r.onsuccess = () => {
        const row = r.result as Mp3Row | undefined;
        resolve(row?.blob instanceof Blob ? row.blob : null);
      };
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}

export async function idbPutMp3(key: string, blob: Blob): Promise<void> {
  const k = key.trim();
  if (!k) {
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ key: k, blob } satisfies Mp3Row);
    });
  } catch {
    // Private mode / quota — playback still works via network.
  }
}
