import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, CheckCircle, Sprout, Users, Plus, Receipt,
  Wallet, ArrowLeft, Droplets, DollarSign, UserPlus, Play, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useNavigate } from "react-router-dom";

import { useRole } from "@/contexts/RoleContext";
import { Navigate } from "react-router-dom";

export default function Dashboard() {
  const { isEmployee } = useRole();
  if (isEmployee) return <Navigate to="/queue" replace />;
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const { inventory } = useInventory();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    waitingCount: 0,
    doneCount: 0,
    todayExpenses: 0,
    totalCustomers: 0,
  });
  const [queuePreview, setQueuePreview] = useState<{ id: string; name: string; position: number }[]>([]);
  const [showSensitive, setShowSensitive] = useState(false);

  useEffect(() => {
    if (user && activeSeason) {
      fetchStats();
      fetchQueuePreview();
    }
  }, [user, activeSeason]);

  const fetchStats = async () => {
    const today = new Date().toISOString().split("T")[0];
    const [waitingRes, doneRes, expenseRes, customerRes] = await Promise.all([
      supabase.from("queue").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("season_id", activeSeason!.id).neq("status", "completed"),
      supabase.from("queue").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("season_id", activeSeason!.id).eq("status", "completed"),
      supabase.from("expenses").select("amount").eq("user_id", user!.id).eq("season_id", activeSeason!.id).gte("created_at", today),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("season_id", activeSeason!.id),
    ]);
    setStats({
      waitingCount: waitingRes.count || 0,
      doneCount: doneRes.count || 0,
      todayExpenses: (expenseRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0),
      totalCustomers: customerRes.count || 0,
    });
  };

  const fetchQueuePreview = async () => {
    const { data } = await supabase
      .from("queue")
      .select("id, name, position")
      .eq("user_id", user!.id)
      .eq("season_id", activeSeason!.id)
      .neq("status", "completed")
      .order("position", { ascending: true })
      .limit(5);
    setQueuePreview(data || []);
  };

  const statCards = [
    { label: "الرصيد", hint: "نقداً", value: `${inventory.total_cash.toFixed(0)} ₪`, icon: DollarSign, tone: "text-primary", bg: "bg-primary/10", sensitive: true },
    { label: "الزيت", hint: "كغم", value: inventory.total_oil.toFixed(1), icon: Droplets, tone: "text-[hsl(var(--primary-glow))]", bg: "bg-[hsl(var(--primary-glow))]/12" },
    { label: "في الطابور", hint: "زبون", value: stats.waitingCount, icon: Clock, tone: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/12" },
    { label: "تم الإنجاز", hint: "اليوم", value: stats.doneCount, icon: CheckCircle, tone: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/12" },
    { label: "مصاريف اليوم", hint: "شيكل", value: `${stats.todayExpenses} ₪`, icon: Wallet, tone: "text-destructive", bg: "bg-destructive/10", sensitive: true },
    { label: "الزبائن", hint: "الموسم", value: stats.totalCustomers, icon: Users, tone: "text-[hsl(var(--info))]", bg: "bg-[hsl(var(--info))]/12" },
  ];

  const quickActions = [
    { label: "إضافة للطابور", desc: "تسجيل زبون جديد", icon: UserPlus, onClick: () => navigate("/queue"), primary: true },
    { label: "فتح الطابور", desc: "متابعة العصر", icon: Clock, onClick: () => navigate("/queue") },
    { label: "إنشاء فاتورة", desc: "حساب الرد", icon: Receipt, onClick: () => navigate("/invoices") },
    { label: "إضافة مصروف", desc: "تسجيل مصروف", icon: Wallet, onClick: () => navigate("/expenses") },
  ];

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
            <p className="text-sm text-muted-foreground mt-1">نظرة عامة لحظية على أداء المعصرة</p>
          </div>
          <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15 border-0 px-4 py-1.5 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary-glow))] animate-pulse ms-2" />
            النظام يعمل الآن
          </Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

      {/* Actions + Queue */}
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

        {/* Queue Preview */}
        <Card className="lg:col-span-2 border-border/60 rounded-3xl shadow-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 bg-secondary/40 py-4">
            <div>
              <CardTitle className="text-lg font-display font-bold">الطابور الحالي</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">أول 5 زبائن في الانتظار</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  if (queuePreview.length === 0) return;
                  const { data: existingProcessing } = await supabase
                    .from("queue")
                    .select("id")
                    .eq("user_id", user!.id)
                    .eq("season_id", activeSeason!.id)
                    .eq("status", "processing")
                    .maybeSingle();
                  if (existingProcessing) {
                    toast.error("يوجد زبون قيد العصر بالفعل");
                    return;
                  }
                  await supabase.from("queue").update({ status: "processing" }).eq("id", queuePreview[0].id);
                  toast.success(`تم بدء عصر ${queuePreview[0].name}`);
                  fetchQueuePreview();
                }}
                disabled={queuePreview.length === 0}
                className="gap-1 text-xs rounded-full px-4"
              >
                <Play className="h-3.5 w-3.5" />
                ابدأ التالي
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/queue")} className="gap-1 text-primary text-xs rounded-full">
                عرض الكل
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {queuePreview.length === 0 ? (
              <div className="text-center py-14">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm text-muted-foreground">لا يوجد أحد في الطابور</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {queuePreview.map((item, i) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-accent/40 transition-colors"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-display font-bold ${
                        i === 0 ? "bg-primary text-primary-foreground shadow-olive" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {item.position}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{item.name}</span>
                    {i === 0 && (
                      <Badge className="mr-auto rounded-full border-0 bg-[hsl(var(--primary-glow))]/15 text-[hsl(var(--primary-glow))] text-[10px] px-3 py-1 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary-glow))] animate-pulse ms-1.5" />
                        التالي
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

