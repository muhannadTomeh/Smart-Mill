import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, CheckCircle, Sprout, Users, Plus, Receipt,
  Wallet, ArrowLeft, Droplets, DollarSign, UserPlus, Play, Eye, EyeOff,
  Package, Flame, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useNavigate } from "react-router-dom";
import { useRole } from "@/contexts/RoleContext";
import { Navigate } from "react-router-dom";
import {
  parseEstimatedMinutes,
  getRemainingSeconds,
  formatRemaining,
  formatTimeSafe,
  QueueItem
} from "@/lib/queueUtils";

export default function Dashboard() {
  const { isEmployee } = useRole();
  if (isEmployee) return <Navigate to="/queue" replace />;
  const { user, effectiveUserId } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { activeSeason } = useSeason();
  const { inventory } = useInventory();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    waitingCount: 0,
    doneCount: 0,
    todayExpenses: 0,
  });
  const [currentProcessing, setCurrentProcessing] = useState<QueueItem | null>(null);
  const [queuePreview, setQueuePreview] = useState<QueueItem[]>([]);
  const [showSensitive, setShowSensitive] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (targetUserId && activeSeason) {
      fetchStats();
      fetchQueueData();
    }
  }, [targetUserId, activeSeason]);

  const fetchStats = async () => {
    const today = new Date().toISOString().split("T")[0];
    const [waitingRes, doneRes, expenseRes] = await Promise.all([
      supabase
        .from("queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", targetUserId!)
        .eq("season_id", activeSeason!.id)
        .eq("status", "waiting"),
      supabase
        .from("queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", targetUserId!)
        .eq("season_id", activeSeason!.id)
        .eq("status", "completed")
        .gte("created_at", today),
      supabase
        .from("expenses")
        .select("amount")
        .eq("user_id", targetUserId!)
        .eq("season_id", activeSeason!.id)
        .gte("created_at", today),
    ]);

    setStats({
      waitingCount: waitingRes.count || 0,
      doneCount: doneRes.count || 0,
      todayExpenses: (expenseRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0),
    });
  };

  const fetchQueueData = async () => {
    // 1. Get current active processing customer
    const { data: procData } = await supabase
      .from("queue")
      .select("*")
      .eq("user_id", targetUserId!)
      .eq("season_id", activeSeason!.id)
      .eq("status", "processing")
      .order("position", { ascending: true })
      .limit(1);

    setCurrentProcessing(procData && procData.length > 0 ? (procData[0] as QueueItem) : null);

    // 2. Get first 5 waiting customers (read-only monitoring)
    const { data: waitData } = await supabase
      .from("queue")
      .select("*")
      .eq("user_id", targetUserId!)
      .eq("season_id", activeSeason!.id)
      .eq("status", "waiting")
      .order("position", { ascending: true })
      .limit(5);

    setQueuePreview((waitData as QueueItem[]) || []);
  };

  const statCards = [
    { label: "الرصيد", hint: "نقداً", value: `${inventory.total_cash.toFixed(0)} ₪`, icon: DollarSign, tone: "text-primary", bg: "bg-primary/10", sensitive: true },
    { label: "الزيت", hint: `${(inventory.total_oil / 16).toFixed(1)} تنكة`, value: `${inventory.total_oil.toFixed(1)} كغم`, icon: Droplets, tone: "text-[hsl(var(--primary-glow))]", bg: "bg-[hsl(var(--primary-glow))]/12" },
    { label: "في الطابور", hint: "زبون بانتظار العصر", value: stats.waitingCount, icon: Clock, tone: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/12" },
    { label: "تم الإنجاز", hint: "اليوم", value: stats.doneCount, icon: CheckCircle, tone: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/12" },
    { label: "مصاريف اليوم", hint: "شيكل", value: `${stats.todayExpenses} ₪`, icon: Wallet, tone: "text-destructive", bg: "bg-destructive/10", sensitive: true },
  ];

  const quickActions = [
    { label: "إضافة للطابور", desc: "تسجيل زبون جديد", icon: UserPlus, onClick: () => navigate("/queue"), primary: true },
    { label: "فتح الطابور", desc: "إدارة خط الإنتاج", icon: Clock, onClick: () => navigate("/queue") },
    { label: "إنشاء فاتورة", desc: "حساب الرد والأجرة", icon: Receipt, onClick: () => navigate("/invoices") },
    { label: "إضافة مصروف", desc: "تسجيل نفقات المعصرة", icon: Wallet, onClick: () => navigate("/expenses") },
  ];

  const procRemSec = currentProcessing ? getRemainingSeconds(currentProcessing, nowMs) : null;
  const procEstMin = currentProcessing ? parseEstimatedMinutes(currentProcessing) : null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-rise" dir="rtl">
      {/* Header */}
      <div className="relative overflow-hidden surface-card px-6 py-7">
        <div className="absolute inset-0 glow-gradient pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {activeSeason?.name ?? "لوحة المعصرة"}
            </p>
            <h1 className="text-3xl font-bold text-foreground mt-1.5">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground mt-1">نظرة عامة لحظية على أداء المعصرة وخط الإنتاج</p>
          </div>
          <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15 border-0 px-4 py-1.5 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary-glow))] animate-pulse ms-2" />
            النظام يعمل الآن
          </Badge>
        </div>
      </div>

      {/* Stats Grid: 5 Core Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card, i) => (
          <div
            key={i}
            className="surface-card p-5 hover:-translate-y-0.5 hover:shadow-olive transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-11 h-11 rounded-2xl ${card.bg} flex items-center justify-center`}>
                <card.icon className={`h-5 w-5 ${card.tone}`} />
              </div>
              {card.sensitive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSensitive(!showSensitive);
                  }}
                >
                  {showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-display font-bold text-foreground leading-none">
                {card.sensitive && !showSensitive ? "•••• ₪" : card.value}
              </span>
              <span className="text-[11px] text-muted-foreground/70">{card.hint}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Actions + Queue Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-display font-bold px-1">إجراءات سريعة</h2>
          <div className="flex flex-col gap-3">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className={`group flex items-center justify-between gap-4 w-full rounded-2xl p-4 text-right transition-all duration-300 ${
                  action.primary
                    ? "bg-primary text-primary-foreground shadow-olive hover:scale-[1.015]"
                    : "surface-card hover:bg-accent/50"
                }`}
              >
                <span className="flex items-center gap-3.5">
                  <span
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                      action.primary
                        ? "bg-primary-foreground/15 group-hover:bg-[hsl(var(--primary-glow))]"
                        : "bg-accent text-primary"
                    }`}
                  >
                    <action.icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{action.label}</span>
                    <span className={`block text-[11px] ${action.primary ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {action.desc}
                    </span>
                  </span>
                </span>
                <ArrowLeft className={`h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-1 ${action.primary ? "opacity-60" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Live Queue & Processing Monitor (Read-Only with Direct Action to Full Queue) */}
        <Card className="lg:col-span-2 border-border/60 rounded-3xl shadow-card overflow-hidden flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 bg-secondary/40 py-4 shrink-0">
            <div>
              <CardTitle className="text-lg font-display font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span>حالة الطابور والعصر</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">متابعة فورية لخط العصر وقائمة الانتظار</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/queue")}
              className="gap-1.5 text-xs font-semibold rounded-full border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            >
              <span>إدارة الطابور بالكامل</span>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>

          <CardContent className="p-4 space-y-4 flex-1 flex flex-col">
            {/* 1. Live Processing Spotlight */}
            {currentProcessing ? (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                    #{currentProcessing.position}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                        <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                        قيد العصر حالياً
                      </span>
                      <Badge variant="outline" className="text-[11px] font-semibold border-primary/30 text-foreground">
                        {currentProcessing.bags ?? 0} شوال
                      </Badge>
                    </div>
                    <h3 className="text-base font-bold text-foreground mt-0.5">
                      {currentProcessing.name}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-left" dir="ltr">
                    <div className="text-[11px] font-medium text-muted-foreground text-right">الوقت المتبقي</div>
                    <span className="text-2xl font-bold font-mono text-primary">
                      {procRemSec !== null ? formatRemaining(procRemSec) : `${procEstMin || 30}:00`}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate("/queue")}
                    className="h-8 rounded-lg text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                  >
                    متابعة العصر
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-3.5 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  <span className="font-medium text-foreground/80">الخط متوقف حالياً (لا يوجد عصر نشط)</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/queue")}
                  className="h-7 text-xs text-primary hover:text-primary/90"
                >
                  بدء عصر من الطابور ➔
                </Button>
              </div>
            )}

            {/* 2. Waiting List Preview */}
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between text-xs px-1 text-muted-foreground font-semibold">
                <span>قائمة الانتظار (أول 5 بالدور)</span>
                <span>إجمالي المنتظرين: {stats.waitingCount} زبون</span>
              </div>

              {queuePreview.length === 0 ? (
                <div className="text-center py-10 rounded-2xl bg-muted/10 border border-border/50">
                  <Clock className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/40" />
                  <p className="text-xs font-medium text-muted-foreground">لا يوجد زبائن في طابور الانتظار حالياً</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card overflow-hidden">
                  {queuePreview.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 transition-colors text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                            i === 0 ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          #{item.position}
                        </span>
                        <span className="font-semibold text-foreground">{item.name}</span>
                        {i === 0 && (
                          <Badge className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] px-2 py-0.5 font-bold">
                            التالي في الدور
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                        <span>{item.bags ?? 0} شوال</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
