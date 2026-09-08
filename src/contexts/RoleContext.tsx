import { createContext, useContext, ReactNode } from "react";
import { useAuth, AppUserRole } from "./AuthContext";

interface RoleContextType {
  isAdmin: boolean | null;
  isEmployee: boolean;
  isOwner: boolean;
  role: AppUserRole;
  loading: boolean;
}

const RoleContext = createContext<RoleContextType>({
  isAdmin: null,
  isEmployee: false,
  isOwner: false,
  role: null,
  loading: true,
});

export const useRole = () => useContext(RoleContext);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const { isPlatformAdmin, isEmployee, isMillOwner, currentRole, loading } = useAuth();

  return (
    <RoleContext.Provider
      value={{
        isAdmin: isPlatformAdmin,
        isEmployee,
        isOwner: isMillOwner,
        role: currentRole,
        loading,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};

