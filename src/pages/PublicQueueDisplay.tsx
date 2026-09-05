import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseEstimatedMinutes, parseStartedAt } from "@/lib/queueUtils";


interface QueueItem {
  id: string;
  name: string;
  position: number;
  status: string;
  bags: number;
  estimated_minutes?: number | null;
  started_at?: string | null;
  notes?: string | null;
}

import { DisplaySettings, defaultDisplaySettings } from "@/hooks/useDisplaySettings";

interface SeasonInfo {
  name: string;
  oil_buy_price: number;
  oil_sell_price: number;
  return_percent: number;
  plastic_container_price: number;
  metal_container_price: number;
  display_settings?: DisplaySettings | null;
}

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function PublicQueueDisplay() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [millName, setMillName] = useState<string>(() => {
    return (
      localStorage.getItem("mill_name") ||
      localStorage.getItem("profile_mill_name") ||
      "المعصرة"
    );
  });
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(defaultDisplaySettings);
  const [prevProcessingId, setPrevProcessingId] = useState<string | null>(null);
  const [fadeKey, setFadeKey] = useState(0);
  const [faqIndex, setFaqIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clock = useClock();

  const fetchData = async () => {
    if (!seasonId) return;

    // Load from local storage cache first for instant response
    let localItems: any[] = [];
    try {
      const cachedSettings = localStorage.getItem(`display_settings_${seasonId}`);
      if (cachedSettings) {
        setDisplaySettings({ ...defaultDisplaySettings, ...JSON.parse(cachedSettings) });
      }
      const cachedQueue = localStorage.getItem(`active_queue_${seasonId}`);
      if (cachedQueue) {
        localItems = JSON.parse(cachedQueue);
      }
    } catch {}

    // Multi-source fetching: Try direct select first, fallback to RPC, and load display_settings
    let rawQueue: any[] = [];
    const [tableRes, queueRes, seasonRes, seasonSettingsRes] = await Promise.all([
      supabase
        .from("queue")
        .select("*")
        .eq("season_id", seasonId)
        .order("position", { ascending: true }),
      supabase.rpc("get_public_queue", { p_season_id: seasonId }),
      supabase.rpc("get_public_season_display", { p_season_id: seasonId }),
      supabase
        .from("seasons")
        .select("user_id, display_settings")
        .eq("id", seasonId)
        .maybeSingle(),
    ]);

    if (tableRes.data && Array.isArray(tableRes.data) && tableRes.data.length > 0) {
      rawQueue = tableRes.data;
    } else if (queueRes.data && Array.isArray(queueRes.data)) {
      rawQueue = queueRes.data;
    } else if (localItems.length > 0) {
      rawQueue = localItems;
    }

    // Fetch mill name from profile if available
    if (seasonSettingsRes.data && (seasonSettingsRes.data as any).user_id) {
      const uId = (seasonSettingsRes.data as any).user_id;
      supabase
        .from("profiles")
        .select("mill_name")
        .or(`id.eq.${uId},user_id.eq.${uId}`)
        .limit(1)
        .maybeSingle()
        .then(({ data: prof }) => {
          if (prof?.mill_name) {
            setMillName(prof.mill_name);
            try {
              localStorage.setItem("mill_name", prof.mill_name);
            } catch {}
          }
        });
    }

    // Update display settings from DB if available
    if (seasonSettingsRes.data && (seasonSettingsRes.data as any).display_settings) {
      const dbSettings = (seasonSettingsRes.data as any).display_settings;
      if (typeof dbSettings === "object") {
        setDisplaySettings((prev) => ({ ...defaultDisplaySettings, ...dbSettings }));
        try {
          localStorage.setItem(`display_settings_${seasonId}`, JSON.stringify(dbSettings));
        } catch {}
      }
    }

    // Map queue items and ensure estimated_minutes & started_at are extracted accurately
    const mappedItems: QueueItem[] = rawQueue.map((i, idx) => {
      const localMatch = localItems.find((l) => l.id === i.id || (l.name && l.name.trim() === i.name?.trim()));
      
      const localEst = (i.id ? localStorage.getItem(`queue_est_${i.id}`) : null) ||
                       (i.name ? localStorage.getItem(`queue_est_name_${i.name.trim()}`) : null) ||
                       (localMatch ? parseEstimatedMinutes(localMatch) : null);

      const localStart = (i.id ? localStorage.getItem(`processing_started_${i.id}`) : null) ||
                         (localMatch ? parseStartedAt(localMatch) : null);

      const parsedEst = parseEstimatedMinutes(i) ?? (localEst ? Number(localEst) : null);
      const parsedStart = parseStartedAt(i) ?? (localStart ? (typeof localStart === "number" ? new Date(localStart).toISOString() : localStart) : null);

      let pos = Number(i.queue_position ?? i.position);
      if (isNaN(pos) || pos <= 0) {
        pos = idx + 1;
      }

      const item: QueueItem = {
        id: i.id,
        name: i.name,
        position: pos,
        status: i.status,
        bags: i.bags,
        notes: i.notes || localMatch?.notes || null,
        started_at: parsedStart,
        estimated_minutes: parsedEst,
      };

      // If it's processing and has no started_at stored, record locally so timer starts immediately
      if (item.status === "processing") {
        if (!item.started_at && item.id) {
          const nowIso = new Date().toISOString();
          localStorage.setItem(`processing_started_${item.id}`, nowIso);
          item.started_at = nowIso;
        }
        if (!item.estimated_minutes) {
          item.estimated_minutes = 30;
          if (item.id) localStorage.setItem(`queue_est_${item.id}`, "30");
        }
      }
      return item;
    });
    mappedItems.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
    setItems(mappedItems);

    const seasonRow = (seasonRes.data as any[] | null)?.[0];
    if (seasonRow) {
      setSeason(seasonRow);
      if (seasonRow.display_settings && typeof seasonRow.display_settings === "object") {
        setDisplaySettings({ ...defaultDisplaySettings, ...seasonRow.display_settings });
      }
    }
  };

  // Compile dynamic or fallback FAQs
  const activeFaqs = (() => {
    if (displaySettings.custom_faqs && displaySettings.custom_faqs.length > 0) {
      return displaySettings.custom_faqs;
    }
    if (season) {
      return [
        { q: "كيف يُحسب الرد؟", a: `${season.return_percent}% من كمية الزيت المنتج` },
        { q: "سعر تنكة البلاستيك؟", a: `${season.plastic_container_price} ₪` },
        { q: "سعر تنكة الحديد؟", a: `${season.metal_container_price} ₪` },
        { q: "هل يمكن تأجيل الدور؟", a: "نعم، بالتنسيق مع مسؤول الطابور" },
      ];
    }
    return [];
  })();

  useEffect(() => {
    if (activeFaqs.length === 0) return;
    const id = setInterval(() => setFaqIndex((i) => (i + 1) % activeFaqs.length), 8000);
    return () => clearInterval(id);
  }, [activeFaqs.length]);

  // Realtime BroadcastChannel listener for instant live toggle sync (0ms latency)
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("smart_mill_display_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "UPDATE_DISPLAY_SETTINGS" && event.data.settings) {
          if (!event.data.seasonId || !seasonId || event.data.seasonId === seasonId) {
            setDisplaySettings((prev) => ({
              ...prev,
              ...event.data.settings,
            }));
          }
        }
      };
    } catch {}

    return () => {
      bc?.close();
    };
  }, [seasonId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);

    // Cross-tab instant synchronization
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key?.includes("display_settings") ||
        e.key?.includes("active_queue") ||
        e.key?.includes("processing_started") ||
        e.key?.includes("queue_est")
      ) {
        fetchData();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, [seasonId]);

  // Realtime changes on both queue and seasons table
  useEffect(() => {
    if (!seasonId) return;
    const channel = supabase
      .channel(`public-display-${seasonId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue" }, () => fetchData())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seasons", filter: `id=eq.${seasonId}` },
        (payload) => {
          if (payload.new && (payload.new as any).display_settings) {
            const ds = (payload.new as any).display_settings;
            if (typeof ds === "object") {
              setDisplaySettings((prev) => ({ ...prev, ...ds }));
            }
          }
          fetchData();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [seasonId]);

  const currentItem = items.find((i) => i.status === "processing");
  const waitingItems = items.filter((i) => i.status === "waiting");
  const nextFive = waitingItems.slice(0, 5);

  // Sound notification on processing change
  useEffect(() => {
    if (currentItem && currentItem.id !== prevProcessingId) {
      setPrevProcessingId(currentItem.id);
      setFadeKey((k) => k + 1);
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(
            "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip2teleAkKSsi2lJPVqBmq2bjGdHQFuCla+fkm5OQlmBk6+hlnZVQ1d/ka2hl3xbRVZ9jqmgloBhSFV7i6WdsHxhPlN4h6GevndiN0h4gZ2dwXRZMkJ0fJeYtXBRK0NwdpOTs25NKERycJGQrm1KJ0ZycY+Oq2xJJkZzco+Oq21JJ0d0c4+Oqm1KKEh1dJCPqG1LKkl2dpGRpm1NK0t3d5OSo21PLUx5eJOTo2xQLk16eZSUoWtRME57epWVn2tSMVB8e5aWnmpTMlF9fJeXnGpUNFJ+fZiYm2lVNVN/fpmZmmhWNlSAf5qamWdXN1WBgJubl2ZYOFeChJybleVZOViDhZ2dlONaOlmEhp6ek+FbPFqFh5+fkeBcPVuGiKCgj99ePlyHiaChjt5fP12Iiquan95gQF6JiqsA"
          );
        }
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      } catch {}
    } else if (!currentItem) {
      setPrevProcessingId(null);
    }
  }, [currentItem?.id]);

  const nowMs = clock.getTime();
  const hours = String(clock.getHours()).padStart(2, "0");
  const minutes = String(clock.getMinutes()).padStart(2, "0");

  // Calculate live second-by-second countdown for current processing customer
  const currentEstMin = currentItem
    ? (currentItem.estimated_minutes ||
       parseEstimatedMinutes(currentItem) ||
       (currentItem.id ? Number(localStorage.getItem(`queue_est_${currentItem.id}`)) : null) ||
       (currentItem.name ? Number(localStorage.getItem(`queue_est_name_${currentItem.name.trim()}`)) : null) ||
       30)
    : null;
  const currentStartedAt = currentItem ? parseStartedAt(currentItem) : null;

  let currentRemainingSeconds: number | null = null;
  let remainingText = "30:00";

  if (currentItem && currentEstMin && currentEstMin > 0) {
    let startMs = currentStartedAt;
    if (!startMs && currentItem.id) {
      const localKey = `processing_started_${currentItem.id}`;
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const parsed = new Date(saved).getTime();
        if (!isNaN(parsed)) startMs = parsed;
      }
      if (!startMs) {
        startMs = Date.now();
        localStorage.setItem(localKey, new Date(startMs).toISOString());
      }
    }
    startMs = startMs || nowMs;
    const totalSec = currentEstMin * 60;
    const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    currentRemainingSeconds = Math.max(0, totalSec - elapsedSec);

    const m = Math.floor(currentRemainingSeconds / 60);
    const s = currentRemainingSeconds % 60;
    const padM = String(m).padStart(2, "0");
    const padS = String(s).padStart(2, "0");

    if (currentRemainingSeconds > 0) {
      remainingText = `${padM}:${padS}`;
    } else {
      remainingText = "00:00 (المراحل الأخيرة)";
    }
  }

  const nextItem = waitingItems[0] || null;

  const formattedDate = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(clock);

  const hasBottomPrices =
    displaySettings.show_oil_prices &&
    season &&
    (displaySettings.show_buy_price || displaySettings.show_sell_price);

  const showBottomBar =
    hasBottomPrices ||
    (season && (season.plastic_container_price > 0 || season.return_percent > 0)) ||
    (displaySettings.show_faqs && activeFaqs.length > 0);

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col font-sans select-none text-foreground"
      dir="rtl"
      style={{
        background: "radial-gradient(ellipse at 50% 20%, #082411 0%, #031207 50%, #010803 100%)",
      }}
    >
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-6 md:px-10 pt-4 pb-2.5 shrink-0 flex-wrap gap-3 z-10">
        {/* اعلى اليمين: اسم المعصرة وتحته بخط اصغر اسم الموسم */}
        <div className="flex items-center gap-3">
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse shrink-0" />
          <div className="flex flex-col text-right">
            <span className="text-white text-2xl md:text-3xl font-black tracking-wide drop-shadow-md">
              {millName || "معصرة الزيتون"}
            </span>
            <span className="text-emerald-400/90 text-sm md:text-base font-bold tracking-wider mt-0.5">
              {season?.name || "نظام إدارة الطابور المباشر"}
            </span>
          </div>
        </div>

        {/* اعلى اليسار: الساعة والتاريخ */}
        {displaySettings.show_clock && (
          <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] px-5 py-2 rounded-2xl backdrop-blur-md shadow-inner">
            <div className="flex flex-col items-end text-left font-mono">
              <span
                className="text-white text-3xl md:text-4xl font-black tracking-wider leading-none"
                style={{ textShadow: "0 0 20px rgba(255,255,255,0.25)" }}
              >
                {hours}:{minutes}
              </span>
              <span className="text-emerald-400/80 text-xs md:text-sm font-sans font-medium mt-1">
                {formattedDate}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Subtle Divider */}
      <div
        className="mx-6 md:mx-10 h-px shrink-0"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.35), transparent)",
        }}
      />

      {/* Main Split Content: Twin Windows (الدور الحالي - الدور التالي) */}
      <main className="flex-1 min-h-0 flex overflow-hidden p-4 md:p-6 gap-5 md:gap-6">
        {/* RIGHT COLUMN — Currently Processing (الدور الحالي) */}
        <div
          className="flex-1 flex flex-col justify-between items-center relative rounded-3xl p-5 md:p-7 shadow-2xl backdrop-blur-sm overflow-hidden text-center"
          style={{
            background: "linear-gradient(170deg, rgba(16,185,129,0.18) 0%, rgba(4,47,21,0.45) 100%)",
            border: "2px solid rgba(52,211,153,0.45)",
            boxShadow: "0 0 70px rgba(16,185,129,0.15), inset 0 1px 1px rgba(255,255,255,0.1)",
          }}
        >
          {/* Ambient Glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-[450px] h-[450px] rounded-full opacity-20 blur-[110px]"
              style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }}
            />
          </div>

          {currentItem ? (
            <div
              key={fadeKey}
              className="relative z-10 flex flex-col justify-between items-center w-full h-full text-center"
              style={{ animation: "qd-fade-scale 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
            >
              {/* Header Badge */}
              <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-base md:text-lg uppercase tracking-wider shadow-sm shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>الدور الحالي قيد العصر</span>
              </div>

              {/* Core Hero Info (Number + Name + Bags) */}
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center my-auto w-full py-2">
                {/* Big Turn Number */}
                <span
                  className="font-black text-white leading-none drop-shadow-2xl select-none shrink-0"
                  style={{
                    fontSize: "clamp(5.5rem, 11vh, 9.5rem)",
                    textShadow: "0 0 60px rgba(52,211,153,0.5), 0 4px 0 rgba(0,0,0,0.4)",
                    lineHeight: 0.9,
                  }}
                >
                  {currentItem.position}
                </span>

                {/* Customer Name */}
                <span
                  className="text-white text-3xl md:text-4xl lg:text-5xl font-black mt-3 tracking-wide truncate max-w-full px-4 drop-shadow"
                  style={{ textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}
                >
                  {currentItem.name}
                </span>

                {/* Bags Badge */}
                {displaySettings.show_bags_count && currentItem.bags > 0 && (
                  <span className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white/10 text-white/95 text-base md:text-lg font-bold border border-white/15 backdrop-blur-md shadow-sm">
                    🛍️ {currentItem.bags} شوال
                  </span>
                )}
              </div>

              {/* Bottom Operational Countdown Timer */}
              {displaySettings.show_estimated_time && (
                <div className="w-full shrink-0 pt-1">
                  <div className="inline-flex items-center justify-center gap-3 md:gap-4 px-6 md:px-8 py-2 md:py-2.5 rounded-2xl border-2 shadow-xl bg-amber-500/15 text-amber-200 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.2)] max-w-full">
                    <span className="text-xl md:text-2xl shrink-0">⏳</span>
                    <span className="text-sm md:text-base font-bold whitespace-nowrap">
                      الوقت التقديري المتبقي:
                    </span>
                    <span
                      className="text-white font-mono text-2xl md:text-3xl font-black tracking-widest drop-shadow shrink-0"
                      dir="ltr"
                    >
                      {remainingText}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-center my-auto">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center shadow-inner"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <span className="text-4xl opacity-40">🫒</span>
              </div>
              <p className="text-white/30 text-2xl font-bold tracking-wide">لا يوجد عصر حالياً</p>
              <p className="text-white/15 text-sm">بانتظار بدء الزبون القادم في الطابور</p>
            </div>
          )}
        </div>

        {/* LEFT COLUMN — Next Turn (الدور التالي) - Identical Twin to Right Column */}
        <div
          className="flex-1 flex flex-col justify-between items-center relative rounded-3xl p-5 md:p-7 shadow-2xl backdrop-blur-sm overflow-hidden text-center"
          style={{
            background: "linear-gradient(170deg, rgba(16,185,129,0.18) 0%, rgba(4,47,21,0.45) 100%)",
            border: "2px solid rgba(52,211,153,0.45)",
            boxShadow: "0 0 70px rgba(16,185,129,0.15), inset 0 1px 1px rgba(255,255,255,0.1)",
          }}
        >
          {/* Ambient Glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-[450px] h-[450px] rounded-full opacity-20 blur-[110px]"
              style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }}
            />
          </div>

          {nextItem ? (
            <div
              className="relative z-10 flex flex-col justify-between items-center w-full h-full text-center"
              style={{ animation: "qd-fade-scale 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
            >
              {/* Header Badge */}
              <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-base md:text-lg uppercase tracking-wider shadow-sm shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>الدور التالي</span>
              </div>

              {/* Core Hero Info (Number + Name + Bags) */}
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center my-auto w-full py-2">
                {/* Big Turn Number */}
                <span
                  className="font-black text-white leading-none drop-shadow-2xl select-none shrink-0"
                  style={{
                    fontSize: "clamp(5.5rem, 11vh, 9.5rem)",
                    textShadow: "0 0 60px rgba(52,211,153,0.5), 0 4px 0 rgba(0,0,0,0.4)",
                    lineHeight: 0.9,
                  }}
                >
                  {nextItem.position}
                </span>

                {/* Customer Name */}
                <span
                  className="text-white text-3xl md:text-4xl lg:text-5xl font-black mt-3 tracking-wide truncate max-w-full px-4 drop-shadow"
                  style={{ textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}
                >
                  {nextItem.name}
                </span>

                {/* Bags Badge */}
                {displaySettings.show_bags_count && nextItem.bags > 0 && (
                  <span className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white/10 text-white/95 text-base md:text-lg font-bold border border-white/15 backdrop-blur-md shadow-sm">
                    🛍️ {nextItem.bags} شوال
                  </span>
                )}
              </div>

              {/* Bottom Operational Expected Time */}
              {displaySettings.show_estimated_time && (
                <div className="w-full shrink-0 pt-1">
                  <div className="inline-flex items-center justify-center gap-3 md:gap-4 px-6 md:px-8 py-2 md:py-2.5 rounded-2xl border-2 shadow-xl bg-amber-500/15 text-amber-200 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.2)] max-w-full">
                    <span className="text-xl md:text-2xl shrink-0">⏳</span>
                    <span className="text-sm md:text-base font-bold whitespace-nowrap">
                      الوقت المتوقع للدور:
                    </span>
                    <span
                      className="text-white font-mono text-2xl md:text-3xl font-black tracking-widest drop-shadow shrink-0"
                      dir="ltr"
                    >
                      {nextItem.estimated_minutes ? `${nextItem.estimated_minutes}:00` : "30:00"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-center my-auto">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center shadow-inner"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <span className="text-4xl opacity-40">✨</span>
              </div>
              <p className="text-white/30 text-2xl font-bold tracking-wide">لا يوجد دور تالٍ</p>
              <p className="text-white/15 text-sm">قائمة الانتظار فارغة حالياً</p>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Info Bar — Information distributed evenly across the screen */}
      {showBottomBar && (
        <div
          className="mx-6 md:mx-10 mb-2.5 rounded-2xl px-6 md:px-12 py-3 flex items-center justify-between gap-4 md:gap-8 backdrop-blur-md shadow-xl shrink-0"
          style={{
            background: "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Oil Buy Price */}
          {displaySettings.show_buy_price && season?.oil_buy_price != null && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-xs uppercase tracking-wider font-bold text-emerald-300/80 mb-0.5">
                شراء الزيت
              </p>
              <p className="text-2xl md:text-3xl font-black text-emerald-300">
                {season.oil_buy_price}{" "}
                <span className="text-xs font-medium opacity-70">₪/كغم</span>
              </p>
            </div>
          )}

          {displaySettings.show_buy_price && displaySettings.show_sell_price && (
            <div className="w-px h-10 bg-white/10 shrink-0" />
          )}

          {/* Oil Sell Price */}
          {displaySettings.show_sell_price && season?.oil_sell_price != null && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-xs uppercase tracking-wider font-bold text-amber-300/80 mb-0.5">
                بيع الزيت
              </p>
              <p className="text-2xl md:text-3xl font-black text-amber-300">
                {season.oil_sell_price}{" "}
                <span className="text-xs font-medium opacity-70">₪/كغم</span>
              </p>
            </div>
          )}

          {/* Plastic Container Price */}
          {season?.plastic_container_price != null && season.plastic_container_price > 0 && (
            <>
              <div className="w-px h-10 bg-white/10 shrink-0" />
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className="text-xs uppercase tracking-wider font-bold text-white/60 mb-0.5">
                  سعر تنكة البلاستيك
                </p>
                <p className="text-2xl md:text-3xl font-black text-white">
                  {season.plastic_container_price}{" "}
                  <span className="text-xs font-medium opacity-70">₪</span>
                </p>
              </div>
            </>
          )}

          {/* Metal Container Price */}
          {season?.metal_container_price != null && season.metal_container_price > 0 && (
            <>
              <div className="w-px h-10 bg-white/10 shrink-0" />
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className="text-xs uppercase tracking-wider font-bold text-white/60 mb-0.5">
                  سعر تنكة الحديد
                </p>
                <p className="text-2xl md:text-3xl font-black text-white">
                  {season.metal_container_price}{" "}
                  <span className="text-xs font-medium opacity-70">₪</span>
                </p>
              </div>
            </>
          )}

          {/* Return Percentage */}
          {season?.return_percent != null && season.return_percent > 0 && (
            <>
              <div className="w-px h-10 bg-white/10 shrink-0" />
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className="text-xs uppercase tracking-wider font-bold text-white/60 mb-0.5">
                  نسبة الرد
                </p>
                <p className="text-2xl md:text-3xl font-black text-white">
                  %{season.return_percent}
                </p>
              </div>
            </>
          )}

          {/* Dynamic Rotating FAQs / Tips */}
          {displaySettings.show_faqs && activeFaqs.length > 0 && (
            <>
              <div className="w-px h-10 bg-white/10 shrink-0" />
              <div className="flex-1 flex flex-col items-center justify-center text-center overflow-hidden">
                <div key={faqIndex} style={{ animation: "qd-faq-fade 0.4s ease-out" }}>
                  <p className="text-xs font-bold text-white/50 flex items-center justify-center gap-1.5 mb-0.5">
                    <span>💡</span>
                    <span>{activeFaqs[faqIndex].q}</span>
                  </p>
                  <p className="text-base md:text-lg font-bold text-white/95 truncate">
                    {activeFaqs[faqIndex].a}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* News / Announcement Ticker — Larger Size and Faster Speed */}
      {displaySettings.ticker_text && displaySettings.ticker_text.trim() && (
        <div className="w-full bg-emerald-950 border-t-2 border-emerald-500/40 py-2.5 md:py-3 px-6 overflow-hidden flex items-center shrink-0 z-20 shadow-[0_-5px_25px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2.5 shrink-0 z-10 pe-5 bg-emerald-950">
            <span className="bg-emerald-400 text-black text-sm md:text-base font-black px-3.5 py-1 rounded-xl uppercase tracking-wider flex items-center gap-2 shadow-md">
              <span className="w-2.5 h-2.5 rounded-full bg-black animate-ping" />
              إعلان المعصرة
            </span>
          </div>
          <div className="flex-1 overflow-hidden whitespace-nowrap relative">
            <div className="inline-block animate-marquee-arabic text-emerald-100 font-extrabold text-xl md:text-2xl lg:text-3xl tracking-wide">
              {displaySettings.ticker_text}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes qd-fade-scale {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes qd-slide-up {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes qd-faq-fade {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes marquee-arabic {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee-arabic {
          display: inline-block;
          animation: marquee-arabic 13s linear infinite;
        }
      `}</style>
    </div>
  );
}

