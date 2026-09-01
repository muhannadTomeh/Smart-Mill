import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";

export interface DailyInventory {
  id?: string;
  oil_amount: number;
  cash_amount: number;
  container_count: number;
  inventory_date: string;
}

export function useDailyInventory() {
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const [dailyInv, setDailyInv] = useState<DailyInventory | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (user && activeSeason) {
      fetchDailyInv();
    }
  }, [user, activeSeason]);

  const fetchDailyInv = async () => {
    if (!user || !activeSeason) return;
    setLoading(true);
    
    // Using any to bypass type errors temporarily for new table
    const { data, error } = await (supabase
      .from("daily_inventory" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("season_id", activeSeason.id)
      .eq("inventory_date", today)
      .maybeSingle() as any);

    if (error) {
      console.error("Error fetching daily inventory:", error);
    }

    if (data) {
      setDailyInv(data as DailyInventory);
    } else {
      // Initialize for today if not exists
      const { data: newData } = await (supabase
        .from("daily_inventory" as any)
        .insert({
          user_id: user.id,
          season_id: activeSeason.id,
          inventory_date: today,
          oil_amount: 0,
          cash_amount: 0,
          container_count: 0
        })
        .select()
        .single() as any);
      
      if (newData) setDailyInv(newData as DailyInventory);
    }
    setLoading(false);
  };

  const updateDailyInv = async (updates: Partial<DailyInventory>) => {
    if (!user || !activeSeason || !dailyInv?.id) return;
    
    const { error } = await supabase
      .from("daily_inventory" as any)
      .update(updates)
      .eq("id", dailyInv.id);

    if (!error) {
      setDailyInv(prev => prev ? { ...prev, ...updates } : null);
    }
    return { error };
  };

  return { dailyInv, loading, updateDailyInv, refetch: fetchDailyInv };
}
