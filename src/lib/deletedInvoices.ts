import { supabase } from "@/integrations/supabase/client";
import { getArabicErrorMessage } from "@/lib/errorMessages";
import { parseEstimatedMinutes } from "@/lib/queueUtils";

export interface DeletedInvoice {
  id: string;
  name: string;
  phone: string | null;
  position: number;
  bags: number;
  notes: string | null;
  status: string;
  season_id?: string | null;
  mill_id?: string | null;
  user_id?: string | null;
  customer_id?: string | null;
  estimated_minutes?: number | null;
  deleted_at: string; // ISO
  expires_at: string; // ISO (24h after deleted_at)
  source?: "queue_completed" | "invoice";
  oil_produced?: number;
}

const STORAGE_PREFIX = "deleted_invoices_";
const CHANNEL_NAME = "smart_mill_deleted_invoices_channel";

/**
 * Returns the storage key for a season or fallback
 */
function getStorageKey(seasonId?: string | null): string {
  return `${STORAGE_PREFIX}${seasonId || "default"}`;
}

/**
 * Clean up expired items (> 24 hours old) and return valid ones
 */
export function getDeletedInvoices(seasonId?: string | null): DeletedInvoice[] {
  try {
    const key = getStorageKey(seasonId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed: DeletedInvoice[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    // Keep only items that have not expired yet (within 24 hours)
    const valid = parsed.filter((item) => {
      const exp = new Date(item.expires_at).getTime();
      return !isNaN(exp) && exp > now;
    });

    // If some were purged, save back the cleaned list
    if (valid.length !== parsed.length) {
      localStorage.setItem(key, JSON.stringify(valid));
    }

    // Sort newest deletion first
    return valid.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
  } catch (err) {
    console.error("Error reading deleted invoices:", err);
    return [];
  }
}

/**
 * Save an invoice to the deleted items pool (persisted for 24 hours)
 */
export function saveDeletedInvoice(item: Omit<DeletedInvoice, "expires_at"> & { expires_at?: string }): void {
  try {
    const key = getStorageKey(item.season_id);
    const existing = getDeletedInvoices(item.season_id);

    // Filter out if already exists
    const filtered = existing.filter((i) => i.id !== item.id);

    const fullItem: DeletedInvoice = {
      ...item,
      expires_at: item.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const updated = [fullItem, ...filtered];
    localStorage.setItem(key, JSON.stringify(updated));

    // Notify other components/tabs
    notifyDeletedChange(item.season_id);
  } catch (err) {
    console.error("Error saving deleted invoice:", err);
  }
}

/**
 * Remove a deleted invoice permanently from the pool
 */
export function removeDeletedInvoice(id: string, seasonId?: string | null): void {
  try {
    const key = getStorageKey(seasonId);
    const existing = getDeletedInvoices(seasonId);
    const updated = existing.filter((i) => i.id !== id);
    localStorage.setItem(key, JSON.stringify(updated));
    notifyDeletedChange(seasonId);
  } catch (err) {
    console.error("Error removing deleted invoice:", err);
  }
}

/**
 * Clear all deleted invoices for a season
 */
export function clearAllDeletedInvoices(seasonId?: string | null): void {
  try {
    const key = getStorageKey(seasonId);
    localStorage.removeItem(key);
    notifyDeletedChange(seasonId);
  } catch (err) {
    console.error("Error clearing deleted invoices:", err);
  }
}

/**
 * Restores a deleted queue entry atomically at its previous position.
 */
export async function restoreDeletedInvoiceToQueue(
  item: DeletedInvoice,
  millId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const targetMillId = item.mill_id || millId || null;
    const estimatedMinutes = item.estimated_minutes ?? parseEstimatedMinutes(item);
    const { error } = await supabase.rpc("restore_queue_entry_command", {
      p_queue_id: item.id,
      p_mill_id: targetMillId,
      p_season_id: item.season_id || null,
      p_customer_id: item.customer_id || null,
      p_name: item.name,
      p_phone: item.phone,
      p_bags: item.bags,
      p_notes: item.notes,
      p_previous_status: item.status,
      p_previous_position: item.position,
      p_estimated_minutes: estimatedMinutes,
    });

    if (error) {
      console.error("Failed to restore queue entry in Supabase:", error);
      return { success: false, error: getArabicErrorMessage(error, "تعذر استرجاع الزبون إلى مكانه السابق.") };
    }

    // 2. Remove from deleted invoices pool
    removeDeletedInvoice(item.id, item.season_id);
    return { success: true };
  } catch (err: any) {
    console.error("Unexpected error restoring invoice:", err);
    return { success: false, error: getArabicErrorMessage(err, "حدث خطأ غير متوقع أثناء الاسترجاع.") };
  }
}

/**
 * Format remaining time until 24h expiration
 */
export function formatRemainingTime(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "منتهية الصلاحية";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours} ساعة و ${minutes} دقيقة`;
  }
  return `${minutes} دقيقة`;
}

function notifyDeletedChange(seasonId?: string | null) {
  try {
    window.dispatchEvent(new CustomEvent("deleted_invoices_updated", { detail: { seasonId } }));
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage({ type: "DELETED_INVOICES_UPDATED", seasonId });
    bc.close();
  } catch {}
}
