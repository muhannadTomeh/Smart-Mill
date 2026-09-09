import {
  LayoutDashboard,
  Users,
  FileText,
  UserCheck,
  ShoppingCart,
  Sprout,
  Receipt,
  Settings,
  Clock,
  Calendar,
  BarChart3,
  Wallet,
  Cog,
  Warehouse,
  ShieldCheck,
  Building2,
  Calculator,
  Undo2,
  Lock,
} from "lucide-react"
import { NavLink } from "react-router-dom"
import { useRole } from "@/contexts/RoleContext"
import { useAuth } from "@/contexts/AuthContext"
import { useAdminWorkspace } from "@/contexts/AdminWorkspaceContext"
import { Button } from "@/components/ui/button"
import { ReAuthDialog } from "@/components/auth/ReAuthDialog"

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

// Operational workspace navigation items (Shared by Owner and Employee)
const operationalItems = [
  { title: "الطابور", url: "/queue", icon: Clock },
  { title: "حساب الرد", url: "/invoices", icon: Calculator },
  { title: "الفواتير السابقة", url: "/invoices-history", icon: FileText },
  { title: "بيع/شراء الزيت", url: "/oil-trading", icon: ShoppingCart },
  { title: "إغلاق الصندوق", url: "/daily-closing", icon: Receipt },
  { title: "المصاريف", url: "/expenses", icon: Wallet },
]

// Management & Admin workspace navigation items (Owner only, after re-authentication)
const managementItems = [
  { title: "الرئيسية والإحصاءات", url: "/dashboard", icon: LayoutDashboard },
  { title: "التقارير المفصلة", url: "/reports", icon: BarChart3 },
  { title: "العمال والرواتب", url: "/workers", icon: UserCheck },
  { title: "الزبائن والموردين", url: "/customers", icon: Users },
  { title: "المخزن", url: "/inventory", icon: Warehouse },
  { title: "المواسم", url: "/seasons", icon: Calendar },
  { title: "الإعدادات والأسعار", url: "/settings", icon: Cog },
]

function MenuGroup({ label, items, isCollapsed }: { label: string; items: typeof operationalItems; isCollapsed: boolean }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40 px-3 mb-1">
        {!isCollapsed && label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  end
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                      isActive
                        ? "bg-sidebar-primary/20 text-sidebar-primary font-semibold"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`absolute inset-y-1.5 -right-2 w-1 rounded-full transition-all ${
                          isActive ? "bg-sidebar-primary" : "bg-transparent"
                        }`}
                      />
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </>
                  )}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
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
    brandSubtitle = "لوحة الإدارة والتحكم"
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
                    : isMillOwner && isAdminWorkspace
                    ? "bg-emerald-700 text-white"
                    : "bg-sidebar-primary text-sidebar-primary-foreground"
                }`}
              >
                {isAdmin ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : isMillOwner && isAdminWorkspace ? (
                  <Lock className="h-5 w-5" />
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
                  : isMillOwner && isAdminWorkspace
                  ? "bg-emerald-700 text-white"
                  : "bg-sidebar-primary text-sidebar-primary-foreground"
              }`}
            >
              {isAdmin ? (
                <ShieldCheck className="h-5 w-5" />
              ) : isMillOwner && isAdminWorkspace ? (
                <Lock className="h-5 w-5" />
              ) : (
                <Sprout className="h-5 w-5" />
              )}
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="px-3 py-4 space-y-3">
          {isAdmin ? (
            <MenuGroup 
              label="لوحة التحكم والإشراف" 
              items={adminItems} 
              isCollapsed={isCollapsed} 
            />
          ) : isMillOwner && isAdminWorkspace ? (
            /* Mode 1: Owner Admin Workspace */
            <>
              <MenuGroup 
                label="لوحة الإدارة والتحكم" 
                items={managementItems} 
                isCollapsed={isCollapsed} 
              />
              <div className="pt-2 px-1">
                <Button
                  variant="outline"
                  onClick={exitAdminWorkspace}
                  className="w-full justify-start gap-3 rounded-xl border-2 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 font-bold text-xs py-3 h-auto transition-colors shadow-sm"
                  title="الرجوع إلى الواجهة التشغيلية"
                >
                  <Undo2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  {!isCollapsed && <span>خروج من الإدارة</span>}
                </Button>
              </div>
            </>
          ) : (
            /* Mode 2: Unified Operational Workspace (Owner and Employee) */
            <>
              <MenuGroup 
                label="الواجهة التشغيلية" 
                items={operationalItems} 
                isCollapsed={isCollapsed} 
              />
              {isMillOwner && (
                <div className="pt-2 px-1">
                  <Button
                    onClick={openReAuthModal}
                    className="w-full justify-start gap-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm py-3 px-3.5 h-auto transition-all shadow-md cursor-pointer"
                    title="الدخول إلى لوحة إدارة المعصرة والتقارير الحساسة (يتطلب كلمة المرور)"
                  >
                    <ShieldCheck className="h-5 w-5 shrink-0 text-primary-foreground" />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between flex-1">
                        <span>لوحة الإدارة</span>
                        <span className="text-[10px] bg-white/20 text-primary-foreground px-2 py-0.5 rounded-full font-bold">
                          للمالك
                        </span>
                      </div>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-sidebar-border/60 space-y-2">
          {/* Action Button: Switch between Operational and Admin workspace */}
          {!isAdmin && isMillOwner && (
            <div>
              {isAdminWorkspace ? (
                /* Exit Admin Workspace button */
                <Button
                  variant="outline"
                  onClick={exitAdminWorkspace}
                  className="w-full justify-center gap-2 rounded-xl text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 font-semibold text-xs py-2.5 h-auto transition-colors"
                  title="الرجوع إلى الواجهة التشغيلية الأساسية"
                >
                  <Undo2 className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>خروج من الإدارة</span>}
                </Button>
              ) : (
                /* Enter Admin Workspace button */
                <Button
                  onClick={openReAuthModal}
                  className="w-full justify-center gap-2 rounded-xl bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground font-bold text-xs py-2.5 h-auto transition-all shadow-none border border-primary/20"
                  title="الدخول إلى لوحة إدارة المعصرة والتقارير الحساسة (يتطلب كلمة المرور)"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>لوحة الإدارة</span>}
                </Button>
              )}
            </div>
          )}

          {!isCollapsed && (
            <div className="rounded-xl bg-sidebar-primary/5 px-3 py-2 text-center">
              <p className="text-[10px] text-sidebar-foreground/40">المعصرة الذكية — نظام الإدارة والتشغيل</p>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      {/* Owner Re-Authentication Dialog */}
      {!isAdmin && isMillOwner && <ReAuthDialog />}
    </>
  )
}
