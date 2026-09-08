import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export type SubscriptionStatus = 'pending' | 'active' | 'suspended';

interface SubscriptionContextType {
  status: SubscriptionStatus | null;
  loading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  status: null,
  loading: true,
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user, millId, mill, isAdmin, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchStatus = async () => {
      if (authLoading) return;

      if (!user) {
        if (isMounted) {
          setStatus(null);
          setLoading(false);
        }
        return;
      }

      // Rule 5: Platform Admin never requires mill_id or membership and is never blocked by subscription
      if (isAdmin === true) {
        if (isMounted) {
          setStatus('active');
          setLoading(false);
        }
        return;
      }

      // 1. Fast path: mill metadata already retrieved in AuthContext
      if (mill?.subscription_status) {
        if (isMounted) {
          setStatus(mill.subscription_status as SubscriptionStatus);
          setLoading(false);
        }
        return;
      }

      // 2. Canonical query: fetch subscription_status from mills table using millId
      if (millId) {
        try {
          const { data: millData, error } = await supabase
            .from('mills')
            .select('subscription_status')
            .eq('id', millId)
            .maybeSingle();

          if (!error && millData?.subscription_status) {
            if (isMounted) {
              setStatus(millData.subscription_status as SubscriptionStatus);
              setLoading(false);
            }
            return;
          }
        } catch (err) {
          console.error("Error querying mills subscription status:", err);
        }
      }

      // 3. Fallback for unmigrated legacy users
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('subscription_status')
          .eq('user_id', user.id)
          .maybeSingle();

        if (isMounted) {
          if (!error && data?.subscription_status) {
            setStatus(data.subscription_status as SubscriptionStatus);
          } else {
            setStatus('pending');
          }
          setLoading(false);
        }
      } catch (err) {
        console.error("Error fetching fallback subscription status:", err);
        if (isMounted) {
          setStatus('pending');
          setLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, [user, millId, mill, isAdmin, authLoading]);

  return (
    <SubscriptionContext.Provider value={{ status, loading }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

