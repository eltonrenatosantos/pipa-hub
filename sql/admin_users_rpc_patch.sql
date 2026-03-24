/*
  =============================================================================
  PATCH MÍNIMO — corre o BLOCO INTEIRO no SQL Editor do MESMO projeto que o app usa (URL em js/supabase.js).
  Corrige: "relation public.profiles does not exist" e 404 nas RPCs em falta.
  Depois: Supabase → Settings → API → Reload schema (ou espera ~1 min).
  =============================================================================
*/

create or replace function public.admin_users_count()
returns bigint
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not coalesce(public.is_current_user_admin(), false) then
    return null;
  end if;
  return (select count(*)::bigint from auth.users);
end;
$$;

revoke all on function public.admin_users_count() from public;
grant execute on function public.admin_users_count() to authenticated;


create or replace function public.admin_list_users(p_limit integer default 200)
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  lim int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Acesso negado: apenas administrador.' using errcode = '42501';
  end if;

  return coalesce((
    select json_agg(row_to_json(t))
    from (
      select
        u.id,
        u.email::text as email,
        coalesce(
          nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
          nullif(trim(u.raw_user_meta_data->>'name'), ''),
          nullif(trim(u.raw_user_meta_data->>'given_name'), ''),
          nullif(trim(u.raw_user_meta_data->>'nickname'), ''),
          nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
          split_part(u.email::text, '@', 1)
        ) as nome,
        nullif(trim(coalesce(
          u.raw_user_meta_data->>'avatar_url',
          u.raw_user_meta_data->>'picture'
        )), '') as avatar_url,
        u.created_at
      from auth.users u
      order by u.created_at desc nulls last
      limit lim
    ) t
  ), '[]'::json);
end;
$$;

revoke all on function public.admin_list_users(integer) from public;
grant execute on function public.admin_list_users(integer) to authenticated;
