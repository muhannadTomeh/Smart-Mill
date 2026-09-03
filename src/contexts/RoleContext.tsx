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
    const checkRole = async (userId: string) => {
      // Check for employee session in local storage first
      const employeeOwnerId = localStorage.getItem('employee_owner_id');
      if (employeeOwnerId) {
        setIsEmployee(true);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'platform_admin'
      });

      if (error) {
        console.error("Error checking role:", error);
        setIsAdmin(false);
      } else {
        // Explicitly cast to boolean so null/undefined → false
        setIsAdmin(data === true);
      }
      setIsEmployee(false);
      setLoading(false);
    };

    // Listen to auth state changes — single source of truth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        // User logged out or no session
        setIsAdmin(false);
        setIsEmployee(false);
        setLoading(false);
      } else {
        setLoading(true);
        checkRole(session.user.id);
      }
    });

    // Seed initial state from existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setIsAdmin(false);
        setIsEmployee(false);
        setLoading(false);
      } else {
        checkRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <RoleContext.Provider value={{ isAdmin, isEmployee, loading }}>
      {children}
    </RoleContext.Provider>
  );
};
