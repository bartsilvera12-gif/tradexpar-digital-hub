/**
 * Alias del cliente de datos `tradexpar` (mismo que `getSupabaseData()`).
 */
import { getSupabaseData, isSupabaseConfigured } from "@/lib/supabaseClient";

export function isTradexparSupabaseConfigured(): boolean {
  return isSupabaseConfigured();
}

export function getTradexparSupabase() {
  return getSupabaseData();
}
