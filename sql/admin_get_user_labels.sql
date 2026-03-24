-- =============================================================================
-- Nomes para o painel admin (ex.: denunciantes em event_reports) — lê auth.users
-- com a mesma lógica de admin_list_users. Só administrador.
-- Rode no SQL Editor do Supabase → Settings → API → Reload schema.
-- =============================================================================

create or replace function public.admin_get_user_labels(p_user_ids uuid[])
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return '{}'::json;
  end if;

  return coalesce((
    select json_object_agg(
      u.id::text,
      coalesce(
        nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(u.raw_user_meta_data->>'name'), ''),
        nullif(trim(u.raw_user_meta_data->>'given_name'), ''),
        nullif(trim(u.raw_user_meta_data->>'nickname'), ''),
        nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
        split_part(u.email::text, '@', 1)
      )
    )
    from auth.users u
    where u.id = any(p_user_ids)
  ), '{}'::json);
end;
$$;

revoke all on function public.admin_get_user_labels(uuid[]) from public;
grant execute on function public.admin_get_user_labels(uuid[]) to authenticated;

comment on function public.admin_get_user_labels(uuid[]) is
  'Mapa id (texto) → nome legível a partir de auth.users; só is_current_user_admin.';
