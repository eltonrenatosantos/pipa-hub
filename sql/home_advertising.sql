-- =============================================================================
-- Publicidade na home (banner) — tabela + RLS
-- Rode no SQL Editor do Supabase (mesmo projeto do app).
-- Requer: public.is_current_user_admin() já existente.
-- =============================================================================

create table if not exists public.home_advertising (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '',
  image_url text not null default '',
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  link_url text,
  created_at timestamptz not null default now(),
  constraint home_advertising_dates_ok check (end_date >= start_date)
);

create index if not exists home_advertising_active_dates_idx
  on public.home_advertising (is_active, start_date, end_date, created_at desc);

comment on table public.home_advertising is
  'Banners publicitários na home; image_url pode ser URL https ou data URL (base64).';

alter table public.home_advertising enable row level security;

-- Leitura pública: só campanhas ativas e dentro do período (fuso São Paulo)
create policy "home_advertising_select_public"
  on public.home_advertising
  for select
  to anon, authenticated
  using (
    is_active = true
    and (timezone('America/Sao_Paulo', now()))::date >= start_date
    and (timezone('America/Sao_Paulo', now()))::date <= end_date
  );

-- Admin: tudo
create policy "home_advertising_all_admin"
  on public.home_advertising
  for all
  to authenticated
  using (coalesce(public.is_current_user_admin(), false))
  with check (coalesce(public.is_current_user_admin(), false));

grant select on public.home_advertising to anon, authenticated;
grant all on public.home_advertising to authenticated;
