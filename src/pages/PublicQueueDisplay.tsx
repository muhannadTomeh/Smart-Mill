import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface QueueItem {
  id: string;
  name: string;
  position: number;
  status: string;
  bags: number;
}

interface SeasonInfo {
  name: string;
  oil_buy_price: number;
  oil_sell_price: number;
  return_percent: number;
  plastic_container_price: number;
  metal_container_price: number;
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
  const [prevProcessingId, setPrevProcessingId] = useState<string | null>(null);
  const [fadeKey, setFadeKey] = useState(0);
  const [faqIndex, setFaqIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clock = useClock();

  const fetchData = async () => {
    if (!seasonId) return;
    const [queueRes, seasonRes] = await Promise.all([
      supabase.rpc("get_public_queue", { p_season_id: seasonId }),
      supabase.rpc("get_public_season_display", { p_season_id: seasonId }),
    ]);
    setItems((queueRes.data as QueueItem[]) || []);
    const seasonRow = (seasonRes.data as SeasonInfo[] | null)?.[0];
    if (seasonRow) setSeason(seasonRow);
  };


  const faqs = season
    ? [
        { q: "كيف يُحسب الرد؟", a: `${season.return_percent}% من كمية الزيت المنتج` },
        { q: "سعر تنكة البلاستيك؟", a: `${season.plastic_container_price} ₪` },
        { q: "سعر تنكة الحديد؟", a: `${season.metal_container_price} ₪` },
        { q: "هل يمكن تأجيل الدور؟", a: "نعم، تواصل مع المسؤول" },
      ]
    : [];

  useEffect(() => {
    if (faqs.length === 0) return;
    const id = setInterval(() => setFaqIndex((i) => (i + 1) % faqs.length), 8000);
    return () => clearInterval(id);
  }, [faqs.length]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [seasonId]);

  useEffect(() => {
    if (!seasonId) return;
    const channel = supabase
      .channel("public-queue-display")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
          audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip2teleAkKSsi2lJPVqBmq2bjGdHQFuCla+fkm5OQlmBk6+hlnZVQ1d/ka2hl3xbRVZ9jqmgloBhSFV7i6WdsHxhPlN4h6GevndiN0h4gZ2dwXRZMkJ0fJeYtXBRK0NwdpOTs25NKERycJGQrm1KJ0ZycY+Oq2xJJkZzco+Oq21JJ0d0c4+Oqm1KKEh1dJCPqG1LKkl2dpGRpm1NK0t3d5OSo21PLUx5eJOTo2xQLk16eZSUoWtRME57epWVn2tSMVB8e5aWnmpTMlF9fJeXnGpUNFJ+fZiYm2lVNVN/fpmZmmhWNlSAf5qamWdXN1WBgJubl2ZYOFeChJybleVZOViDhZ2dlONaOlmEhp6ek+FbPFqFh5+fkeBcPVuGiKCgj99ePlyHiaChjt5fP12Iiquan95gQF6JiqsA");
        }
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      } catch {}
    } else if (!currentItem) {
      setPrevProcessingId(null);
    }
  }, [currentItem?.id]);

  const hours = String(clock.getHours()).padStart(2, "0");
  const minutes = String(clock.getMinutes()).padStart(2, "0");

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col"
      dir="rtl"
      style={{ background: "linear-gradient(160deg, #020a04 0%, #0a1f10 40%, #0d2914 70%, #061208 100%)" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-10 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-white/40 text-lg font-medium">
            {season?.name || "المعصرة الذكية"}
          </span>
        </div>
        <div className="font-mono">
          <span
            className="text-white/80 text-5xl font-bold tracking-widest"
            style={{ textShadow: "0 0 20px rgba(255,255,255,0.1)" }}
          >
            {hours}:{minutes}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-10 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.2), transparent)" }} />

      {/* Main split layout — equal halves */}
      <div className="flex-1 flex overflow-hidden">
        {/* RIGHT — Currently Processing */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-[500px] h-[500px] rounded-full opacity-15 blur-[120px]"
              style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)" }}
            />
          </div>

          {currentItem ? (
            <div
              key={fadeKey}
              className="relative z-10 flex flex-col items-center gap-6 w-full px-12"
              style={{ animation: "qd-fade-scale 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
            >
              <p
                className="text-xl font-bold tracking-widest uppercase"
                style={{ color: "#6ee7b7", letterSpacing: "0.3em" }}
              >
                الدور الحالي
              </p>

              <div
                className="w-full max-w-lg rounded-[2.5rem] p-8 flex flex-col items-center"
                style={{
                  background: "linear-gradient(160deg, rgba(22,101,52,0.45) 0%, rgba(5,46,22,0.55) 100%)",
                  border: "2px solid rgba(74,222,128,0.25)",
                  boxShadow: "0 0 80px rgba(34,197,94,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-64 rounded-full blur-[80px] opacity-25" style={{ background: "#22c55e" }} />
                </div>

                <span
                  className="relative font-black text-white leading-none"
                  style={{
                    fontSize: "clamp(10rem, 20vw, 18rem)",
                    textShadow: "0 0 100px rgba(74,222,128,0.35), 0 4px 0 rgba(0,0,0,0.3)",
                    lineHeight: 0.85,
                  }}
                >
                  {currentItem.position}
                </span>

                <span
                  className="relative text-white text-4xl font-bold mt-6 tracking-wide"
                  style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                >
                  {currentItem.name}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div
                className="w-32 h-32 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="text-5xl"></span>
              </div>
              <p className="text-white/15 text-3xl font-light">لا يوجد عصر حالياً</p>
            </div>
          )}
        </div>

        {/* Vertical divider */}
        <div className="w-px my-8" style={{ background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.1), transparent)" }} />

        {/* LEFT — Next in Queue */}
        <div className="flex-1 flex flex-col px-8 py-8">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-3xl">⏳</span>
            <h2 className="text-3xl font-bold tracking-wide" style={{ color: "#fbbf24" }}>
              الدور القادم
            </h2>
            {waitingItems.length > 0 && (
              <span
                className="text-sm font-medium px-3 py-1 rounded-full"
                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}
              >
                {waitingItems.length}
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {nextFive.length > 0 ? (
              nextFive.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-6 rounded-2xl px-6 py-5 transition-all"
                  style={{
                    background: idx === 0
                      ? "linear-gradient(135deg, rgba(234,179,8,0.14) 0%, rgba(161,98,7,0.08) 100%)"
                      : "rgba(255,255,255,0.025)",
                    border: idx === 0
                      ? "1px solid rgba(250,204,21,0.3)"
                      : "1px solid rgba(255,255,255,0.05)",
                    animation: `qd-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.07}s both`,
                  }}
                >
                  <span
                    className="font-black leading-none flex-shrink-0 text-center"
                    style={{
                      fontSize: idx === 0 ? "5rem" : "3.5rem",
                      color: idx === 0 ? "#fbbf24" : "rgba(255,255,255,0.3)",
                      textShadow: idx === 0 ? "0 0 30px rgba(251,191,36,0.25)" : "none",
                      minWidth: "5rem",
                    }}
                  >
                    {item.position}
                  </span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span
                      className="font-semibold truncate"
                      style={{
                        fontSize: idx === 0 ? "2rem" : "1.5rem",
                        color: idx === 0 ? "#fef3c7" : "rgba(255,255,255,0.45)",
                      }}
                    >
                      {item.name}
                    </span>
                    {idx === 0 && (
                      <span className="text-sm font-medium" style={{ color: "rgba(251,191,36,0.6)" }}>
                        التالي
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-white/10 text-xl">لا يوجد منتظرين</p>
              </div>
            )}
          </div>

          {waitingItems.length > 5 && (
            <p className="text-white/20 text-base mt-4 text-center">
              +{waitingItems.length - 5} آخرين
            </p>
          )}
        </div>
      </div>

      {/* Bottom info bar — prices + rotating FAQ */}
      {season && (
        <div
          className="mx-10 mb-6 mt-2 rounded-2xl px-8 py-5 flex items-center gap-8"
          style={{
            background: "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest" style={{ color: "rgba(110,231,183,0.7)" }}>
                شراء الزيت
              </p>
              <p className="text-3xl font-bold" style={{ color: "#6ee7b7" }}>
                {season.oil_buy_price} <span className="text-lg opacity-60">₪/كغم</span>
              </p>
            </div>
            <div className="w-px h-12" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest" style={{ color: "rgba(251,191,36,0.7)" }}>
                بيع الزيت
              </p>
              <p className="text-3xl font-bold" style={{ color: "#fbbf24" }}>
                {season.oil_sell_price} <span className="text-lg opacity-60">₪/كغم</span>
              </p>
            </div>
          </div>

          <div className="w-px h-16" style={{ background: "rgba(255,255,255,0.08)" }} />

          <div className="flex-1 overflow-hidden">
            {faqs.length > 0 && (
              <div key={faqIndex} style={{ animation: "qd-faq-fade 0.6s ease-out" }}>
                <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>
                  ❓ {faqs[faqIndex].q}
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {faqs[faqIndex].a}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes qd-fade-scale {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes qd-slide-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes qd-faq-fade {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
