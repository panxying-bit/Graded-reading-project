import { tryParseBookOutput, type BookOutput } from "./parseBookOutput";

type Props = {
  text: string;
};

function BookView({ book }: { book: BookOutput }) {
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
              <p className="book-page-text">{pg.text}</p>
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

export function ReadingOutput({ text }: Props) {
  const book = tryParseBookOutput(text);
  if (book) {
    return <BookView book={book} />;
  }
  return (
    <div className="plain-reading" lang="en">
      {text}
    </div>
  );
}
