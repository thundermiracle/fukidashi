import { formatRelativeTime, type Note } from "@/core";
import { TrashIcon } from "./icons";

interface NoteListProps {
  notes: Note[];
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
}

/** The notes of one page, in the order they appear in the text. */
export function NoteList({ notes, onSelect, onDelete }: NoteListProps) {
  return (
    <ul className="fk-list">
      {notes.map((note) => (
        <li key={note.id} className="fk-list__item">
          <button type="button" className="fk-list__button" onClick={() => onSelect(note)}>
            <span className={`fk-list__bar fk-list__bar--${note.color}`} />
            <span className="fk-list__content">
              <span className="fk-list__quote">{note.anchor.exact}</span>
              {note.comment && <span className="fk-list__comment">{note.comment}</span>}
              <span className="fk-list__time">{formatRelativeTime(note.updatedAt)}</span>
            </span>
          </button>
          <button
            type="button"
            className="fk-icon-button fk-list__delete"
            title="Delete note"
            onClick={() => onDelete(note)}
          >
            <TrashIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}
