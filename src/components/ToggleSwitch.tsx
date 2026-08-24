import { useCallback, useEffect, useState } from "react";
import "./ToggleSwitch.css";

interface ToggleSwitchProps {
  id: string;
  label: string;
  defaultChecked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ id, label, defaultChecked, onChange }: ToggleSwitchProps) {
  const [checked, setChecked] = useState(defaultChecked);

  useEffect(() => {
    setChecked(defaultChecked);
  }, [defaultChecked]);

  const handleChange = useCallback(() => {
    const newChecked = !checked;
    setChecked(newChecked);
    onChange(newChecked);
  }, [onChange, checked]);

  return (
    <div className="toggle-switch-container">
      <label htmlFor={id} className="toggle-switch-label">
        {label}
      </label>
      <div className="toggle-switch">
        {/* The input covers the whole switch (transparent) so clicks and focus
            land on the real control; the span below is the visual only. */}
        <input
          type="checkbox"
          id={id}
          className="toggle-switch-checkbox"
          checked={checked}
          onChange={handleChange}
        />
        <span className="toggle-switch-button" aria-hidden="true" />
      </div>
    </div>
  );
}
