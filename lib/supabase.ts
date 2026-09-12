import { createClient } from "@supabase/supabase-js";

// Local fallbacks let static builds complete without production credentials. They are
// never privileged and requests fail closed until the documented variables are set.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "local-build-publishable-key";

export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export const supabase = createClient(supabaseUrl, supabaseKey);
