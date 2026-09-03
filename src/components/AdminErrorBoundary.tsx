import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, ArrowRight } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AdminErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Admin page error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-2xl mx-auto text-right" dir="rtl">
          <Card className="border-destructive/30 bg-destructive/5 text-right">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive text-lg text-right">
                <AlertTriangle className="h-5 w-5" />
                <span>حدث خطأ أثناء عرض الصفحة</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <p className="text-sm text-foreground">
                تعذر تحميل تفاصيل المعصرة بشكل كامل بسبب خطأ في البيانات.
              </p>
              {this.state.error?.message && (
                <div className="p-3 bg-muted/60 rounded-lg text-xs font-mono text-muted-foreground break-all text-left" dir="ltr">
                  {this.state.error.message}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-2 justify-start">
              <Button 
                variant="outline" 
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>إعادة المحاولة</span>
              </Button>
              <Button 
                variant="default" 
                onClick={() => window.location.href = "/admin"}
                className="gap-2"
              >
                <ArrowRight className="h-4 w-4" />
                <span>العودة لسجل المعاصر</span>
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
