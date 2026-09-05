type AlarmListener = (alarm: chrome.alarms.Alarm) => void;

/**
 * In-memory stand-in for chrome.alarms. It remembers what was created, so
 * the guard against re-creating a ticking alarm can be tested, and lets a
 * test fire one by name.
 */
export function createFakeChromeAlarms() {
  const alarms = new Map<string, chrome.alarms.Alarm>();
  const listeners = new Set<AlarmListener>();

  return {
    alarms,
    listeners,
    fire: (name: string) => {
      for (const listener of listeners) listener({ name, scheduledTime: 0 });
    },
    chrome: {
      alarms: {
        create: async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
          alarms.set(name, { name, scheduledTime: 0, periodInMinutes: info.periodInMinutes });
        },
        get: async (name: string) => alarms.get(name),
        clear: async (name: string) => alarms.delete(name),
        onAlarm: {
          addListener: (listener: AlarmListener) => listeners.add(listener),
          removeListener: (listener: AlarmListener) => listeners.delete(listener),
        },
      },
    },
  };
}
