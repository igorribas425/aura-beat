-- Aura Beat: impede que um administrador analise a propria verificacao.
-- Aplicar manualmente somente depois da migration 006.

create or replace function public.admin_review_verification(
  p_kind text,
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_status text;
  profile_id uuid;
  subject_user_id uuid;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if current_user_id is null then
    raise exception 'Autenticacao obrigatoria';
  end if;

  if not public.is_aura_admin() then
    raise exception 'Acesso administrativo negado';
  end if;

  if p_kind not in ('artist','venue') then
    raise exception 'Tipo de verificacao invalido';
  end if;

  if p_action not in ('verified','rejected','suspended') then
    raise exception 'Acao administrativa invalida';
  end if;

  if p_action in ('rejected','suspended') and clean_reason is null then
    raise exception 'Informe o motivo da decisao';
  end if;

  if p_action = 'suspended'
     and not public.is_aura_admin(array['admin','owner']::text[]) then
    raise exception 'Apenas admin ou owner pode suspender perfis';
  end if;

  if p_kind = 'artist' then
    select request.status, request.artist_id, request.user_id
      into current_status, profile_id, subject_user_id
    from public.artist_verification_requests request
    where request.id = p_request_id
    for update;

    if not found then
      raise exception 'Solicitacao de Artista nao encontrada';
    end if;

    if subject_user_id = current_user_id then
      raise exception 'Nao e permitido revisar a propria verificacao';
    end if;

    if p_action = 'suspended' then
      if current_status <> 'verified' then
        raise exception 'Somente uma verificacao aprovada pode ser suspensa';
      end if;

      update public.artist_profiles
      set verification_status = 'suspended'
      where id = profile_id;
    else
      if current_status <> 'pending' then
        raise exception 'Esta solicitacao ja foi analisada';
      end if;

      update public.artist_verification_requests
      set
        status = p_action,
        rejection_reason = case when p_action = 'rejected' then clean_reason else null end,
        reviewed_at = now(),
        updated_at = now()
      where id = p_request_id;
    end if;
  else
    select request.status, request.venue_id, request.user_id
      into current_status, profile_id, subject_user_id
    from public.venue_verification_requests request
    where request.id = p_request_id
    for update;

    if not found then
      raise exception 'Solicitacao de Casa nao encontrada';
    end if;

    if subject_user_id = current_user_id then
      raise exception 'Nao e permitido revisar a propria verificacao';
    end if;

    if p_action = 'suspended' then
      if current_status <> 'verified' then
        raise exception 'Somente uma verificacao aprovada pode ser suspensa';
      end if;

      update public.venue_profiles
      set verification_status = 'suspended'
      where id = profile_id;
    else
      if current_status <> 'pending' then
        raise exception 'Esta solicitacao ja foi analisada';
      end if;

      update public.venue_verification_requests
      set
        status = p_action,
        rejection_reason = case when p_action = 'rejected' then clean_reason else null end,
        reviewed_at = now(),
        updated_at = now()
      where id = p_request_id;
    end if;
  end if;

  insert into public.verification_review_audit (
    request_kind,
    request_id,
    subject_profile_id,
    action,
    reason,
    reviewed_by
  ) values (
    p_kind,
    p_request_id,
    profile_id,
    p_action,
    clean_reason,
    current_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'kind', p_kind,
    'request_id', p_request_id,
    'action', p_action,
    'profile_id', profile_id
  );
end;
$$;

revoke all on function public.admin_review_verification(text,uuid,text,text) from public;
grant execute on function public.admin_review_verification(text,uuid,text,text) to authenticated;

comment on function public.admin_review_verification(text,uuid,text,text) is
  'RPC protegida para revisar verificacoes; impede que o admin revise a propria conta.';
