import { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AppErrorBoundary caught an unhandled runtime error:", error, errorInfo);
  }

  private handleResetCacheAndReload = () => {
    try {
      // Clear queue-specific and display-specific cached localStorage keys that might be corrupt
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("active_queue_") ||
            key.startsWith("queue_est_") ||
            key.startsWith("processing_started_") ||
            key.startsWith("display_settings_"))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}

    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto text-right" dir="rtl">
          <Card className="border-destructive/40 bg-card shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-destructive/10 border-b border-destructive/20 py-4 px-5">
              <CardTitle className="flex items-center gap-2.5 text-destructive text-lg font-bold">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>{this.props.fallbackTitle || "حدث خطأ غير متوقع أثناء عرض الصفحة"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5 text-right">
              <p className="text-sm text-foreground leading-relaxed">
                واجه النظام خطأ برمجياً غير متوقع أثناء معالجة بيانات هذه الصفحة. لمنع توقف التطبيق أو ظهور شاشة بيضاء فارغة، تم حصر الخطأ وتوفير خيارات الاستعادة الفورية أدناه.
              </p>

              {this.state.error?.message && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">تفاصيل الخطأ التقني:</span>
                  <div
                    className="p-3 bg-muted/80 border border-border rounded-xl text-xs font-mono text-destructive break-all text-left max-h-36 overflow-y-auto"
                    dir="ltr"
                  >
                    {this.state.error.name}: {this.state.error.message}
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2.5 justify-start bg-muted/20 border-t border-border/60 p-4">
              <Button
                variant="default"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="gap-1.5 text-xs font-semibold h-9"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>إعادة تحميل الصفحة</span>
              </Button>

              <Button
                variant="outline"
                onClick={this.handleResetCacheAndReload}
                className="gap-1.5 text-xs font-medium h-9 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                title="مسح بيانات الطابور المخزنة محلياً في المتصفح وإعادة التحميل"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>مسح الذاكرة المؤقتة وإعادة التحميل</span>
              </Button>

              <Button
                variant="ghost"
                onClick={() => (window.location.href = "/dashboard")}
                className="gap-1.5 text-xs font-medium h-9 text-muted-foreground hover:text-foreground"
              >
                <Home className="h-3.5 w-3.5" />
                <span>الرئيسية</span>
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
