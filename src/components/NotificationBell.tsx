import { Bell, Banknote, CheckCheck, Megaphone } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

function notificationIcon(category: AppNotification["category"]) {
  if (category === "payment_due") return <Banknote className="h-4 w-4" />;
  if (category === "update") return <Megaphone className="h-4 w-4" />;
  return <Bell className="h-4 w-4" />;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ar-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications(20, true);
  const latest = notifications.slice(0, 6);

  const openNotification = (notification: AppNotification) => {
    if (!notification.read_at) markRead.mutate(notification.id);
    setOpen(false);
    navigate(notification.action_url || "/notifications");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label={unreadCount > 0 ? `${unreadCount} إشعارات غير مقروءة` : "الإشعارات"}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -left-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount.toLocaleString("ar-u-nu-latn")}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,380px)] p-0" dir="rtl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-bold">الإشعارات</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount.toLocaleString("ar-u-nu-latn")} غير مقروء` : "لا توجد إشعارات جديدة"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4" />
              قراءة الكل
            </Button>
          )}
        </div>

        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">جارٍ تحميل الإشعارات...</div>
          ) : latest.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              <Bell className="h-8 w-8 opacity-40" />
              <p className="text-sm">لا توجد إشعارات حتى الآن</p>
            </div>
          ) : (
            <div className="divide-y">
              {latest.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-muted/60",
                    !notification.read_at && "bg-primary/[0.06]",
                  )}
                >
                  <span className={cn(
                    "mt-0.5 rounded-full p-2",
                    notification.category === "payment_due" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary",
                  )}>
                    {notificationIcon(notification.category)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {!notification.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <span className="truncate text-sm font-bold">{notification.title}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{notification.message}</span>
                    <time className="mt-1.5 block text-[11px] text-muted-foreground">{formatNotificationTime(notification.created_at)}</time>
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-2">
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setOpen(false); navigate("/notifications"); }}>
            عرض كل الإشعارات
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
