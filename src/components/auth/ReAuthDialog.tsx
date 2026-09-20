import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminWorkspace } from "@/contexts/AdminWorkspaceContext";
import { ShieldCheck, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const ReAuthDialog = () => {
  const { isReAuthModalOpen, closeReAuthModal, verifyAndEnterAdminWorkspace } = useAdminWorkspace();
  const { toast } = useToast();

  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleClose = () => {
    if (loading) return;
    setPin("");
    setErrorMessage("");
    setShowPin(false);
    closeReAuthModal();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorMessage("يرجى إدخال رمز PIN لوحة الإدارة");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const result = await verifyAndEnterAdminWorkspace(pin.trim());

    setLoading(false);

    if (result.success) {
      setPin("");
      setShowPin(false);
      toast({
        title: "تم التحقق بنجاح",
        description: "مرحباً بك في لوحة الإدارة والتحكم",
      });
    } else {
      setErrorMessage(result.error || "رمز PIN غير صحيح");
    }
  };

  return (
    <Dialog open={isReAuthModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-[420px] rounded-2xl p-0 overflow-hidden"
        dir="rtl"
      >
        <div className="p-5 sm:p-6">
          <DialogHeader className="text-right sm:text-right space-y-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <DialogTitle className="text-lg font-bold">
              تأكيد الوصول إلى لوحة الإدارة
            </DialogTitle>

            <DialogDescription className="text-sm leading-6">
              أدخل رمز PIN الخاص بمالك المعصرة للوصول إلى إعدادات الإدارة.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-5">
            <div className="space-y-2">
              <Label
                htmlFor="admin-reauth-pin"
                className="text-sm font-medium"
              >
                رمز PIN
              </Label>

              <div className="relative">
                <Input
                  id="admin-reauth-pin"
                  type={showPin ? "text" : "password"}
                  placeholder="أدخل رمز PIN"
                  value={pin}
                  maxLength={8}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ""));
                    if (errorMessage) setErrorMessage("");
                  }}
                  disabled={loading}
                  autoFocus
                  className="h-11 pe-10 rounded-xl text-center font-mono tracking-[0.3em]"
                />

                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPin ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {errorMessage && (
                <p className="text-xs font-medium text-destructive">
                  {errorMessage}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                className="rounded-xl"
              >
                إلغاء
              </Button>

              <Button
                type="submit"
                disabled={loading || !pin.trim()}
                className="rounded-xl font-semibold gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جارٍ التحقق...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>دخول الإدارة</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
