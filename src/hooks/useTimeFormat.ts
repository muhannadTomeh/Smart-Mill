import { useEffect, useState } from "react";

export type TimeFormat = "12" | "24";

const STORAGE_KEY = "smart_mill_time_format";
export const TIME_FORMAT_CHANGE_EVENT = "smart-mill-time-format-change";

export function getTimeFormat(): TimeFormat {
  return typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "12" ? "12" : "24";
}

export function setTimeFormat(timeFormat: TimeFormat) {
  localStorage.setItem(STORAGE_KEY, timeFormat);
  window.dispatchEvent(new CustomEvent(TIME_FORMAT_CHANGE_EVENT, { detail: timeFormat }));
}

export function useTimeFormat() {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(() => {
    return getTimeFormat();
  });

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setTimeFormatState(event.newValue === "12" ? "12" : "24");
      }
    };
    const onTimeFormatChange = (event: Event) => {
      setTimeFormatState((event as CustomEvent<TimeFormat>).detail === "12" ? "12" : "24");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TIME_FORMAT_CHANGE_EVENT, onTimeFormatChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TIME_FORMAT_CHANGE_EVENT, onTimeFormatChange);
    };
  }, []);

  return { timeFormat, setTimeFormat };
}
