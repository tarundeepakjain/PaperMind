import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase configuration environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Always fetches a fresh, valid access token from the current session.
 * Falls back to refreshing the session if needed.
 */
export async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  
  // Try to refresh if session exists but token is stale
  const { data: refreshData } = await supabase.auth.refreshSession();
  return refreshData?.session?.access_token ?? null;
}
