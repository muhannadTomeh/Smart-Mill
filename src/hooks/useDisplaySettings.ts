import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CustomFaq {
  id: string;
  q: string;
  a: string;
}

export interface DisplaySettings {
  show_estimated_time: boolean;
  show_oil_prices: boolean;
  show_sell_price: boolean;
  show_buy_price: boolean;
  show_clock: boolean;
  show_bags_count: boolean;
  show_faqs: boolean;
  ticker_text?: string;
  custom_faqs?: CustomFaq[];
}

export const defaultDisplaySettings: DisplaySettings = {
  show_estimated_time: true,
  show_oil_prices: true,
  show_sell_price: true,
  show_buy_price: true,
  show_clock: true,
  show_bags_count: true,
  show_faqs: true,
  ticker_text: "",
  custom_faqs: [
    { id: "1", q: "كيف يُحسب الرد؟", a: "نسبة مئوية من كمية الزيت المنتج" },
    { id: "2", q: "سعر تنكة البلاستيك والحديد؟", a: "متوفرة بجودة عالية ومطابقة للمواصفات" },
    { id: "3", q: "هل يمكن تأجيل الدور؟", a: "نعم، بالتنسيق مع مسؤول الطابور" },
  ],
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
        setDisplaySettings((prev) => ({
          ...defaultDisplaySettings,
          ...parsed,
          custom_faqs: Array.isArray(parsed.custom_faqs) ? parsed.custom_faqs : defaultDisplaySettings.custom_faqs,
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
        const merged: DisplaySettings = {
          ...defaultDisplaySettings,
          ...ds,
          custom_faqs: Array.isArray(ds.custom_faqs) ? ds.custom_faqs : defaultDisplaySettings.custom_faqs,
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
