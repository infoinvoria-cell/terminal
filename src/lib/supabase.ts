import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Guard: only create real client when URL is a valid https URL
const isValidUrl = supabaseUrl.startsWith("https://") && !supabaseUrl.includes("[");

export const supabase: SupabaseClient = isValidUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient("https://placeholder.supabase.co", "placeholder-anon-key");
