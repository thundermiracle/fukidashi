import { NOTE_COLORS, type NoteColor } from "@/core";

interface ColorSwatchesProps {
  /** The colour currently chosen, if the picker reflects a selection. */
  value?: NoteColor;
  onSelect: (color: NoteColor) => void;
  title?: (color: NoteColor) => string;
}

export function ColorSwatches({ value, onSelect, title }: ColorSwatchesProps) {
  return (
    <div className="fk-swatches">
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`fk-swatch fk-swatch--${color}${value === color ? " fk-swatch--selected" : ""}`}
          title={title?.(color) ?? color}
          aria-label={title?.(color) ?? color}
          aria-pressed={value === color}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  );
}
