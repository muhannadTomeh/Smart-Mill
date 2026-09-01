import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";

export interface Inventory {
  total_oil: number;
  total_cash: number;
}

export function useInventory() {
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const [inventory, setInventory] = useState<Inventory>({ total_oil: 0, total_cash: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activeSeason) return;
    fetchInventory();
  }, [user, activeSeason]);

  const fetchInventory = async () => {
    if (!user || !activeSeason) return;
    const { data } = await supabase
      .from("inventory")
      .select("*")
      .eq("user_id", user.id)
      .eq("season_id", activeSeason.id)
      .maybeSingle();

    if (data) {
      setInventory({ total_oil: Number(data.total_oil), total_cash: Number(data.total_cash) });
    } else {
      await supabase.from("inventory").insert({ user_id: user.id, season_id: activeSeason.id });
    }
    setLoading(false);
  };

  const updateInventory = async (changes: Partial<Inventory>) => {
    if (!user || !activeSeason) return;
    const { error } = await supabase
      .from("inventory")
      .update(changes)
      .eq("user_id", user.id)
      .eq("season_id", activeSeason.id);
    if (!error) {
      setInventory((prev) => ({ ...prev, ...changes }));
    }
    return { error };
  };

  return { inventory, loading, updateInventory, refetch: fetchInventory };
}
