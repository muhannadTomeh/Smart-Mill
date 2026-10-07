import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Bell, CheckCheck, Megaphone, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { useNotifications, type AppNotification, type NotificationCategory } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllAdminAccounts, type AdminAccountItem } from "@/lib/credentialVault";
import { getArabicErrorMessage } from "@/lib/errorMessages";
import { cn } from "@/lib/utils";

const categoryLabels: Record<NotificationCategory, string> = {
  general: "عام",
  payment_due: "مستحق مالي",
  update: "تحديث",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationSymbol({ category }: { category: NotificationCategory }) {
  if (category === "payment_due") return <Banknote className="h-5 w-5" />;
  if (category === "update") return <Megaphone className="h-5 w-5" />;
  return <Bell className="h-5 w-5" />;
}

export default function Notifications() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const { toast } = useToast();
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead, refetch } = useNotifications(200, true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | NotificationCategory>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [sending, setSending] = useState(false);
  const [scope, setScope] = useState<"all" | "user">("all");
  const [recipientId, setRecipientId] = useState("");
  const [draft, setDraft] = useState({ title: "", message: "", category: "general" as NotificationCategory });
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingAccounts(true);
    fetchAllAdminAccounts()
      .then((items) => setAccounts(items.filter((item) => item.is_active && item.user_id !== user?.id)))
      .catch((loadError) => {
        console.error("Failed to load notification recipients:", loadError);
        toast({
          variant: "destructive",
          title: "تعذر تحميل المستخدمين",
          description: getArabicErrorMessage(loadError),
        });
      })
      .finally(() => setLoadingAccounts(false));
  }, [isAdmin, toast, user?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    return notifications.filter((notification) => {
      const matchesSearch = !term
        || notification.title.toLocaleLowerCase("ar").includes(term)
        || notification.message.toLocaleLowerCase("ar").includes(term);
      const matchesCategory = category === "all" || notification.category === category;
      const matchesRead = !unreadOnly || !notification.read_at;
      return matchesSearch && matchesCategory && matchesRead;
    });
  }, [category, notifications, search, unreadOnly]);

  const sendNotification = async () => {
    if (!draft.title.trim() || !draft.message.trim() || (scope === "user" && !recipientId)) {
      toast({
        variant: "destructive",
        title: "بيانات ناقصة",
        description: "أدخل العنوان والنص، واختر المستخدم عند الإرسال لمستخدم محدد.",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error: sendError } = await supabase.rpc("send_notification_command", {
        p_scope: scope,
        p_recipient_user_id: scope === "user" ? recipientId : null,
        p_title: draft.title.trim(),
        p_message: draft.message.trim(),
        p_category: draft.category,
        p_action_url: "/notifications",
        p_idempotency_key: idempotencyKeyRef.current,
      });
      if (sendError) throw sendError;

      const result = data as { delivered_count?: number } | null;
      const deliveredCount = Number(result?.delivered_count || 0);
      toast({
        title: "تم إرسال الإشعار",
        description: `وصل الإشعار إلى ${deliveredCount.toLocaleString("ar-u-nu-latn")} مستخدم.`,
      });
      setDraft({ title: "", message: "", category: "general" });
      setRecipientId("");
      idempotencyKeyRef.current = crypto.randomUUID();
    } catch (sendError) {
      console.error("Failed to send notification:", sendError);
      toast({
        variant: "destructive",
        title: "تعذر إرسال الإشعار",
        description: getArabicErrorMessage(sendError, "تعذر إرسال الإشعار. حاول مرة أخرى."),
      });
    } finally {
      setSending(false);
    }
  };

  const openNotification = (notification: AppNotification) => {
    if (!notification.read_at) markRead.mutate(notification.id);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">الإشعارات</h1>
            {unreadCount > 0 && <Badge variant="destructive">{unreadCount.toLocaleString("ar-u-nu-latn")} جديد</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">المستحقات المالية وتحديثات النظام المهمة</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" className="gap-2" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck className="h-4 w-4" />
            تحديد الكل كمقروء
          </Button>
        )}
      </div>

      {isAdmin && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              إرسال إشعار
            </CardTitle>
            <CardDescription>أرسل تحديثًا لكل الحسابات النشطة أو إلى مستخدم محدد.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>المستلم</Label>
                <Select value={scope} onValueChange={(value) => setScope(value as "all" | "user")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المستخدمين النشطين</SelectItem>
                    <SelectItem value="user">مستخدم محدد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نوع الإشعار</Label>
                <Select value={draft.category} onValueChange={(value) => setDraft((current) => ({ ...current, category: value as NotificationCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">عام</SelectItem>
                    <SelectItem value="payment_due">مستحق مالي</SelectItem>
                    <SelectItem value="update">تحديث</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {scope === "user" && (
                <div className="space-y-2">
                  <Label>المستخدم</Label>
                  <Select value={recipientId} onValueChange={setRecipientId} disabled={loadingAccounts}>
                    <SelectTrigger><SelectValue placeholder={loadingAccounts ? "جارٍ التحميل..." : "اختر المستخدم"} /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.user_id} value={account.user_id}>
                          {account.display_name} — {account.mill_name || account.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notification-title">العنوان</Label>
              <Input
                id="notification-title"
                maxLength={120}
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="مثال: تذكير بمستحقات الاشتراك"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notification-message">نص الإشعار</Label>
              <Textarea
                id="notification-message"
                maxLength={2000}
                value={draft.message}
                onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                placeholder="اكتب الرسالة التي ستظهر للمستخدم..."
                className="min-h-24"
              />
            </div>
            <div className="flex justify-end">
              <Button className="min-w-36 gap-2" onClick={sendNotification} disabled={sending}>
                <Send className="h-4 w-4" />
                {sending ? "جارٍ الإرسال..." : "إرسال الإشعار"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>سجل الإشعارات</CardTitle>
              <CardDescription className="mt-1">{filtered.length.toLocaleString("ar-u-nu-latn")} إشعار مطابق</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-64">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في الإشعارات..." className="pr-9" />
              </div>
              <Select value={category} onValueChange={(value) => setCategory(value as "all" | NotificationCategory)}>
                <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="general">عام</SelectItem>
                  <SelectItem value="payment_due">مستحق مالي</SelectItem>
                  <SelectItem value="update">تحديث</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={unreadOnly ? "default" : "outline"} onClick={() => setUnreadOnly((value) => !value)}>
                غير المقروء فقط
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
              <p className="font-medium text-destructive">تعذر تحميل الإشعارات</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>إعادة المحاولة</Button>
            </div>
          ) : isLoading ? (
            <div className="p-10 text-center text-muted-foreground">جارٍ تحميل الإشعارات...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
              <Bell className="h-10 w-10 opacity-40" />
              <p className="font-medium">لا توجد إشعارات مطابقة</p>
            </div>
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border">
              {filtered.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                  className={cn(
                    "flex w-full items-start gap-4 p-4 text-right transition-colors hover:bg-muted/50",
                    !notification.read_at && "bg-primary/[0.05]",
                  )}
                >
                  <span className={cn(
                    "rounded-full p-2.5",
                    notification.category === "payment_due" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary",
                  )}>
                    <NotificationSymbol category={notification.category} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {!notification.read_at && <span className="h-2 w-2 rounded-full bg-primary" />}
                      <span className="font-bold">{notification.title}</span>
                      <Badge variant="outline">{categoryLabels[notification.category]}</Badge>
                    </span>
                    <span className="mt-1.5 block whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{notification.message}</span>
                    <time className="mt-2 block text-xs text-muted-foreground">{formatDateTime(notification.created_at)}</time>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
