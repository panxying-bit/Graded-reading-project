import { memo, type ReactNode } from "react";
import { tryParseBookOutput, type BookOutput } from "./parseBookOutput";
import { splitPlaybackSentences } from "./splitPlaybackSentences";
import { TtsPlayButton } from "./TtsPlayButton";

type Props = {
  text: string;
  /** If set, first match in each segment is wrapped in <mark> (e.g. sentence-pattern exemplar). */
  highlightPhrase?: string | null;
  /** Per-sentence TTS; false for draft/refined previews — only final 定稿 should offer 听 (all levels). */
  showTts?: boolean;
};

function findHighlightSpan(
  body: string,
  phrase: string | null | undefined,
): { start: number; len: number } | null {
  if (phrase == null) {
    return null;
  }
  const t = phrase.trim();
  if (!t) {
    return null;
  }
  let i = body.indexOf(phrase);
  if (i >= 0) {
    return { start: i, len: phrase.length };
  }
  i = body.indexOf(t);
  if (i >= 0) {
    return { start: i, len: t.length };
  }
  return null;
}

function textWithOptionalHighlight(
  body: string,
  phrase: string | null | undefined,
): ReactNode {
  if (!body) {
    return null;
  }
  const sp = findHighlightSpan(body, phrase);
  if (!sp) {
    return body;
  }
  return (
    <>
      {body.slice(0, sp.start)}
      <mark className="sp-highlight" lang="en">
        {body.slice(sp.start, sp.start + sp.len)}
      </mark>
      {body.slice(sp.start + sp.len)}
    </>
  );
}

function BookView({
  book,
  highlightPhrase,
  showTts,
}: {
  book: BookOutput;
  highlightPhrase?: string | null;
  showTts: boolean;
}) {
  const sorted = [...book.pages].sort((a, b) => a.page - b.page);
  return (
    <div className="book-view">
      {book.title?.trim() && <h3 className="book-title">{book.title.trim()}</h3>}
      {(book.structure_type || book.level) && (
        <div className="book-meta">
          {book.structure_type ? (
            <span className="book-meta-item">结构：{book.structure_type}</span>
          ) : null}
          {book.level ? <span className="book-meta-item">{book.level}</span> : null}
        </div>
      )}
      <ul className="book-pages">
        {sorted.map((pg, i) => (
          <li key={`${pg.page}-${i}`} className="book-page">
            <span className="book-page-num" aria-hidden>
              {pg.page}
            </span>
            <div className="book-page-body">
              <div className="book-page-text">
                {splitPlaybackSentences(pg.text).map((sent, si) => (
                  <div key={si} className="book-sentence-row">
                    <span className="book-sentence-text" lang="en">
                      {textWithOptionalHighlight(sent, highlightPhrase)}
                    </span>
                    {showTts ? <TtsPlayButton text={sent} /> : null}
                  </div>
                ))}
              </div>
              {pg.scene_note?.trim() ? (
                <p className="book-scene">{pg.scene_note.trim()}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const ReadingOutput = memo(function ReadingOutput({
  text,
  highlightPhrase,
  showTts = true,
}: Props) {
  const book = tryParseBookOutput(text);
  if (book) {
    return (
      <BookView
        book={book}
        highlightPhrase={highlightPhrase}
        showTts={showTts}
      />
    );
  }
  return (
    <div className="plain-reading" lang="en">
      {splitPlaybackSentences(text).map((sent, i) => (
        <div key={i} className="book-sentence-row">
          <span className="book-sentence-text">
            {textWithOptionalHighlight(sent, highlightPhrase)}
          </span>
          {showTts ? <TtsPlayButton text={sent} /> : null}
        </div>
      ))}
    </div>
  );
});
