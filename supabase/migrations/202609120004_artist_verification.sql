-- Aura Beat: verificacao privada de identidade do Artista.
-- IMPORTANTE: revisar contra o schema remoto antes de aplicar em producao.
-- Documentos ficam em bucket privado. O cliente autenticado pode enviar e ler
-- somente os proprios arquivos. Nenhuma policy permite ao cliente se autoaprovar.

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

create table if not exists public.artist_verification_requests (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artist_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('rg','cnh','passport','other')),
  document_front_path text not null,
  document_back_path text,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_verification_requests_artist_idx
  on public.artist_verification_requests(artist_id, submitted_at desc);

create index if not exists artist_verification_requests_user_idx
  on public.artist_verification_requests(user_id, submitted_at desc);

create unique index if not exists artist_verification_one_pending_idx
  on public.artist_verification_requests(artist_id)
  where status = 'pending';

alter table public.artist_verification_requests enable row level security;

drop policy if exists "artist_verification_select_own" on public.artist_verification_requests;
create policy "artist_verification_select_own"
on public.artist_verification_requests
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_id
      and artist.user_id = auth.uid()
  )
);

drop policy if exists "artist_verification_insert_own_pending" on public.artist_verification_requests;
create policy "artist_verification_insert_own_pending"
on public.artist_verification_requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and reviewed_at is null
  and rejection_reason is null
  and document_front_path like ('artist/' || auth.uid()::text || '/%')
  and selfie_path like ('artist/' || auth.uid()::text || '/%')
  and (
    document_back_path is null
    or document_back_path like ('artist/' || auth.uid()::text || '/%')
  )
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_id
      and artist.user_id = auth.uid()
  )
);

-- Nao existe policy UPDATE para authenticated. A aprovacao/reprovacao deve ser
-- feita apenas por backend confiavel ou operacao administrativa autorizada.

create or replace function public.artist_verification_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'Usuario invalido para verificacao';
  end if;

  if not exists (
    select 1
    from public.artist_profiles artist
    where artist.id = new.artist_id
      and artist.user_id = new.user_id
  ) then
    raise exception 'Perfil de Artista nao pertence ao usuario';
  end if;

  if exists (
    select 1
    from public.artist_verification_requests request
    where request.artist_id = new.artist_id
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

revoke all on function public.artist_verification_before_insert() from public;

drop trigger if exists artist_verification_prepare_request on public.artist_verification_requests;
create trigger artist_verification_prepare_request
before insert on public.artist_verification_requests
for each row
execute function public.artist_verification_before_insert();

create or replace function public.artist_verification_mark_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.artist_profiles
  set verification_status = 'pending'
  where id = new.artist_id
    and verification_status is distinct from 'verified';

  return new;
end;
$$;

revoke all on function public.artist_verification_mark_pending() from public;

drop trigger if exists artist_verification_profile_pending on public.artist_verification_requests;
create trigger artist_verification_profile_pending
after insert on public.artist_verification_requests
for each row
execute function public.artist_verification_mark_pending();

create or replace function public.artist_verification_sync_status()
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

    update public.artist_profiles
    set verification_status = new.status
    where id = new.artist_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.artist_verification_sync_status() from public;

drop trigger if exists artist_verification_sync_profile on public.artist_verification_requests;
create trigger artist_verification_sync_profile
before update on public.artist_verification_requests
for each row
execute function public.artist_verification_sync_status();

-- Storage privado: caminho padrao
-- artist/<auth.uid()>/<request-id>/<arquivo>

drop policy if exists "verification_documents_select_own" on storage.objects;
create policy "verification_documents_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = 'artist'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "verification_documents_insert_own" on storage.objects;
create policy "verification_documents_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = 'artist'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Arquivo ainda nao referenciado por uma solicitacao pode ser removido pelo dono.
-- Depois do envio da solicitacao, o documento fica imutavel para preservar a prova.
drop policy if exists "verification_documents_delete_unsubmitted_own" on storage.objects;
create policy "verification_documents_delete_unsubmitted_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = 'artist'
  and (storage.foldername(name))[2] = auth.uid()::text
  and not exists (
    select 1
    from public.artist_verification_requests request
    where request.user_id = auth.uid()
      and (
        request.document_front_path = name
        or request.document_back_path = name
        or request.selfie_path = name
      )
  )
);
