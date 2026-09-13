-- Aura Beat: Central Administrativa de Verificacao e Seguranca.
-- IMPORTANTE: revisar contra o schema remoto antes de aplicar.
-- Esta migration NAO deve ser aplicada automaticamente junto das migrations 001-003.
-- O frontend nunca recebe service_role. Acoes administrativas passam por RPCs
-- SECURITY DEFINER que validam o usuario autenticado em public.aura_admins.

create extension if not exists pgcrypto;

create table if not exists public.aura_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reviewer'
    check (role in ('reviewer','admin','owner')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aura_admins enable row level security;

drop policy if exists "aura_admins_select_self" on public.aura_admins;
create policy "aura_admins_select_self"
on public.aura_admins
for select
to authenticated
using (user_id = auth.uid());

-- Nenhuma policy INSERT/UPDATE/DELETE e criada para authenticated.
-- O cadastro e a manutencao de administradores devem ser feitos por operacao
-- administrativa controlada no banco, nunca pelo proprio usuario.

create or replace function public.is_aura_admin(
  allowed_roles text[] default array['reviewer','admin','owner']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.aura_admins admin
    where admin.user_id = auth.uid()
      and admin.is_active = true
      and admin.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_aura_admin(text[]) from public;
grant execute on function public.is_aura_admin(text[]) to authenticated;

-- Administradores podem consultar solicitacoes, mas continuam sem policy UPDATE.
-- Aprovar/reprovar/suspender so e possivel pela RPC protegida abaixo.
drop policy if exists "artist_verification_select_admin" on public.artist_verification_requests;
create policy "artist_verification_select_admin"
on public.artist_verification_requests
for select
to authenticated
using (public.is_aura_admin());

drop policy if exists "venue_verification_select_admin" on public.venue_verification_requests;
create policy "venue_verification_select_admin"
on public.venue_verification_requests
for select
to authenticated
using (public.is_aura_admin());

-- Garante leitura dos perfis necessarios para a Central, mesmo que outras
-- policies do projeto sejam endurecidas no futuro.
drop policy if exists "artist_profiles_select_admin" on public.artist_profiles;
create policy "artist_profiles_select_admin"
on public.artist_profiles
for select
to authenticated
using (public.is_aura_admin());

drop policy if exists "venue_profiles_select_admin" on public.venue_profiles;
create policy "venue_profiles_select_admin"
on public.venue_profiles
for select
to authenticated
using (public.is_aura_admin());

-- Documentos continuam em bucket privado. Admin somente ganha SELECT.
-- Nao existe policy administrativa de INSERT, UPDATE ou DELETE no Storage.
drop policy if exists "verification_documents_select_admin" on storage.objects;
create policy "verification_documents_select_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and public.is_aura_admin()
);

create table if not exists public.verification_review_audit (
  id uuid primary key default gen_random_uuid(),
  request_kind text not null check (request_kind in ('artist','venue')),
  request_id uuid not null,
  subject_profile_id uuid not null,
  action text not null check (action in ('verified','rejected','suspended')),
  reason text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists verification_review_audit_request_idx
  on public.verification_review_audit(request_kind, request_id, created_at desc);

create index if not exists verification_review_audit_reviewer_idx
  on public.verification_review_audit(reviewed_by, created_at desc);

alter table public.verification_review_audit enable row level security;

drop policy if exists "verification_review_audit_select_admin" on public.verification_review_audit;
create policy "verification_review_audit_select_admin"
on public.verification_review_audit
for select
to authenticated
using (public.is_aura_admin());

-- Nao existe policy de escrita no audit para authenticated.
-- O log so e gravado pela RPC abaixo.

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
    select request.status, request.artist_id
      into current_status, profile_id
    from public.artist_verification_requests request
    where request.id = p_request_id
    for update;

    if not found then
      raise exception 'Solicitacao de Artista nao encontrada';
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
      -- O trigger da migration 004 sincroniza artist_profiles.verification_status.
    end if;
  else
    select request.status, request.venue_id
      into current_status, profile_id
    from public.venue_verification_requests request
    where request.id = p_request_id
    for update;

    if not found then
      raise exception 'Solicitacao de Casa nao encontrada';
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
      -- O trigger da migration 005 sincroniza venue_profiles.verification_status.
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

comment on table public.aura_admins is
  'Administradores internos do Aura Beat. Sem escrita direta pelo frontend.';

comment on table public.verification_review_audit is
  'Auditoria imutavel das decisoes de verificacao feitas pela equipe Aura Beat.';

comment on function public.admin_review_verification(text,uuid,text,text) is
  'RPC protegida para aprovar, recusar ou suspender verificacoes sem expor service_role.';
