-- Aura Beat: validacoes gratuitas de CNPJ e bloqueio de duplicidade.
-- Aplicar manualmente somente depois das migrations 005-007.
-- Esta migration NAO consulta Receita Federal nem qualquer provedor externo.
-- CNPJ numerico: valida os digitos verificadores localmente.
-- CNPJ alfanumerico com 14 caracteres: nao e bloqueado por checksum numerico e
-- continua exigindo revisao documental/administrativa.

create or replace function public.normalize_cnpj(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(value, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

revoke all on function public.normalize_cnpj(text) from public;
grant execute on function public.normalize_cnpj(text) to authenticated;

create or replace function public.is_valid_numeric_cnpj(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := public.normalize_cnpj(value);
  total integer := 0;
  remainder integer;
  first_digit integer;
  second_digit integer;
  i integer;
  weights_first integer[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  weights_second integer[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if digits !~ '^[0-9]{14}$' then
    return false;
  end if;

  if digits = repeat(substr(digits, 1, 1), 14) then
    return false;
  end if;

  total := 0;
  for i in 1..12 loop
    total := total + substr(digits, i, 1)::integer * weights_first[i];
  end loop;

  remainder := total % 11;
  first_digit := case when remainder < 2 then 0 else 11 - remainder end;

  total := 0;
  for i in 1..12 loop
    total := total + substr(digits, i, 1)::integer * weights_second[i];
  end loop;
  total := total + first_digit * weights_second[13];

  remainder := total % 11;
  second_digit := case when remainder < 2 then 0 else 11 - remainder end;

  return substr(digits, 13, 1)::integer = first_digit
     and substr(digits, 14, 1)::integer = second_digit;
end;
$$;

revoke all on function public.is_valid_numeric_cnpj(text) from public;
grant execute on function public.is_valid_numeric_cnpj(text) to authenticated;

create or replace function public.venue_profile_validate_cnpj()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  clean_cnpj text := public.normalize_cnpj(new.cnpj);
  old_clean_cnpj text;
begin
  if tg_op = 'UPDATE' then
    old_clean_cnpj := public.normalize_cnpj(old.cnpj);

    -- Preserva cadastros de teste/legados ja existentes ate que o CNPJ seja
    -- realmente alterado. Outras edicoes do perfil continuam funcionando.
    if clean_cnpj = old_clean_cnpj then
      new.cnpj := clean_cnpj;
      return new;
    end if;
  end if;

  if length(clean_cnpj) <> 14 or clean_cnpj !~ '^[0-9A-Z]{14}$' then
    raise exception 'CNPJ precisa ter 14 caracteres validos';
  end if;

  if clean_cnpj ~ '^[0-9]{14}$'
     and not public.is_valid_numeric_cnpj(clean_cnpj) then
    raise exception 'CNPJ numerico invalido pelos digitos verificadores';
  end if;

  new.cnpj := clean_cnpj;
  return new;
end;
$$;

revoke all on function public.venue_profile_validate_cnpj() from public;

drop trigger if exists venue_profiles_validate_cnpj on public.venue_profiles;
create trigger venue_profiles_validate_cnpj
before insert or update of cnpj on public.venue_profiles
for each row
execute function public.venue_profile_validate_cnpj();

-- Bloqueia o mesmo CNPJ mesmo se um registro estiver pontuado e outro sem mascara.
-- Antes de aplicar, confirme que nao existem duplicidades normalizadas no remoto.
create unique index if not exists venue_profiles_cnpj_normalized_unique_idx
  on public.venue_profiles (public.normalize_cnpj(cnpj))
  where length(public.normalize_cnpj(cnpj)) = 14;

-- Reforca a solicitacao de verificacao da Casa usando a mesma normalizacao.
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

  select public.normalize_cnpj(venue.cnpj)
    into current_cnpj
  from public.venue_profiles venue
  where venue.id = new.venue_id
    and venue.owner_user_id = new.user_id;

  if current_cnpj is null then
    raise exception 'Perfil de Casa nao pertence ao usuario';
  end if;

  new.cnpj_snapshot := public.normalize_cnpj(new.cnpj_snapshot);

  if length(new.cnpj_snapshot) <> 14
     or new.cnpj_snapshot !~ '^[0-9A-Z]{14}$' then
    raise exception 'CNPJ invalido para verificacao';
  end if;

  if new.cnpj_snapshot ~ '^[0-9]{14}$'
     and not public.is_valid_numeric_cnpj(new.cnpj_snapshot) then
    raise exception 'CNPJ numerico invalido pelos digitos verificadores';
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

comment on function public.is_valid_numeric_cnpj(text) is
  'Valida localmente digitos verificadores de CNPJ numerico. Nao consulta Receita Federal.';

comment on function public.normalize_cnpj(text) is
  'Normaliza CNPJ removendo pontuacao e mantendo letras/numeros em maiusculo.';
