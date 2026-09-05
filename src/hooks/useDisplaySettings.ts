import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CustomFaq {
  id: string;
  q: string;
  a: string;
}

export interface DynamicDisplayItem {
  id: string;
  title: string;       // العنوان
  details: string;     // التفاصيل
  visible: boolean;    // إظهار أو إخفاء
}

export function getDynamicItems(settings: any): DynamicDisplayItem[] {
  if (Array.isArray(settings?.dynamic_items) && settings.dynamic_items.length > 0) {
    return settings.dynamic_items
      .map((it: any) => ({
        id: String(it.id || Math.random()),
        title: String(it.title || it.q || "").trim(),
        details: String(it.details || it.a || "").trim(),
        visible: it.visible !== false,
      }))
      .filter((it: DynamicDisplayItem) => it.title || it.details);
  }
  if (Array.isArray(settings?.custom_faqs) && settings.custom_faqs.length > 0) {
    return settings.custom_faqs
      .map((f: any) => ({
        id: String(f.id || Math.random()),
        title: String(f.title || f.q || "").trim(),
        details: String(f.details || f.a || "").trim(),
        visible: f.visible !== false,
      }))
      .filter((it: DynamicDisplayItem) => it.title || it.details);
  }
  return [];
}

export interface DisplaySettings {
  dynamic_items?: DynamicDisplayItem[];
  ticker_text?: string;
  show_estimated_time?: boolean;
  show_oil_prices?: boolean;
  show_sell_price?: boolean;
  show_buy_price?: boolean;
  show_clock?: boolean;
  show_bags_count?: boolean;
  show_faqs?: boolean;
  custom_faqs?: CustomFaq[];
}

export const defaultDisplaySettings: DisplaySettings = {
  dynamic_items: [
    { id: "1", title: "سعر الزيت بيع", details: "25 ₪", visible: true },
    { id: "2", title: "رقم التواصل مع المعصرة", details: "0569945677", visible: true },
  ],
  ticker_text: "",
  show_estimated_time: true,
  show_oil_prices: true,
  show_sell_price: true,
  show_buy_price: true,
  show_clock: true,
  show_bags_count: true,
  show_faqs: true,
  custom_faqs: [],
};

const BROADCAST_CHANNEL_NAME = "smart_mill_display_channel";

export function useDisplaySettings(seasonId?: string | null) {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(defaultDisplaySettings);
  const [saving, setSaving] = useState(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Setup broadcast channel
  useEffect(() => {
    try {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data?.type === "UPDATE_DISPLAY_SETTINGS" && event.data.settings) {
          if (!event.data.seasonId || !seasonId || event.data.seasonId === seasonId) {
            setDisplaySettings((prev) => ({
              ...prev,
              ...event.data.settings,
            }));
          }
        }
      };
    } catch {
      // BroadcastChannel might not be supported in older environments
    }

    return () => {
      broadcastChannelRef.current?.close();
    };
  }, [seasonId]);

  // Load from local storage and DB
  const loadSettings = useCallback(async () => {
    if (!seasonId) return;

    // 1. Instant Cache from LocalStorage
    const localKey = `display_settings_${seasonId}`;
    const globalKey = "display_settings_global";
    const cached = localStorage.getItem(localKey) || localStorage.getItem(globalKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const dynamic_items = getDynamicItems(parsed);
        setDisplaySettings((prev) => ({
          ...defaultDisplaySettings,
          ...prev,
          ...parsed,
          dynamic_items: dynamic_items.length > 0 ? dynamic_items : defaultDisplaySettings.dynamic_items,
        }));
      } catch {}
    }

    // 2. Fetch from Supabase seasons table
    try {
      const { data } = await supabase
        .from("seasons")
        .select("display_settings")
        .eq("id", seasonId)
        .maybeSingle();

      if (data && (data as any).display_settings && typeof (data as any).display_settings === "object") {
        const ds = (data as any).display_settings;
        const dynamic_items = getDynamicItems(ds);
        const merged: DisplaySettings = {
          ...defaultDisplaySettings,
          ...ds,
          dynamic_items: dynamic_items.length > 0 ? dynamic_items : defaultDisplaySettings.dynamic_items,
        };
        setDisplaySettings(merged);
        localStorage.setItem(localKey, JSON.stringify(merged));
      }
    } catch {}
  }, [seasonId]);

  useEffect(() => {
    loadSettings();

    // Listen to storage event (cross-tab sync)
    const handleStorage = (e: StorageEvent) => {
      if (e.key && (e.key.includes("display_settings") || e.key === "display_settings_global")) {
        loadSettings();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Supabase Realtime subscription on seasons table
    let channel: any = null;
    if (seasonId) {
      channel = supabase
        .channel(`display-settings-hook-${seasonId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "seasons", filter: `id=eq.${seasonId}` },
          (payload) => {
            if (payload.new && (payload.new as any).display_settings) {
              const ds = (payload.new as any).display_settings;
              setDisplaySettings((prev) => ({
                ...prev,
                ...ds,
              }));
              localStorage.setItem(`display_settings_${seasonId}`, JSON.stringify(ds));
            }
          }
        )
        .subscribe();
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (channel) supabase.removeChannel(channel);
    };
  }, [seasonId, loadSettings]);

  // Persist to storage, broadcast, and Supabase
  const persistSettings = useCallback(
    async (newSettings: DisplaySettings) => {
      if (!seasonId) return;

      const localKey = `display_settings_${seasonId}`;
      localStorage.setItem(localKey, JSON.stringify(newSettings));
      localStorage.setItem("display_settings_global", JSON.stringify(newSettings));

      // Broadcast to other tabs immediately
      try {
        broadcastChannelRef.current?.postMessage({
          type: "UPDATE_DISPLAY_SETTINGS",
          seasonId,
          settings: newSettings,
        });
      } catch {}

      // Debounced DB persist
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await supabase
            .from("seasons")
            .update({ display_settings: newSettings } as any)
            .eq("id", seasonId);
        } catch {
        } finally {
          setSaving(false);
        }
      }, 300);
    },
    [seasonId]
  );

  const updateSetting = useCallback(
    <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) => {
      setDisplaySettings((prev) => {
        const next = { ...prev, [key]: value };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings]
  );

  const saveAll = useCallback(
    async (settingsToSave: DisplaySettings) => {
      setDisplaySettings(settingsToSave);
      await persistSettings(settingsToSave);
    },
    [persistSettings]
  );

  return {
    displaySettings,
    setDisplaySettings,
    updateSetting,
    saveAll,
    loadSettings,
    saving,
  };
}
