import { useEffect, useState } from "react";
import logo from "@/assets/fukidashi.png";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { loadSettings, SETTINGS_KEYS, type SettingsType, saveSetting } from "@/services/settings";
import "./App.css";

function App() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setSettings(await loadSettings());
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleToggleChange = async (key: string, checked: boolean) => {
    if (!settings) return;

    try {
      await saveSetting(key, checked);
      setSettings({ ...settings, [key]: checked });
    } catch (error) {
      console.error(`Failed to save setting for ${key}:`, error);
    }
  };

  if (isLoading) {
    return <div className="card">Loading...</div>;
  }

  return (
    <>
      <div>
        <img src={logo} className="logo" alt="fukidashi logo" />
      </div>
      <div className="card">
        {settings && (
          <div className="settings-container">
            <ToggleSwitch
              id="enabled"
              label="Enabled"
              defaultChecked={settings.enabled}
              onChange={(checked) => handleToggleChange(SETTINGS_KEYS.ENABLED, checked)}
            />
          </div>
        )}
      </div>
    </>
  );
}

export default App;
