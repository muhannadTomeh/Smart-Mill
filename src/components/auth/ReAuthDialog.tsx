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
import { useAuth } from "@/contexts/AuthContext";
import { ShieldCheck, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const ReAuthDialog = () => {
  const { isReAuthModalOpen, closeReAuthModal, verifyAndEnterAdminWorkspace } = useAdminWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleClose = () => {
    if (loading) return;
    setPassword("");
    setErrorMessage("");
    setShowPassword(false);
    closeReAuthModal();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage("يرجى إدخال كلمة المرور");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const result = await verifyAndEnterAdminWorkspace(password);

    setLoading(false);

    if (result.success) {
      setPassword("");
      setShowPassword(false);
      toast({
        title: "تم التحقق بنجاح",
        description: "مرحباً بك في لوحة الإدارة والتحكم",
      });
    } else {
      setErrorMessage(result.error || "كلمة المرور غير صحيحة");
    }
  };

  return (
    <Dialog open={isReAuthModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
        <DialogHeader className="text-right space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            تأكيد هوية المالك
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            للوصول إلى لوحة الإدارة والإحصاءات الحساسة، يرجى تأكيد كلمة مرور الحساب (
            <span className="font-semibold text-foreground font-mono text-[11px]">{user?.email}</span>):
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="admin-reauth-password" className="text-xs font-semibold">
              كلمة المرور
            </Label>
            <div className="relative">
              <Input
                id="admin-reauth-password"
                type={showPassword ? "text" : "password"}
                placeholder="أدخل كلمة المرور الحالية"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                disabled={loading}
                autoFocus
                className="pe-10 text-sm rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errorMessage && (
              <p className="text-xs font-medium text-destructive mt-1 flex items-center gap-1">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="rounded-xl w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={loading || !password.trim()}
              className="rounded-xl font-semibold w-full sm:w-auto gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جارٍ التحقق...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>تأكيد ودخول الإدارة</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
