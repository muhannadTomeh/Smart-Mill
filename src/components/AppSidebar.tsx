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
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useRole } from "@/contexts/RoleContext"

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

const mainItems = [
  { title: "الرئيسية", url: "/dashboard", icon: LayoutDashboard },
  { title: "الطابور", url: "/queue", icon: Clock },
  { title: "حساب الرد", url: "/invoices", icon: Receipt },
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
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar
      side="right"
      className={isCollapsed ? "w-16" : "w-64"}
      collapsible="icon"
    >
      <SidebarHeader className="p-5 border-b border-sidebar-border/60">
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sidebar-primary flex items-center justify-center shadow-olive">
              <Sprout className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h2 className="text-base font-bold text-sidebar-foreground tracking-tight leading-tight">معصرة الإيمان</h2>
              <p className="text-[11px] text-sidebar-foreground/50">إدارة المعصرة</p>
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-2xl bg-sidebar-primary flex items-center justify-center mx-auto shadow-olive">
            <Sprout className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 space-y-3">
        <MenuGroup label="الرئيسية" items={isEmployee ? mainItems.filter(i => ['الطابور', 'حساب الرد'].includes(i.title)) : mainItems} isCollapsed={isCollapsed} />
        {!isEmployee && (
          <>
            <MenuGroup label="العمليات" items={operationsItems} isCollapsed={isCollapsed} />
            <MenuGroup label="التحليلات" items={analyticsItems} isCollapsed={isCollapsed} />
            <MenuGroup label="النظام" items={systemItems} isCollapsed={isCollapsed} />
          </>
        )}
        {isAdmin === true && (
          <MenuGroup 
            label="الإشراف" 
            items={[{ title: "لوحة المشرف", url: "/admin", icon: ShieldCheck }]} 
            isCollapsed={isCollapsed} 
          />
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

