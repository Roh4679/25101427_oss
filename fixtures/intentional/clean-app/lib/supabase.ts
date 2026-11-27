import { createClient } from "@supabase/supabase-js";

// anon 키는 공개용으로 설계된 키다. RLS로 보호한다.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
