import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  RefreshCw,
  Wallet,
  Receipt,
  Sprout,
  Users,
  Package,
  Droplets,
  ShoppingCart,
  CheckCircle,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useCashBalance } from "@/hooks/useCashBalance";
import { supabase } from "@/integrations/supabase/client";

type LedgerEvent = {
  id: string;
  operation_id: string;
  amount: number;
  direction: "in" | "out" | "none";
  type: string;
  category: string;
  description: string | null;
  party_name: string | null;
  payment_method: string;
  status: "active" | "voided";
  created_at: string;
  reversal_of: string | null;
  reversal_reason: string | null;
  reference_type: string;
  reference_id: string | null;
  effect_status: "effective" | "reversed" | "reversal" | "legacy_voided";
  signed_amount: number;
};

const money = new Intl.NumberFormat("ar-PS", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("ar-PS", {
  dateStyle: "medium",
  timeStyle: "short",
});
const timeOnly = new Intl.DateTimeFormat("ar-PS", { timeStyle: "short" });

export default function FinancialLedger() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { cashBalance } = useCashBalance();
  const { toast } = useToast();
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "today" | "in" | "out">(
    "all",
  );

  const todayStr = new Date().toISOString().split("T")[0];

  const load = useCallback(async () => {
    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!effectiveMillId || !activeSeason) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_effective_events")
      .select(
        "id, operation_id, amount, direction, type, category, description, party_name, payment_method, status, created_at, reversal_of, reversal_reason, reference_type, reference_id",
      )
      .eq("mill_id", effectiveMillId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      toast({
        title: "تعذر تحميل الدفتر المالي",
        description: error.message,
        variant: "destructive",
      });
    } else {
      const rawEvents = (data ?? []) as Omit<LedgerEvent, "effect_status" | "signed_amount">[];
      const reversedIds = new Set(rawEvents.flatMap((event) => event.reversal_of ? [event.reversal_of] : []));
      setEvents(
        rawEvents.map((event) => ({
          ...event,
          signed_amount:
            event.direction === "in"
              ? Number(event.amount)
              : event.direction === "out"
                ? -Number(event.amount)
                : 0,
          effect_status: event.reversal_of ? "reversal" : reversedIds.has(event.id) ? "reversed" : event.status === "voided" ? "legacy_voided" : "effective",
        })) as LedgerEvent[],
      );
    }
    setLoading(false);
  }, [activeSeason, millId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime subscription: refresh ledger automatically when any transaction happens
  useEffect(() => {
    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!activeSeason || !effectiveMillId) return;
    const channel = supabase
      .channel(`ledger_events_${effectiveMillId}_${activeSeason.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financial_transactions" },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeSeason?.id, activeSeason?.mill_id, millId, load]);

  const todayCount = useMemo(() => {
    return events.filter((e) => e.created_at.startsWith(todayStr)).length;
  }, [events, todayStr]);

  const visible = useMemo(
    () =>
      events.filter((event) => {
        const isToday = event.created_at.startsWith(todayStr);
        if (direction === "today" && !isToday) return false;
        if (direction === "in" && event.direction !== "in") return false;
        if (direction === "out" && event.direction !== "out") return false;

        if (!search.trim()) return true;
        const text =
          `${event.description ?? ""} ${event.party_name ?? ""} ${event.category ?? ""} ${event.type ?? ""}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [direction, events, search, todayStr],
  );

  const totals = useMemo(
    () =>
      events
        .filter((event) => event.effect_status === "effective")
        .reduce(
          (value, event) => ({
            incoming:
              value.incoming +
              (event.direction === "in" ? Number(event.amount) : 0),
            outgoing:
              value.outgoing +
              (event.direction === "out" ? Number(event.amount) : 0),
            net: value.net + Number(event.signed_amount),
          }),
          { incoming: 0, outgoing: 0, net: 0 },
        ),
    [events],
  );

  const formatEventDate = (dateString: string) => {
    const isToday = dateString.startsWith(todayStr);
    const dateObj = new Date(dateString);
    if (isToday) {
      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Badge
            variant="secondary"
            className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0 font-semibold"
          >
            اليوم
          </Badge>
          <span className="text-xs font-mono text-muted-foreground">
            {timeOnly.format(dateObj)}
          </span>
        </div>
      );
    }
    return (
      <span className="whitespace-nowrap text-xs text-muted-foreground font-mono">
        {dateTime.format(dateObj)}
      </span>
    );
  };

  const renderTypeBadge = (event: LedgerEvent) => {
    const t = event.type;
    const ref = event.reference_type;

    if (event.effect_status === "reversal") return <Badge variant="secondary" className="text-xs gap-1"><RefreshCw className="h-3 w-3" /> حركة تصحيح</Badge>;
    // The source document is more specific than a generic accounting type.
    if (ref === "invoice") return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1"><Receipt className="h-3 w-3" /> فاتورة عصر</Badge>;
    if (ref === "expense") return <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs gap-1"><Sprout className="h-3 w-3" /> مصروف</Badge>;
    if (ref === "worker_payment") return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1"><Users className="h-3 w-3" /> دفعة عامل</Badge>;
    if (ref === "product_purchase") return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs gap-1"><Package className="h-3 w-3" /> شراء بضاعة</Badge>;
    if (ref === "oil_transaction") return <Badge className="bg-teal-50 text-teal-700 border-teal-200 text-xs gap-1"><Droplets className="h-3 w-3" /> {event.direction === "in" ? "بيع زيت" : "شراء زيت"}</Badge>;
    if (ref === "customer_payment" || t === "customer_payment") return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1"><CheckCircle className="h-3 w-3" /> تحصيل ذمة</Badge>;
    if (ref === "payable_settlement") return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1"><CheckCircle className="h-3 w-3" /> سداد التزام</Badge>;
    if (ref === "partner_transaction" || t === "owner_deposit" || t === "owner_withdrawal") return <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs">{event.direction === "in" ? "مساهمة شريك" : "سحب شريك"}</Badge>;
    if (ref === "cash_opening_balance" || t === "cash_opening_balance") return <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs gap-1"><Wallet className="h-3 w-3" /> رصيد افتتاحي</Badge>;

    if (t === "income") {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 text-xs gap-1 font-medium shadow-none">
          <Receipt className="h-3 w-3" /> فاتورة عصر
        </Badge>
      );
    }
    if (t === "expense") {
      return (
        <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 text-xs gap-1 font-medium shadow-none">
          <Sprout className="h-3 w-3" /> مصروف
        </Badge>
      );
    }
    if (t === "worker_payment") {
      return (
        <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 text-xs gap-1 font-medium shadow-none">
          <Users className="h-3 w-3" /> أجر عامل
        </Badge>
      );
    }
    if (t === "stock_purchase") {
      return (
        <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 text-xs gap-1 font-medium shadow-none">
          <Package className="h-3 w-3" /> شراء بضاعة
        </Badge>
      );
    }
    if (t === "oil_sale") {
      return (
        <Badge className="bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 border-teal-200 text-xs gap-1 font-medium shadow-none">
          <Droplets className="h-3 w-3" /> بيع زيت
        </Badge>
      );
    }
    if (t === "oil_purchase") {
      return (
        <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 text-xs gap-1 font-medium shadow-none">
          <ShoppingCart className="h-3 w-3" /> شراء زيت
        </Badge>
      );
    }
    if (t === "owner_deposit") {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1 font-medium shadow-none">
          <ArrowDownLeft className="h-3 w-3" /> إيداع شريك
        </Badge>
      );
    }
    if (t === "owner_withdrawal") {
      return (
        <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs gap-1 font-medium shadow-none">
          <ArrowUpRight className="h-3 w-3" /> مسحوبات شريك
        </Badge>
      );
    }
    if (
      t === "cash_opening_balance" ||
      t === "adjustment" ||
      event.category === "رصيد افتتاحي"
    ) {
      return (
        <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs gap-1 font-medium shadow-none">
          <Wallet className="h-3 w-3" /> رصيد افتتاحي
        </Badge>
      );
    }
    if (t === "customer_payment") {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1 font-medium shadow-none">
          <CheckCircle className="h-3 w-3" /> قبض ذمة
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs font-medium">
        {event.type}
      </Badge>
    );
  };

  const renderDescription = (event: LedgerEvent) => {
    // Determine the primary label
    let mainLabel = event.description || event.category;

    // Clean up technical terms or dashes
    if (
      !mainLabel ||
      mainLabel === "expense" ||
      mainLabel === "income" ||
      mainLabel === "-" ||
      mainLabel === "—"
    ) {
      mainLabel = event.category || "حركة نقدية";
    }

    const party =
      event.party_name && event.party_name !== "-" && event.party_name !== "—"
        ? event.party_name.trim()
        : null;

    return (
      <div className="space-y-0.5 max-w-md">
        <p className="font-semibold text-foreground text-sm tracking-tight">
          {mainLabel}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {party && (
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded">
              <User className="h-3 w-3 text-muted-foreground" />
              <span>الطرف: {party}</span>
            </span>
          )}
          {event.category &&
            event.category !== mainLabel &&
            event.category !== "expense" &&
            event.category !== "income" && (
              <span className="text-[11px] text-muted-foreground">
                [{event.category}]
              </span>
            )}
          {event.effect_status === "reversal" && event.reversal_of && <span className="text-[11px] text-muted-foreground">تصحيح للعملية #{event.reversal_of.slice(0, 8)}</span>}
          {event.effect_status === "reversed" && <span className="text-[11px] text-muted-foreground">تم عكسها</span>}
        </div>
      </div>
    );
  };

  const renderPaymentMethod = (method: string) => {
    switch (method) {
      case "cash":
        return (
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-emerald-200 text-emerald-800 dark:text-emerald-300"
          >
            نقدي
          </Badge>
        );
      case "credit":
        return (
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-amber-200 text-amber-800 dark:text-amber-300"
          >
            آجل / ذمم
          </Badge>
        );
      case "partner":
        return (
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-blue-200 text-blue-800 dark:text-blue-300"
          >
            تمويل شريك
          </Badge>
        );
      default:
        return (
          <span className="text-xs text-muted-foreground">{method || "—"}</span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2.5 text-foreground">
            <BookOpen className="h-7 w-7 text-primary" />
            <span>الدفتر المالي المركزي</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            سجل التدقيق الشامل لكل حركة نقدية، قبض، مصروف، وقيد عكسي في الموسم
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="gap-2 rounded-xl h-9 text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          <span>تحديث</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              إجمالي المقبوضات (الداخل)
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              {money.format(totals.incoming)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              إجمالي المدفوعات (الخارج)
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono mt-1">
              {money.format(totals.outgoing)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">
              الصافي بعد القيود العكسية
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono mt-1">
              {money.format(totals.net)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              الرصيد النقدي الفعلي للمعصرة
            </CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-mono mt-1">
              <Wallet className="h-5 w-5 text-emerald-600" />
              <span>{money.format(cashBalance)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 text-xs text-muted-foreground">
            مطابق للوحة التحكم وصفحة المصاريف لحظياً
          </CardContent>
        </Card>
      </div>

      {/* Main Transactions Card */}
      <Card className="border border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-card/60 p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span>قيود وحركات الموسم</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                تصفح كافة الحركات النقدية مع التمييز الفوري لحركات اليوم
                ومصادرها
              </CardDescription>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 bg-muted/40 p-1 rounded-xl">
              <Button
                size="sm"
                variant={direction === "all" ? "default" : "ghost"}
                onClick={() => setDirection("all")}
                className="h-8 text-xs rounded-lg font-medium"
              >
                كل الحركات
              </Button>
              <Button
                size="sm"
                variant={direction === "today" ? "default" : "ghost"}
                onClick={() => setDirection("today")}
                className="h-8 text-xs rounded-lg font-medium gap-1.5"
              >
                <span>حركات اليوم</span>
                {todayCount > 0 && (
                  <Badge
                    variant={direction === "today" ? "secondary" : "default"}
                    className="h-4 min-w-4 px-1 text-[10px] font-mono rounded-full"
                  >
                    {todayCount}
                  </Badge>
                )}
              </Button>
              <Button
                size="sm"
                variant={direction === "in" ? "default" : "ghost"}
                onClick={() => setDirection("in")}
                className="h-8 text-xs rounded-lg font-medium text-emerald-600 hover:text-emerald-700"
              >
                داخل (+)
              </Button>
              <Button
                size="sm"
                variant={direction === "out" ? "default" : "ghost"}
                onClick={() => setDirection("out")}
                className="h-8 text-xs rounded-lg font-medium text-rose-600 hover:text-rose-700"
              >
                خارج (-)
              </Button>
            </div>
          </div>

          <div className="pt-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالبيان، اسم الزبون، العامل، المورد، أو التصنيف..."
              className="max-w-md h-9 text-xs rounded-xl bg-background"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                  <TableHead className="text-right font-semibold">
                    التاريخ والوقت
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    نوع الحركة
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    البيان والتفاصيل
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    طريقة الدفع
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    المبلغ
                  </TableHead>
                  <TableHead className="text-center font-semibold">
                    الحالة
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-xs">
                          جارٍ تحميل قيود الدفتر المالي…
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <p className="text-sm font-medium">
                        لا توجد حركات مالية مطابقة
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        جرّب تغيير خيارات البحث أو الفلترة
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((event) => (
                    <TableRow
                      key={event.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="py-3">
                        {formatEventDate(event.created_at)}
                      </TableCell>

                      <TableCell className="py-3">
                        {renderTypeBadge(event)}
                      </TableCell>

                      <TableCell className="py-3">
                        {renderDescription(event)}
                      </TableCell>

                      <TableCell className="py-3">
                        {renderPaymentMethod(event.payment_method)}
                      </TableCell>

                      <TableCell
                        className={`py-3 font-bold font-mono whitespace-nowrap text-sm ${
                          event.direction === "in"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : event.direction === "out"
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {event.direction === "in" ? (
                          <ArrowDownLeft className="inline h-4 w-4 ms-1" />
                        ) : event.direction === "out" ? (
                          <ArrowUpRight className="inline h-4 w-4 ms-1" />
                        ) : null}
                        {event.direction === "out"
                          ? "-"
                          : event.direction === "in"
                            ? "+"
                            : ""}
                        {money.format(Number(event.amount))}
                      </TableCell>

                      <TableCell className="py-3 text-center">
                        {event.effect_status === "reversal" ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-muted font-normal"
                          >
                            حركة تصحيح
                          </Badge>
                        ) : event.effect_status === "reversed" ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            تم عكسها
                          </Badge>
                        ) : event.effect_status === "legacy_voided" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            ملغاة
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] font-normal shadow-none">
                            فعّالة
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
