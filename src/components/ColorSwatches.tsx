import { NOTE_COLORS, type NoteColor } from "@/core";
import { type MessageKey, t } from "@/services/i18n";

const COLOR_NAMES: Record<NoteColor, MessageKey> = {
  yellow: "colorYellow",
  green: "colorGreen",
  blue: "colorBlue",
  pink: "colorPink",
  purple: "colorPurple",
};

interface ColorSwatchesProps {
  /** The colour currently chosen, if the picker reflects a selection. */
  value?: NoteColor;
  onSelect: (color: NoteColor) => void;
  /** What a swatch is called, from the colour's name in the user's language. */
  title?: (name: string) => string;
}

export function ColorSwatches({ value, onSelect, title = (name) => name }: ColorSwatchesProps) {
  return (
    <div className="fk-swatches">
      {NOTE_COLORS.map((color) => {
        const label = title(t(COLOR_NAMES[color]));
        return (
          <button
            key={color}
            type="button"
            className={`fk-swatch fk-swatch--${color}${value === color ? " fk-swatch--selected" : ""}`}
            title={label}
            aria-label={label}
            aria-pressed={value === color}
            onClick={() => onSelect(color)}
          />
        );
      })}
    </div>
  );
}
