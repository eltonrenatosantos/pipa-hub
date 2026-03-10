import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabaseUrl = 'https://yomipltdrorqhtqumjgo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbWlwbHRkcm9ycWh0cXVtamdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTk0ODIsImV4cCI6MjA4ODQzNTQ4Mn0.rw2Z5KhM-zhiPButXzVzyslsF22DpvYGRx4jnj6A3Rc'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
)