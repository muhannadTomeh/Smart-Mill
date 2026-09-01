import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RoleContextType {
  isAdmin: boolean | null;
  isEmployee: boolean;
  loading: boolean;
}

const RoleContext = createContext<RoleContextType>({
  isAdmin: null,
  isEmployee: false,
  loading: true,
});

export const useRole = () => useContext(RoleContext);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isEmployee, setIsEmployee] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setIsEmployee(false);
        setLoading(false);
        return;
      }

      // Check for employee session in local storage
      const employeeOwnerId = localStorage.getItem('employee_owner_id');
      if (employeeOwnerId) {
        setIsEmployee(true);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('has_role', { 
        _user_id: user.id, 
        _role: 'platform_admin' 
      });

      if (error) {
        console.error("Error checking role:", error);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data);
      }
      setLoading(false);
    };

    checkRole();
  }, []);

  return (
    <RoleContext.Provider value={{ isAdmin, isEmployee, loading }}>
      {children}
    </RoleContext.Provider>
  );
};
