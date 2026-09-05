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
  TrendingUp,
  Wallet,
  Cog,
  Warehouse,
  ShieldCheck,
  MessageSquare,
  Building2,
  Calculator,
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useRole } from "@/contexts/RoleContext"
import { useAuth } from "@/contexts/AuthContext"

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

const adminItems = [
  { title: "إدارة المعاصر والاشتراكات", url: "/admin", icon: Building2 },
]

const mainItems = [
  { title: "الرئيسية", url: "/dashboard", icon: LayoutDashboard },
  { title: "الطابور", url: "/queue", icon: Clock },
  { title: "حساب الرد", url: "/invoices", icon: Receipt },
  { title: "إغلاق الصندوق", url: "/daily-closing", icon: Calculator },
  { title: "الزبائن", url: "/customers", icon: Users },
  { title: "العمال", url: "/workers", icon: UserCheck },
]

const operationsItems = [
  { title: "المخزن", url: "/inventory", icon: Warehouse },
  { title: "بيع/شراء الزيت", url: "/oil-trading", icon: ShoppingCart },
  { title: "المصاريف", url: "/expenses", icon: Wallet },
]

const analyticsItems = [
  { title: "التقارير", url: "/reports", icon: BarChart3 },
]

const systemItems = [
  { title: "المواسم", url: "/seasons", icon: Calendar },
  { title: "الإعدادات", url: "/settings", icon: Cog },
]

function MenuGroup({ label, items, isCollapsed }: { label: string; items: typeof mainItems; isCollapsed: boolean }) {
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
  const { isAdmin, isEmployee } = useRole()
  const { profile } = useAuth()
  const isCollapsed = state === "collapsed"

  const brandTitle = isAdmin 
    ? "لوحة الأدمن" 
    : (profile?.mill_name || "المعصرة الذكية")
    
  const brandSubtitle = isAdmin 
    ? "الإدارة العامة والتحكم" 
    : (isEmployee ? "وضع الموظف" : (profile?.mill_location || "إدارة المعصرة"))

  return (
    <Sidebar
      side="right"
      className={isCollapsed ? "w-16" : "w-64"}
      collapsible="icon"
    >
      <SidebarHeader className="p-5 border-b border-sidebar-border/60">
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-olive ${isAdmin ? "bg-amber-600 text-white" : "bg-sidebar-primary text-sidebar-primary-foreground"}`}>
              {isAdmin ? <ShieldCheck className="h-5 w-5" /> : <Sprout className="h-5 w-5" />}
            </div>
            <div className="overflow-hidden">
              <h2 className="text-base font-bold text-sidebar-foreground tracking-tight leading-tight truncate" title={brandTitle}>
                {brandTitle}
              </h2>
              <p className="text-[11px] text-sidebar-foreground/50 truncate">
                {brandSubtitle}
              </p>
            </div>
          </div>
        ) : (
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto shadow-olive ${isAdmin ? "bg-amber-600 text-white" : "bg-sidebar-primary text-sidebar-primary-foreground"}`}>
            {isAdmin ? <ShieldCheck className="h-5 w-5" /> : <Sprout className="h-5 w-5" />}
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
        ) : (
          <>
            <MenuGroup 
              label="الرئيسية" 
              items={isEmployee ? mainItems.filter(i => ['الطابور', 'حساب الرد', 'إغلاق الصندوق'].includes(i.title)) : mainItems} 
              isCollapsed={isCollapsed} 
            />
            {!isEmployee && (
              <>
                <MenuGroup label="العمليات" items={operationsItems} isCollapsed={isCollapsed} />
                <MenuGroup label="التحليلات" items={analyticsItems} isCollapsed={isCollapsed} />
                <MenuGroup label="النظام" items={systemItems} isCollapsed={isCollapsed} />
              </>
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border/60">
        {!isCollapsed && (
          <div className="rounded-2xl bg-sidebar-primary/10 px-4 py-3">
            <p className="text-[11px] font-semibold text-sidebar-primary">المعصرة الذكية v2.0</p>
            <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">نظام إدارة المعصرة</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}

