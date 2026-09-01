import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus, LogIn, Pencil, Lock, Users, Package, DollarSign, Calendar, Sprout,
  LogOut, BarChart3, AlertTriangle, Copy, ArrowRight,
} from "lucide-react";
import { useSeason, Season } from "@/contexts/SeasonContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SeasonStats {
  customers: number;
  oilProduced: number;
  revenue: number;
}

export default function Seasons() {
  const { seasons, loading, enterSeason, closeSeason, refetch } = useSeason();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [statsMap, setStatsMap] = useState<Record<string, SeasonStats>>({});
  const [closingSeasonId, setClosingSeasonId] = useState<string | null>(null);

  useEffect(() => {
    if (seasons.length > 0 && user) fetchAllStats();
  }, [seasons, user]);

  const fetchAllStats = async () => {
    const map: Record<string, SeasonStats> = {};
    for (const season of seasons) {
      const [custRes, invRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("season_id", season.id),
        supabase.from("invoices").select("oil_produced, cash_amount").eq("user_id", user!.id).eq("season_id", season.id),
      ]);
      const invoices = invRes.data || [];
      map[season.id] = {
        customers: custRes.count || 0,
        oilProduced: invoices.reduce((s, i: any) => s + Number(i.oil_produced), 0),
        revenue: invoices.reduce((s, i: any) => s + Number(i.cash_amount), 0),
      };
    }
    setStatsMap(map);
  };

  const handleEnter = async (season: Season) => {
    await enterSeason(season.id);
    toast({ title: "تم الدخول", description: `تم تفعيل ${season.name}` });
    navigate("/dashboard");
  };

  const handleConfirmClose = async () => {
    if (!closingSeasonId) return;
    await closeSeason(closingSeasonId);
    const s = seasons.find((s) => s.id === closingSeasonId);
    toast({ title: "تم إغلاق الموسم", description: `تم إغلاق ${s?.name || "الموسم"} نهائيًا` });
    setClosingSeasonId(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <div className="w-9 h-9 olive-gradient rounded-xl flex items-center justify-center shadow-sm">
            <Sprout className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-foreground leading-tight">المعصرة الذكية</h1>
            <p className="text-xs text-muted-foreground leading-tight">نظام إدارة المعصرة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden md:block">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">خروج</span>
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Title + Create */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">إدارة المواسم</h2>
            <p className="text-muted-foreground mt-1 text-sm">اختر موسمًا للدخول أو أنشئ موسمًا جديدًا</p>
          </div>
          <Button size="lg" className="text-base px-6 shadow-sm w-full sm:w-auto" onClick={() => navigate("/seasons/new")}>
            <Plus className="h-5 w-5 me-2" />
            موسم جديد
          </Button>
        </div>

        {/* Empty State */}
        {seasons.length === 0 && (
          <Card className="border-dashed border-2 border-primary/30">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">لا يوجد مواسم بعد</h3>
              <p className="text-muted-foreground mb-6">أنشئ موسمك الأول لبدء استخدام النظام</p>
              <Button size="lg" onClick={() => navigate("/seasons/new")}>
                <Plus className="h-5 w-5 me-2" />
                إنشاء الموسم الأول
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Season Cards */}
        <div className="grid gap-5 md:grid-cols-2">
          {seasons.map((season) => {
            const stats = statsMap[season.id] || { customers: 0, oilProduced: 0, revenue: 0 };
            const isActive = season.status === "active";

            return (
              <Card
                key={season.id}
                className={`relative overflow-hidden transition-all hover:shadow-md ${
                  isActive ? "ring-2 ring-primary/60 shadow-md" : "opacity-90"
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
                )}
                <CardContent className="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-foreground">{season.name}</h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDate(season.start_date)}</span>
                        {season.end_date && <span>— {formatDate(season.end_date)}</span>}
                      </div>
                    </div>
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className={`text-xs px-2.5 py-1 ${isActive ? "" : "bg-muted text-muted-foreground"}`}
                    >
                      {isActive ? "🟢 مفتوح" : "🔒 مغلق"}
                    </Badge>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <StatBox icon={<Users className="h-4 w-4 text-primary" />} value={stats.customers} label="زبون" />
                    <StatBox icon={<Package className="h-4 w-4 text-primary" />} value={stats.oilProduced} label="كغم زيت" />
                    <StatBox icon={<DollarSign className="h-4 w-4 text-primary" />} value={stats.revenue} label="شيكل" />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    {isActive ? (
                      <>
                        <Button className="flex-1 py-5 text-base" onClick={() => handleEnter(season)}>
                          <LogIn className="h-4 w-4 me-2" />
                          دخول الموسم
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => navigate(`/seasons/edit/${season.id}`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setClosingSeasonId(season.id)}
                        >
                          <Lock className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        className="flex-1 py-5 text-base"
                        onClick={() => {
                          // Enter closed season in read-only to view reports
                          handleEnter(season);
                        }}
                      >
                        <BarChart3 className="h-4 w-4 me-2" />
                        عرض تقارير الموسم
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Close Season Confirmation */}
      <AlertDialog open={!!closingSeasonId} onOpenChange={(open) => !open && setClosingSeasonId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle className="text-lg">إغلاق الموسم نهائيًا</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base leading-relaxed space-y-2">
              <p>هل أنت متأكد من إغلاق هذا الموسم؟</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 mt-2 bg-muted/50 rounded-lg p-3">
                <li>سيتم إغلاق الموسم <strong>نهائيًا</strong></li>
                <li>لن تتمكن من إضافة أو تعديل أي بيانات</li>
                <li>ستبقى البيانات متاحة للعرض فقط</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Lock className="h-4 w-4 me-2" />
              إغلاق الموسم نهائيًا
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-base font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
