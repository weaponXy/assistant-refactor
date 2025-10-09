import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  globalThis.__sb_singleton__ ??
  createClient(url, key, {
    auth: { persistSession: true, detectSessionInUrl: true, storageKey: "sb-buiswaiz-auth" },
  });

if (!globalThis.__sb_singleton__) globalThis.__sb_singleton__ = supabase;
