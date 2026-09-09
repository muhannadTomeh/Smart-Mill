import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface AdminWorkspaceContextType {
  isAdminWorkspace: boolean;
  isReAuthModalOpen: boolean;
  openReAuthModal: () => void;
  closeReAuthModal: () => void;
  verifyAndEnterAdminWorkspace: (password: string) => Promise<{ success: boolean; error?: string }>;
  exitAdminWorkspace: () => void;
}

const AdminWorkspaceContext = createContext<AdminWorkspaceContextType>({
  isAdminWorkspace: false,
  isReAuthModalOpen: false,
  openReAuthModal: () => {},
  closeReAuthModal: () => {},
  verifyAndEnterAdminWorkspace: async () => ({ success: false }),
  exitAdminWorkspace: () => {},
});

export const useAdminWorkspace = () => useContext(AdminWorkspaceContext);

export const AdminWorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [isAdminWorkspace, setIsAdminWorkspace] = useState(false);
  const [isReAuthModalOpen, setIsReAuthModalOpen] = useState(false);
  const { user, isOwner, isAdmin, isEmployee } = useAuth();
  const navigate = useNavigate();

  const isMillOwner = Boolean(isOwner || (!isAdmin && !isEmployee));

  const openReAuthModal = useCallback(() => {
    setIsReAuthModalOpen(true);
  }, []);

  const closeReAuthModal = useCallback(() => {
    setIsReAuthModalOpen(false);
  }, []);

  const verifyAndEnterAdminWorkspace = useCallback(
    async (password: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.email) {
        return { success: false, error: "لا يوجد بريد إلكتروني مرتبط بحساب المستخدم الحالي" };
      }

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: password.trim(),
        });

        if (error || !data.user) {
          return {
            success: false,
            error: "كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى",
          };
        }

        setIsAdminWorkspace(true);
        setIsReAuthModalOpen(false);
        navigate("/dashboard");
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || "حدث خطأ غير متوقع أثناء التحقق من الهوية",
        };
      }
    },
    [user?.email, navigate]
  );

  const exitAdminWorkspace = useCallback(() => {
    setIsAdminWorkspace(false);
    navigate("/queue");
  }, [navigate]);

  return (
    <AdminWorkspaceContext.Provider
      value={{
        isAdminWorkspace: isMillOwner ? isAdminWorkspace : false,
        isReAuthModalOpen,
        openReAuthModal,
        closeReAuthModal,
        verifyAndEnterAdminWorkspace,
        exitAdminWorkspace,
      }}
    >
      {children}
    </AdminWorkspaceContext.Provider>
  );
};
