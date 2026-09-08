import { createContext, useContext, ReactNode } from "react";
import { useAuth, AppRole } from "./AuthContext";

interface RoleContextType {
  isAdmin: boolean | null;
  isEmployee: boolean;
  isOwner?: boolean;
  role?: AppRole | null;
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
  const { isAdmin, isEmployee, isOwner, role, loading } = useAuth();

  return (
    <RoleContext.Provider value={{ isAdmin, isEmployee, isOwner, role, loading }}>
      {children}
    </RoleContext.Provider>
  );
};

