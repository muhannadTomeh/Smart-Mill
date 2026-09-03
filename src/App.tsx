import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RoleProvider, useRole } from "@/contexts/RoleContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { SeasonProvider, useSeason } from "@/contexts/SeasonContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Calendar, Plus, Users, Receipt, Wallet, User, ChevronDown, Menu, Lock, Phone, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Dashboard from "./pages/Dashboard";
import Queue from "./pages/Queue";
import Invoices from "./pages/Invoices";
import Customers from "./pages/Customers";
import Workers from "./pages/Workers";
import OilTrading from "./pages/OilTrading";
import Expenses from "./pages/Expenses";
import Inventory from "./pages/Inventory";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import LandingPage from "./pages/LandingPage";
import Seasons from "./pages/Seasons";
import SeasonSetup from "./pages/SeasonSetup";
import NotFound from "./pages/NotFound";
import QueueDisplay from "./pages/QueueDisplay";
import PublicQueueDisplay from "./pages/PublicQueueDisplay";
import OAuthConsent from "./pages/OAuthConsent";
import AdminIndex from "./pages/admin/AdminIndex";
import MillDetails from "./pages/admin/MillDetails";
import { AdminRoute } from "./components/AdminRoute";

const queryClient = new QueryClient();

// SeasonGate was modified above to SeasonGateContent and moved inside ProtectedLayout structure

const HeaderBar = () => {
  const { user, signOut } = useAuth();
  const { activeSeason } = useSeason();
  const navigate = useNavigate();
  const { isAdmin } = useRole();

  return (
    <header className="h-16 border-b glass-bar flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden">
          <Menu className="h-5 w-5" />
        </SidebarTrigger>
        
        {!isAdmin && activeSeason && (
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-primary/10 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 transition-colors"
            onClick={() => navigate("/seasons")}
          >
            <Calendar className="h-3 w-3 me-1.5 text-primary" />
            <span className="text-primary">{activeSeason.name}</span>
          </Badge>
        )}

        {isAdmin && (
          <Badge
            variant="secondary"
            className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold px-3 py-1.5 rounded-full"
          >
            <ShieldCheck className="h-3.5 w-3.5 me-1.5 text-amber-600" />
            <span>لوحة تحكم المشرف العام</span>
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Add - Only for Mill Owners/Employees */}
        {!isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-full gap-1.5 shadow-sm">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">إضافة سريعة</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/customers")} className="gap-2 py-2.5">
                <Users className="h-4 w-4 text-primary" />
                إضافة زبون
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/invoices")} className="gap-2 py-2.5">
                <Receipt className="h-4 w-4 text-primary" />
                إنشاء فاتورة
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/expenses")} className="gap-2 py-2.5">
                <Wallet className="h-4 w-4 text-primary" />
                إضافة مصروف
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-full">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isAdmin ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary"}`}>
                {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <User className="h-3.5 w-3.5" />}
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">
                {isAdmin ? "مشرف المنصة العام" : "مالك المعصرة"}
              </p>
            </div>
            <DropdownMenuSeparator />
            {!isAdmin ? (
              <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
                <User className="h-4 w-4" />
                الإعدادات
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                لوحة المشرف
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

const SubscriptionGate = ({ children }: { children: React.ReactNode }) => {
  const { status, loading } = useSubscription();
  const { isAdmin, isEmployee } = useRole();
  const { signOut: authSignOut } = useAuth();

  const signOut = async () => {
    if (isEmployee) {
      localStorage.removeItem('employee_owner_id');
      window.location.href = '/auth';
    } else {
      await authSignOut();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">جارٍ التحقق من حالة الاشتراك...</p>
        </div>
      </div>
    );
  }

  if (isAdmin !== true && status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl">
        <div className="w-full max-w-md space-y-8 text-center bg-card p-8 rounded-2xl border shadow-sm">
          <div className="mx-auto w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-amber-600" />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {status === 'suspended' ? 'تم إيقاف حسابك مؤقتاً' : 'حسابك بانتظار التفعيل'}
            </h1>
            <p className="text-muted-foreground">
              {status === 'suspended' 
                ? 'يرجى مراجعة الإدارة لتفعيل حسابك ومتابعة العمل.' 
                : 'نحن نقوم بمراجعة بياناتك حالياً. سيتم تفعيل حسابك قريباً.'}
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-xl flex items-center justify-center gap-3">
            <Phone className="h-5 w-5 text-primary" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">للمساعدة والتفعيل اتصل بنا:</p>
              <p className="font-bold text-lg ltr">0569945677</p>
            </div>
          </div>

          <Button variant="outline" onClick={signOut} className="w-full gap-2">
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const ProtectedLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const { isAdmin, isEmployee } = useRole();

  return (
    <SubscriptionProvider>
      <SubscriptionGate>
        <SeasonProvider>
          <SidebarProvider>
            <div className="min-h-screen flex w-full bg-background" dir="rtl">
              <AppSidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <HeaderBar />
                <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
                  <Routes>
                    {/* Admin Dedicated Routes */}
                    {isAdmin ? (
                      <>
                        <Route path="/admin" element={<AdminIndex />} />
                        <Route path="/admin/mill/:id" element={<MillDetails />} />
                        <Route path="*" element={<Navigate to="/admin" replace />} />
                      </>
                    ) : !isEmployee ? (
                      <>
                        <Route path="/seasons" element={<Seasons />} />
                        <Route path="/seasons/new" element={<SeasonSetup />} />
                        <Route path="/seasons/edit/:id" element={<SeasonSetup />} />
                        <Route path="/queue-display" element={<QueueDisplay />} />
                        <Route path="/*" element={<SeasonGateContent />} />
                      </>
                    ) : (
                      <Route path="/*" element={<EmployeeLayout />} />
                    )}
                  </Routes>
                </main>
              </div>
            </div>
          </SidebarProvider>
        </SeasonProvider>
      </SubscriptionGate>
    </SubscriptionProvider>
  );
};

const EmployeeLayout = () => {
  const { activeSeason, loading } = useSeason();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (!activeSeason) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-xl font-bold mb-2">لا يوجد موسم نشط</h2>
        <p className="text-muted-foreground">يجب على صاحب المعصرة تفعيل موسم أولاً.</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/queue" element={<Queue />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="*" element={<Navigate to="/queue" replace />} />
    </Routes>
  );
};

const SeasonGateContent = () => {
  const { activeSeason, loading } = useSeason();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (!activeSeason) {
    return <Navigate to="/seasons" replace />;
  }

  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/queue" element={<Queue />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/workers" element={<Workers />} />
      <Route path="/oil-trading" element={<OilTrading />} />
      <Route path="/expenses" element={<Expenses />} />
      <Route path="/inventory" element={<Inventory />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RoleProvider>
            <SubscriptionProvider>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/display/:seasonId" element={<PublicQueueDisplay />} />
                <Route path="/oauth/consent" element={<OAuthConsent />} />
                <Route path="/*" element={<ProtectedLayout />} />
              </Routes>
            </SubscriptionProvider>
          </RoleProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
