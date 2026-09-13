-- Aura Beat: verificacao privada da Casa/empresa.
-- IMPORTANTE: migration preparada para revisao. Nao aplicar automaticamente no remoto.
-- Reutiliza o bucket privado verification-documents criado na verificacao do Artista.
-- O cliente autenticado pode enviar e ler somente os proprios arquivos.
-- Nenhuma policy permite ao cliente aprovar, reprovar ou suspender a propria Casa.

create extension if not exists pgcrypto;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'verification-documents',
  'verification-documents',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.venue_verification_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venue_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cnpj_snapshot text not null,
  trade_name_snapshot text not null,
  legal_name_snapshot text,
  business_document_type text not null
    check (business_document_type in ('cnpj_card','social_contract','mei_certificate','other')),
  business_document_path text not null,
  responsible_document_type text not null
    check (responsible_document_type in ('rg','cnh','passport','other')),
  responsible_document_front_path text not null,
  responsible_document_back_path text,
  selfie_path text not null,
  status text not null default 'pending'
    check (status in ('pending','verified','rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_verification_requests_venue_idx
  on public.venue_verification_requests(venue_id, submitted_at desc);

create index if not exists venue_verification_requests_user_idx
  on public.venue_verification_requests(user_id, submitted_at desc);

create unique index if not exists venue_verification_one_pending_idx
  on public.venue_verification_requests(venue_id)
  where status = 'pending';

alter table public.venue_verification_requests enable row level security;

drop policy if exists "venue_verification_select_own" on public.venue_verification_requests;
create policy "venue_verification_select_own"
on public.venue_verification_requests
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.venue_profiles venue
    where venue.id = venue_id
      and venue.owner_user_id = auth.uid()
  )
);

drop policy if exists "venue_verification_insert_own_pending" on public.venue_verification_requests;
create policy "venue_verification_insert_own_pending"
on public.venue_verification_requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and reviewed_at is null
  and rejection_reason is null
  and business_document_path like ('venue/' || auth.uid()::text || '/%')
  and responsible_document_front_path like ('venue/' || auth.uid()::text || '/%')
  and selfie_path like ('venue/' || auth.uid()::text || '/%')
  and (
    responsible_document_back_path is null
    or responsible_document_back_path like ('venue/' || auth.uid()::text || '/%')
  )
  and exists (
    select 1
    from public.venue_profiles venue
    where venue.id = venue_id
      and venue.owner_user_id = auth.uid()
  )
);

-- Nao existe policy UPDATE para authenticated.
-- Aprovacao/reprovacao deve ser feita apenas por backend confiavel ou operacao
-- administrativa autorizada.

create or replace function public.venue_verification_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_cnpj text;
begin
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'Usuario invalido para verificacao';
  end if;

  select regexp_replace(coalesce(venue.cnpj, ''), '\D', '', 'g')
    into current_cnpj
  from public.venue_profiles venue
  where venue.id = new.venue_id
    and venue.owner_user_id = new.user_id;

  if current_cnpj is null then
    raise exception 'Perfil de Casa nao pertence ao usuario';
  end if;

  new.cnpj_snapshot := regexp_replace(coalesce(new.cnpj_snapshot, ''), '\D', '', 'g');

  if length(new.cnpj_snapshot) <> 14 then
    raise exception 'CNPJ invalido para verificacao';
  end if;

  if new.cnpj_snapshot <> current_cnpj then
    raise exception 'CNPJ da solicitacao difere do perfil da Casa';
  end if;

  if exists (
    select 1
    from public.venue_verification_requests request
    where request.venue_id = new.venue_id
      and request.status = 'pending'
  ) then
    raise exception 'Ja existe uma verificacao em analise';
  end if;

  new.status := 'pending';
  new.reviewed_at := null;
  new.rejection_reason := null;
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function public.venue_verification_before_insert() from public;

drop trigger if exists venue_verification_prepare_request on public.venue_verification_requests;
create trigger venue_verification_prepare_request
before insert on public.venue_verification_requests
for each row
execute function public.venue_verification_before_insert();

create or replace function public.venue_verification_mark_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.venue_profiles
  set verification_status = 'pending'
  where id = new.venue_id
    and verification_status is distinct from 'verified';

  return new;
end;
$$;

revoke all on function public.venue_verification_mark_pending() from public;

drop trigger if exists venue_verification_profile_pending on public.venue_verification_requests;
create trigger venue_verification_profile_pending
after insert on public.venue_verification_requests
for each row
execute function public.venue_verification_mark_pending();

create or replace function public.venue_verification_sync_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'verified' then
      new.reviewed_at := coalesce(new.reviewed_at, now());
      new.rejection_reason := null;
    elsif new.status = 'rejected' then
      new.reviewed_at := coalesce(new.reviewed_at, now());
    end if;

    update public.venue_profiles
    set verification_status = new.status
    where id = new.venue_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.venue_verification_sync_status() from public;

drop trigger if exists venue_verification_sync_profile on public.venue_verification_requests;
create trigger venue_verification_sync_profile
before update on public.venue_verification_requests
for each row
execute function public.venue_verification_sync_status();

-- Storage privado: caminho padrao
-- venue/<auth.uid()>/<request-id>/<arquivo>

drop policy if exists "verification_documents_select_venue_own" on storage.objects;
create policy "verification_documents_select_venue_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = 'venue'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "verification_documents_insert_venue_own" on storage.objects;
create policy "verification_documents_insert_venue_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = 'venue'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Arquivos ainda nao vinculados a uma solicitacao podem ser removidos pelo dono.
-- Depois do envio, ficam imutaveis para preservar a prova da analise.
drop policy if exists "verification_documents_delete_unsubmitted_venue_own" on storage.objects;
create policy "verification_documents_delete_unsubmitted_venue_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = 'venue'
  and (storage.foldername(name))[2] = auth.uid()::text
  and not exists (
    select 1
    from public.venue_verification_requests request
    where request.user_id = auth.uid()
      and (
        request.business_document_path = name
        or request.responsible_document_front_path = name
        or request.responsible_document_back_path = name
        or request.selfie_path = name
      )
  )
);
