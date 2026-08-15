// Public Supabase config. The anon key is a PUBLIC key by design (Supabase
// docs: safe to ship in client code); Row Level Security is what protects the
// data. Env vars override these when present (local dev, other projects).
export const PUBLIC_SUPABASE_URL = 'https://mzvmhjurvpstlbfzkuid.supabase.co';
export const PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dm1oanVydnBzdGxiZnprdWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NzI0NDgsImV4cCI6MjEwMjM0ODQ0OH0.p23magsled1CqbVDRXLVduZj1p1_WXm7VtTsZvD8-Sk';
