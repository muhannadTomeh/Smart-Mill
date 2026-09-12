import {
  LayoutDashboard,
  Users,
  FileText,
  UserCheck,
  ShoppingCart,
  Sprout,
  Receipt,
  Clock,
  Calendar,
  BarChart3,
  Wallet,
  Cog,
  Warehouse,
  Building2,
  Calculator,
  Undo2,
  Lock,
  Unlock,
  UserCog,
  LockOpen,
  HandCoins,
  Users2,
} from "lucide-react"
import { useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { useRole } from "@/contexts/RoleContext"
import { useAuth } from "@/contexts/AuthContext"
import { useAdminWorkspace } from "@/contexts/AdminWorkspaceContext"
import { useCashSession } from "@/contexts/CashSessionContext"
import { useSeason } from "@/contexts/SeasonContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar"

// Platform Admin navigation item
const adminItems = [
  { title: "إدارة المعاصر والاشتراكات", url: "/admin", icon: Building2 },
]

// Operational workspace navigation items (Shared by Owner and Employee - ALWAYS VISIBLE)
const operationalItems = [
  { title: "الطابور", url: "/queue", icon: Clock },
  { title: "حساب الرد", url: "/invoices", icon: Calculator },
  { title: "الفواتير السابقة", url: "/invoices-history", icon: FileText },
  { title: "بيع وشراء الزيت", url: "/oil-trading", icon: ShoppingCart },
  { title: "إغلاق الصندوق", url: "/daily-closing", icon: Receipt },
]

// Management & Admin workspace navigation items (Owner only, shown underneath operational items when admin is opened)
const adminManagementItems = [
  { title: "الرئيسية والإحصاءات", url: "/dashboard", icon: LayoutDashboard },
  { title: "المصاريف", url: "/expenses", icon: Wallet },
  { title: "الموردين والالتزامات", url: "/payables", icon: HandCoins },
  { title: "الشركاء والمساهمين", url: "/partners", icon: Users2 },
  { title: "المخزون والمنتجات", url: "/inventory", icon: Warehouse },
  { title: "التقارير المفصلة", url: "/reports", icon: BarChart3 },
  { title: "العمال والرواتب", url: "/workers", icon: UserCheck },
  { title: "الزبائن", url: "/customers", icon: Users },
  { title: "المواسم", url: "/seasons", icon: Calendar },
  { title: "الإعدادات والأسعار", url: "/settings", icon: Cog },
  { title: "إدارة حسابات المستخدمين", url: "/settings?section=users_roles", icon: UserCog },
]

let lastNavTimestamp = 0;
const NAV_THROTTLE_MS = 300;

const CASH_LOCKED_URLS = ["/queue", "/invoices", "/oil-trading"];

function MenuGroup({
  label,
  badge,
  items,
  isCollapsed,
  cashClosed = false,
}: {
  label: string;
  badge?: React.ReactNode;
  items: Array<{ title: string; url: string; icon: any }>;
  isCollapsed: boolean;
  cashClosed?: boolean;
}) {
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <div className="flex items-center justify-between px-3 mb-1">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50 px-0">
          {!isCollapsed && label}
        </SidebarGroupLabel>
        {!isCollapsed && badge}
      </div>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const isMatch = item.url.includes("?")
              ? location.pathname === item.url.split("?")[0] && location.search.includes(item.url.split("?")[1])
              : item.url === "/settings"
              ? location.pathname === "/settings" && (!location.search || !location.search.includes("section=users_roles"))
              : location.pathname === item.url;

            const isLockedByCash = cashClosed && CASH_LOCKED_URLS.includes(item.url);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={isLockedByCash ? `${item.title} (يتطلب فتح الصندوق)` : item.title}>
                  <NavLink
                    to={item.url}
                    end
                    onClick={(e) => {
                      // 1. If already on this exact page, do not re-trigger navigation
                      if (isMatch) {
                        e.preventDefault();
                        if (isMobile) setOpenMobile(false);
                        return;
                      }

                      // 2. Throttle rapid consecutive clicks (must be at least 300ms apart)
                      const now = Date.now();
                      if (now - lastNavTimestamp < NAV_THROTTLE_MS) {
                        e.preventDefault();
                        return;
                      }
                      lastNavTimestamp = now;

                      if (isMobile) setOpenMobile(false);
                    }}
                    className={() =>
                      `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                        isMatch
                          ? "bg-sidebar-primary/20 text-sidebar-primary font-semibold"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`
                    }
                  >
                    <span
                      className={`absolute inset-y-1.5 -right-2 w-1 rounded-full transition-all ${
                        isMatch ? "bg-sidebar-primary" : "bg-transparent"
                      }`}
                    />
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between flex-1 overflow-hidden">
                        <span className="truncate">{item.title}</span>
                        {isLockedByCash && (
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 shrink-0">
                            مغلق
                          </span>
                        )}
                      </div>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar()
  const { isAdmin, isOwner, isEmployee } = useRole()
  const { profile } = useAuth()
  const { isAdminWorkspace, openReAuthModal, exitAdminWorkspace } = useAdminWorkspace()
  const { session, isOpen, openSession } = useCashSession()
  const { activeSeason } = useSeason()
  const isCollapsed = state === "collapsed"

  const [showOpenCashDialog, setShowOpenCashDialog] = useState(false)
  const [openingBalance, setOpeningBalance] = useState("0")
  const [openingLoading, setOpeningLoading] = useState(false)

  const handleOpenCash = async () => {
    if (!activeSeason) return
    setOpeningLoading(true)
    const ok = await openSession(parseFloat(openingBalance) || 0)
    setOpeningLoading(false)
    if (ok) {
      setShowOpenCashDialog(false)
      setOpeningBalance("0")
    }
  }

  const isMillOwner = isOwner || (!isAdmin && !isEmployee);

  // Dynamic branding titles
  let brandTitle = profile?.mill_name || "المعصرة الذكية"
  let brandSubtitle = isEmployee ? "واجهة الموظف (الكاشير)" : "الواجهة التشغيلية"

  if (isAdmin) {
    brandTitle = "لوحة الأدمن"
    brandSubtitle = "الإدارة العامة والتحكم"
  } else if (isMillOwner && isAdminWorkspace) {
    brandSubtitle = "الواجهة التشغيلية والإدارة"
  }

  return (
    <>
      <Sidebar
        side="right"
        className={isCollapsed ? "w-16" : "w-64"}
        collapsible="icon"
      >
        <SidebarHeader className="p-5 border-b border-sidebar-border/60">
          {!isCollapsed ? (
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-olive ${
                  isAdmin
                    ? "bg-amber-600 text-white"
                    : "bg-sidebar-primary text-sidebar-primary-foreground"
                }`}
              >
                {isAdmin ? (
                  <Building2 className="h-5 w-5" />
                ) : (
                  <Sprout className="h-5 w-5" />
                )}
              </div>
              <div className="overflow-hidden">
                <h2 className="text-base font-bold text-sidebar-foreground tracking-tight leading-tight truncate" title={brandTitle}>
                  {brandTitle}
                </h2>
                <p className="text-[11px] text-sidebar-foreground/50 truncate flex items-center gap-1 mt-0.5">
                  {isMillOwner && isAdminWorkspace && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  )}
                  <span>{brandSubtitle}</span>
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto shadow-olive ${
                isAdmin
                  ? "bg-amber-600 text-white"
                  : "bg-sidebar-primary text-sidebar-primary-foreground"
              }`}
            >
              {isAdmin ? (
                <Building2 className="h-5 w-5" />
              ) : (
                <Sprout className="h-5 w-5" />
              )}
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="px-3 py-4 space-y-2">
          {isAdmin ? (
            <MenuGroup 
              label="لوحة التحكم والإشراف" 
              items={adminItems} 
              isCollapsed={isCollapsed} 
            />
          ) : (
            <>
              {/* Cash Session Status Card */}
              {!isCollapsed ? (
                <div className="mx-1 mb-3">
                  {isOpen && session ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span>الصندوق مفتوح</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300" dir="ltr">
                        {Number(session.opening_balance).toLocaleString()} ₪
                      </span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <span>الصندوق مغلق</span>
                        </div>
                        <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80">العمليات معطلة</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setShowOpenCashDialog(true)}
                        className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 shadow-sm"
                      >
                        <LockOpen className="h-3.5 w-3.5" />
                        فتح الصندوق
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-center mb-2">
                  {isOpen ? (
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" title="الصندوق مفتوح" />
                  ) : (
                    <button
                      onClick={() => setShowOpenCashDialog(true)}
                      className="w-4 h-4 rounded-full bg-rose-500/20 border border-rose-500 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                      title="الصندوق مغلق - اضغط لفتح الصندوق"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    </button>
                  )}
                </div>
              )}

              {/* 1. الواجهة التشغيلية الأساسية: دائماً موجودة بنفس الترتيب والمكان للمالك والموظف */}
              <MenuGroup 
                label="الواجهة التشغيلية" 
                items={operationalItems} 
                isCollapsed={isCollapsed} 
                cashClosed={!isOpen}
              />

              {/* 2. قسم لوحة الإدارة: يظهر فقط للمالك (Owner) ولا يظهر نهائياً للموظف */}
              {isMillOwner && (
                <div className="pt-2">
                  <div className="my-2 border-t border-sidebar-border/60 mx-1" />

                  {!isAdminWorkspace ? (
                    /* حالة 1: لوحة الإدارة مغلقة - زر لفتح الإدارة بعد تأكيد كلمة المرور */
                    <SidebarGroup className="p-0">
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            onClick={() => {
                              const now = Date.now();
                              if (now - lastNavTimestamp < NAV_THROTTLE_MS) return;
                              lastNavTimestamp = now;
                              openReAuthModal();
                            }}
                            tooltip="لوحة الإدارة"
                            className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-sidebar-foreground/80 hover:text-primary hover:bg-primary/10 border border-sidebar-border/60 transition-all duration-200 cursor-pointer"
                          >
                            <Lock className="h-[18px] w-[18px] shrink-0 text-primary" />
                            {!isCollapsed && (
                              <div className="flex items-center justify-between flex-1">
                                <span className="font-bold">لوحة الإدارة</span>
                                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                                  للمالك
                                </span>
                              </div>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </SidebarGroup>
                  ) : (
                    /* حالة 2: لوحة الإدارة مفتوحة - إدراج عناصر الإدارة تحت الواجهة التشغيلية مباشرة */
                    <div className="space-y-2 animate-in fade-in-50 duration-200">
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-sm font-bold">
                        <div className="flex items-center gap-2.5">
                          <Unlock className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          {!isCollapsed && <span>لوحة الإدارة مفتوحة</span>}
                        </div>
                      </div>

                      <MenuGroup 
                        label="أدوات الإدارة والتحكم"
                        items={adminManagementItems} 
                        isCollapsed={isCollapsed} 
                      />

                      <div className="my-2 border-t border-sidebar-border/60 mx-1" />

                      {/* زر خروج من الإدارة */}
                      <SidebarGroup className="p-0">
                        <SidebarMenu>
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              onClick={() => {
                                const now = Date.now();
                                if (now - lastNavTimestamp < NAV_THROTTLE_MS) return;
                                lastNavTimestamp = now;
                                exitAdminWorkspace();
                              }}
                              tooltip="خروج من الإدارة"
                              className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-amber-800 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all duration-200 cursor-pointer"
                            >
                              <Undo2 className="h-[18px] w-[18px] shrink-0 text-amber-600 dark:text-amber-400" />
                              {!isCollapsed && (
                                <div className="flex items-center justify-between flex-1">
                                  <span>خروج من الإدارة</span>
                                  <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold">
                                    إغلاق
                                  </span>
                                </div>
                              )}
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
                      </SidebarGroup>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-sidebar-border/60 space-y-2">
          {!isCollapsed && (
            <div className="rounded-xl bg-sidebar-primary/5 px-3 py-2 text-center">
              <p className="text-[10px] text-sidebar-foreground/40">المعصرة الذكية — نظام الإدارة والتشغيل</p>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      <Dialog open={showOpenCashDialog} onOpenChange={setShowOpenCashDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5 text-emerald-500" />
              فتح الصندوق
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              أدخل الرصيد الافتتاحي (المبلغ الموجود في الدرج لحظة الفتح):
            </p>
            <div className="space-y-1.5">
              <Label>الرصيد الافتتاحي (شيكل)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0"
                className="text-right"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleOpenCash()}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowOpenCashDialog(false)} disabled={openingLoading}>
              إلغاء
            </Button>
            <Button
              onClick={handleOpenCash}
              disabled={openingLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {openingLoading ? "جاري الفتح..." : "فتح الصندوق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
