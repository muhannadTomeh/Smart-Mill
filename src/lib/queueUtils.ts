export interface QueueItem {
  id: string;
  name: string;
  phone: string | null;
  bags: number;
  notes: string | null;
  position: number;
  created_at: string;
  status: string;
  estimated_minutes?: number | null;
  started_at?: string | null;
}

/**
 * Safely parse estimated minutes from database field, notes tag, or localStorage.
 */
export function parseEstimatedMinutes(item: {
  estimated_minutes?: number | null;
  notes?: string | null;
  id?: string;
}): number | null {
  if (!item) return null;
  if (item.estimated_minutes != null && !isNaN(Number(item.estimated_minutes))) {
    return Number(item.estimated_minutes);
  }
  if (typeof item.notes === "string" && item.notes) {
    try {
      const match = item.notes.match(/\[(?:وقت_تقديري|الوقت|est):?\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    } catch {}
  }
  if (item.id && typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(`queue_est_${item.id}`);
      if (local) {
        const n = parseInt(local, 10);
        if (!isNaN(n) && n > 0) return n;
      }
    } catch {}
  }
  return null;
}

/**
 * Safely parse processing start timestamp (epoch ms) from started_at, notes tag, or localStorage.
 */
export function parseStartedAt(item: {
  started_at?: string | null;
  notes?: string | null;
  id?: string;
}): number | null {
  if (!item) return null;
  if (item.started_at) {
    try {
      const t = new Date(item.started_at).getTime();
      if (!isNaN(t)) return t;
    } catch {}
  }
  if (typeof item.notes === "string" && item.notes) {
    try {
      const match = item.notes.match(/\[بدء_العصر:([^\]]+)\]/);
      if (match) {
        const t = new Date(match[1]).getTime();
        if (!isNaN(t)) return t;
        const num = Number(match[1]);
        if (!isNaN(num) && num > 0) return num;
      }
    } catch {}
  }
  if (item.id && typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(`processing_started_${item.id}`);
      if (local) {
        const t = new Date(local).getTime();
        if (!isNaN(t)) return t;
      }
    } catch {}
  }
  return null;
}

/**
 * Safely calculate remaining seconds for an item in processing.
 */
export function getRemainingSeconds(item: QueueItem, nowMs: number): number | null {
  if (!item) return null;
  const estMin = parseEstimatedMinutes(item);
  if (!estMin || estMin <= 0) return null;

  let startedAt = parseStartedAt(item);
  if (!startedAt && item.id && typeof window !== "undefined") {
    if (item.status === "processing") {
      startedAt = Date.now();
      try {
        localStorage.setItem(`processing_started_${item.id}`, new Date(startedAt).toISOString());
      } catch {}
    }
  }

  if (!startedAt) return null;
  const elapsed = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  return Math.max(0, estMin * 60 - elapsed);
}

/**
 * Safely format remaining seconds to MM:SS string.
 */
export function formatRemaining(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Safely format an ISO/date string to Arabic SA time (HH:MM) without ever throwing RangeError.
 */
export function formatTimeSafe(dateStr?: string | null): string {
  if (!dateStr) return "--:--";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "--:--";
  }
}
