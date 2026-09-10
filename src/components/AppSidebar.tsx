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
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useRole } from "@/contexts/RoleContext"
import { useAuth } from "@/contexts/AuthContext"
import { useAdminWorkspace } from "@/contexts/AdminWorkspaceContext"

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
  { title: "المصاريف", url: "/expenses", icon: Wallet },
]

// Management & Admin workspace navigation items (Owner only, shown underneath operational items when admin is opened)
const adminManagementItems = [
  { title: "الرئيسية والإحصاءات", url: "/dashboard", icon: LayoutDashboard },
  { title: "التقارير المفصلة", url: "/reports", icon: BarChart3 },
  { title: "العمال والرواتب", url: "/workers", icon: UserCheck },
  { title: "الزبائن والموردين", url: "/customers", icon: Users },
  { title: "المخزون", url: "/inventory", icon: Warehouse },
  { title: "المواسم", url: "/seasons", icon: Calendar },
  { title: "الإعدادات والأسعار", url: "/settings", icon: Cog },
  { title: "إدارة حسابات المستخدمين", url: "/settings?section=users_roles", icon: UserCog },
]

function MenuGroup({
  label,
  badge,
  items,
  isCollapsed,
}: {
  label: string;
  badge?: React.ReactNode;
  items: Array<{ title: string; url: string; icon: any }>;
  isCollapsed: boolean;
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

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <NavLink
                    to={item.url}
                    end
                    onClick={() => {
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
                    {!isCollapsed && <span>{item.title}</span>}
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
  const isCollapsed = state === "collapsed"

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
              {/* 1. الواجهة التشغيلية الأساسية: دائماً موجودة بنفس الترتيب والمكان للمالك والموظف */}
              <MenuGroup 
                label="الواجهة التشغيلية" 
                items={operationalItems} 
                isCollapsed={isCollapsed} 
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
                            onClick={openReAuthModal}
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
                              onClick={exitAdminWorkspace}
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
    </>
  )
}
