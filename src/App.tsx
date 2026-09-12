import { useEffect } from "react";
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
import { AdminWorkspaceProvider, useAdminWorkspace } from "@/contexts/AdminWorkspaceContext";
import { CashSessionProvider } from "@/contexts/CashSessionContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Calendar, Plus, Users, Receipt, Wallet, User, ChevronDown, Menu, Lock, Phone, ShieldCheck, Undo2 } from "lucide-react";
import { ReAuthDialog } from "@/components/auth/ReAuthDialog";
import { CashSessionBanner } from "@/components/CashSessionBanner";
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
import InvoicesHistory from "./pages/InvoicesHistory";
import DailyClosing from "./pages/DailyClosing";
import Customers from "./pages/Customers";
import Workers from "./pages/Workers";
import OilTrading from "./pages/OilTrading";
import Expenses from "./pages/Expenses";
import Inventory from "./pages/Inventory";
import Payables from "./pages/Payables";
import Partners from "./pages/Partners";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import FinancialLedger from "./pages/FinancialLedger";
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
import { AdminErrorBoundary } from "./components/AdminErrorBoundary";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

const queryClient = new QueryClient();

// SeasonGate was modified above to SeasonGateContent and moved inside ProtectedLayout structure

const HeaderBar = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin, isOwner, isEmployee } = useRole();
  const { activeSeason } = useSeason();
  const { isAdminWorkspace, openReAuthModal, exitAdminWorkspace } = useAdminWorkspace();

  const isMillOwner = Boolean(isOwner || (!isAdmin && !isEmployee));
  const canNavigateToSeasons = !isEmployee && (!isOwner || isAdminWorkspace);

  return (
    <header className="h-16 border-b glass-bar flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden">
          <Menu className="h-5 w-5" />
        </SidebarTrigger>
        
        {!isAdmin && activeSeason && (
          <Badge
            variant="secondary"
            className={`text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 transition-colors flex items-center gap-1.5 ${
              canNavigateToSeasons ? "cursor-pointer hover:bg-primary/10" : "cursor-default"
            }`}
            onClick={() => {
              if (canNavigateToSeasons) {
                navigate("/seasons");
              }
            }}
            title={
              canNavigateToSeasons
                ? "الموسم الفعّال حالياً — اضغط لإدارة وتغيير المواسم"
                : `الموسم الفعّال حالياً: ${activeSeason.name}`
            }
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary font-semibold">{activeSeason.name}</span>
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
        {/* Cash Session Banner - only for non-admin mill users */}
        {!isAdmin && <CashSessionBanner />}

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
              {!isEmployee && (
                <DropdownMenuItem onClick={() => navigate("/customers")} className="gap-2 py-2.5">
                  <Users className="h-4 w-4 text-primary" />
                  إضافة زبون
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate("/invoices")} className="gap-2 py-2.5">
                <Receipt className="h-4 w-4 text-primary" />
                إنشاء فاتورة
              </DropdownMenuItem>
              {!isEmployee && (
                <DropdownMenuItem onClick={() => navigate("/expenses")} className="gap-2 py-2.5">
                  <Wallet className="h-4 w-4 text-primary" />
                  إضافة مصروف
                </DropdownMenuItem>
              )}
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
                {isAdmin ? "مشرف المنصة العام" : isEmployee ? "موظف الكاشير" : isMillOwner && isAdminWorkspace ? "مالك المعصرة (لوحة الإدارة)" : "مالك المعصرة"}
              </p>
            </div>
            <DropdownMenuSeparator />
            {isAdmin ? (
              <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                لوحة المشرف العام
              </DropdownMenuItem>
            ) : isMillOwner ? (
              <>
                {!isAdminWorkspace ? (
                  <DropdownMenuItem onClick={openReAuthModal} className="gap-2 font-medium text-primary">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    لوحة الإدارة
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
                      <User className="h-4 w-4" />
                      إعدادات المعصرة
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exitAdminWorkspace} className="gap-2 font-medium text-amber-700 dark:text-amber-400">
                      <Undo2 className="h-4 w-4" />
                      الخروج من لوحة الإدارة
                    </DropdownMenuItem>
                  </>
                )}
              </>
            ) : null}

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
  const { status, loading: subLoading } = useSubscription();
  const { isAdmin, isEmployee, loading: roleLoading } = useRole();
  const { signOut: authSignOut } = useAuth();

  // Platform admin is always exempt from subscription check - instant bypass without delay
  if (!roleLoading && isAdmin === true) {
    return <>{children}</>;
  }

  const loading = subLoading || roleLoading;

  const signOut = async () => {
    localStorage.removeItem('employee_owner_id');
    await authSignOut();
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
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isEmployee, loading: roleLoading } = useRole();

  if (authLoading || roleLoading) {
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

  // Admin layout: never enters SubscriptionProvider or SubscriptionGate
  if (isAdmin) {
    return (
      <SeasonProvider>
        <SidebarProvider>
          <div className="min-h-screen flex w-full bg-background" dir="rtl">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <HeaderBar />
              <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
                <Routes>
                  <Route path="/admin" element={<AdminErrorBoundary><AdminIndex /></AdminErrorBoundary>} />
                  <Route path="/admin/mill/:id" element={<AdminErrorBoundary><MillDetails /></AdminErrorBoundary>} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </main>
            </div>
          </div>
        </SidebarProvider>
      </SeasonProvider>
    );
  }

  // Regular Mill Owners & Cashier Employees
  return (
    <SubscriptionGate>
      <SeasonProvider>
        <CashSessionProvider>
          <AdminWorkspaceProvider>
            <SidebarProvider>
              <div className="min-h-screen flex w-full bg-background" dir="rtl">
                <AppSidebar />
                <div className="flex-1 flex flex-col min-w-0">
                  <HeaderBar />
                  <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
                    <AppErrorBoundary>
                      <SeasonGateContent />
                    </AppErrorBoundary>
                  </main>
                </div>
              </div>
              <ReAuthDialog />
            </SidebarProvider>
          </AdminWorkspaceProvider>
        </CashSessionProvider>
      </SeasonProvider>
    </SubscriptionGate>
  );
};

// Route Guard: Restricts sensitive management pages to Owner in verified Admin Workspace mode
const AdminRouteGuard = ({ children }: { children: React.ReactNode }) => {
  const { isOwner, isEmployee, isAdmin, loading } = useRole();
  const { isAdminWorkspace } = useAdminWorkspace();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isMillOwner = Boolean(isOwner || (!isAdmin && !isEmployee));

  // 1. Employee is strictly forbidden from accessing admin pages
  if (isEmployee || !isMillOwner) {
    return <Navigate to="/queue" replace />;
  }

  // 2. Owner must have unlocked the Admin Workspace with their password
  if (!isAdminWorkspace) {
    return <Navigate to="/queue" replace />;
  }

  return <>{children}</>;
};

const SeasonGateContent = () => {
  const { activeSeason, loading } = useSeason();
  const { isOwner, isAdmin, isEmployee } = useRole();

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

  const isMillOwner = Boolean(isOwner || (!isAdmin && !isEmployee));

  // If no active season exists yet:
  if (!activeSeason) {
    if (isMillOwner) {
      return (
        <Routes>
          <Route path="/seasons" element={<Seasons />} />
          <Route path="/seasons/new" element={<SeasonSetup />} />
          <Route path="/seasons/edit/:id" element={<SeasonSetup />} />
          <Route path="*" element={<Navigate to="/seasons" replace />} />
        </Routes>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-xl font-bold mb-2">لا يوجد موسم نشط</h2>
        <p className="text-muted-foreground">يجب على صاحب المعصرة تفعيل موسم أولاً.</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* 1. Operational Workspace Routes (Shared by Owner and Employee) */}
      <Route path="/queue" element={<Queue />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/invoices-history" element={<InvoicesHistory />} />
      <Route path="/oil-trading" element={<OilTrading />} />
      <Route path="/daily-closing" element={<DailyClosing />} />
      <Route path="/queue-display" element={<QueueDisplay />} />

      {/* 2. Admin Workspace Routes (Owner Only + Re-authenticated) */}
      <Route path="/dashboard" element={<AdminRouteGuard><Dashboard /></AdminRouteGuard>} />
      <Route path="/expenses" element={<AdminRouteGuard><Expenses /></AdminRouteGuard>} />
      <Route path="/payables" element={<AdminRouteGuard><Payables /></AdminRouteGuard>} />
      <Route path="/partners" element={<AdminRouteGuard><Partners /></AdminRouteGuard>} />
      <Route path="/reports" element={<AdminRouteGuard><Reports /></AdminRouteGuard>} />
      <Route path="/financial-ledger" element={<AdminRouteGuard><FinancialLedger /></AdminRouteGuard>} />
      <Route path="/workers" element={<AdminRouteGuard><Workers /></AdminRouteGuard>} />
      <Route path="/customers" element={<AdminRouteGuard><Customers /></AdminRouteGuard>} />
      <Route path="/inventory" element={<AdminRouteGuard><Inventory /></AdminRouteGuard>} />
      <Route path="/seasons" element={<AdminRouteGuard><Seasons /></AdminRouteGuard>} />
      <Route path="/seasons/new" element={<AdminRouteGuard><SeasonSetup /></AdminRouteGuard>} />
      <Route path="/seasons/edit/:id" element={<AdminRouteGuard><SeasonSetup /></AdminRouteGuard>} />
      <Route path="/settings" element={<AdminRouteGuard><Settings /></AdminRouteGuard>} />
      <Route path="/notifications" element={<AdminRouteGuard><Notifications /></AdminRouteGuard>} />

      {/* Default Catch-all: Redirect to Queue */}
      <Route path="*" element={<Navigate to="/queue" replace />} />
    </Routes>
  );
};

// Global safeguard: prevents Radix UI / Sheet / Dialog from leaking pointer-events: none on body during rapid clicks or route changes
const RadixPointerEventsWatchdog = () => {
  useEffect(() => {
    const cleanup = () => {
      if (document.body.style.pointerEvents === "none") {
        const hasOpenDialog =
          document.querySelector('[data-state="open"][role="dialog"]') ||
          document.querySelector('[data-state="open"][role="alertdialog"]');
        if (!hasOpenDialog) {
          document.body.style.pointerEvents = "";
        }
      }
    };

    const observer = new MutationObserver(cleanup);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  return null;
};

const App = () => (
  <AppErrorBoundary fallbackTitle="تعذر تشغيل التطبيق">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RadixPointerEventsWatchdog />
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
  </AppErrorBoundary>
);

export default App;
