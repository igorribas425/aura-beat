-- Aura Beat production foundation. Review in a staging project before applying.
create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('offer','invitation','offer_accepted','offer_declined','counterproposal','booking','message','event_changed','payment','in_transit','arrived','completed','review_request')),
  title text not null check (char_length(title) between 1 and 120), body text, link_url text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (user_id=auth.uid());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
-- Clients cannot insert arbitrary notifications; trusted database functions/service backend do so.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid references public.artist_profiles(id) on delete cascade,
  venue_id uuid references public.venue_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorite_exactly_one_target check ((artist_id is not null)::int+(venue_id is not null)::int=1)
);
create unique index if not exists favorites_artist_unique on public.favorites(user_id,artist_id) where artist_id is not null;
create unique index if not exists favorites_venue_unique on public.favorites(user_id,venue_id) where venue_id is not null;
alter table public.favorites enable row level security;
create policy "favorites_own" on public.favorites for all using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.venue_members (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venue_profiles(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','manager','finance','producer')), created_at timestamptz not null default now(),
 unique(venue_id,user_id)
);
alter table public.venue_members enable row level security;
create or replace function public.is_venue_member(target uuid, allowed text[] default array['owner','manager','finance','producer']) returns boolean
language sql stable security definer set search_path='' as $$ select exists(select 1 from public.venue_profiles v where v.id=target and v.owner_user_id=auth.uid()) or exists(select 1 from public.venue_members m where m.venue_id=target and m.user_id=auth.uid() and m.role=any(allowed)); $$;
revoke all on function public.is_venue_member(uuid,text[]) from public; grant execute on function public.is_venue_member(uuid,text[]) to authenticated;
create policy "venue_members_visible_to_team" on public.venue_members for select using(public.is_venue_member(venue_id));
create policy "venue_members_owner_manage" on public.venue_members for all using(public.is_venue_member(venue_id,array['owner'])) with check(public.is_venue_member(venue_id,array['owner']));

create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete restrict,
 payer_user_id uuid not null references auth.users(id), provider text not null, provider_payment_id text,
 method text not null check(method in ('pix','card')), status text not null default 'pending' check(status in ('pending','processing','paid','failed','refunded','cancelled')),
 amount numeric(12,2) not null check(amount>0), installments smallint not null default 1 check(installments between 1 and 24),
 installment_cost numeric(12,2) not null default 0 check(installment_cost>=0), raw_status text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(provider,provider_payment_id)
);
create table if not exists public.payment_releases (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id) on delete restrict,
 kind text not null check(kind in ('travel','performance')), amount numeric(12,2) not null check(amount>=0),
 status text not null default 'pending' check(status in ('pending','eligible','released','held','cancelled')),
 eligible_at timestamptz, released_at timestamptz, created_at timestamptz not null default now(), unique(payment_id,kind)
);
alter table public.payments enable row level security; alter table public.payment_releases enable row level security;
create policy "payments_participants_read" on public.payments for select using(payer_user_id=auth.uid() or exists(select 1 from public.bookings b join public.artist_profiles a on a.id=b.artist_id where b.id=booking_id and a.user_id=auth.uid()));
create policy "releases_participants_read" on public.payment_releases for select using(exists(select 1 from public.payments p join public.bookings b on b.id=p.booking_id join public.artist_profiles a on a.id=b.artist_id where p.id=payment_id and (p.payer_user_id=auth.uid() or a.user_id=auth.uid())));

-- Price is authoritative and commission never applies to travel, tolls or lodging.
create or replace function public.booking_price(hourly numeric,duration_minutes integer,distance_km numeric default 0,free_radius_km numeric default 0,price_per_km numeric default 0,round_trip boolean default true,tolls numeric default 0,lodging numeric default 0)
returns table(performance_fee numeric,venue_fee numeric,artist_fee numeric,travel numeric,venue_total numeric,artist_net numeric)
language sql immutable set search_path='' as $$
 with x as(select round(greatest(hourly,0)*greatest(duration_minutes,0)/60,2) performance, greatest(greatest(distance_km,0)-greatest(free_radius_km,0),0)*(case when round_trip then 2 else 1 end)*greatest(price_per_km,0) trip)
 select performance,round(performance*.03,2),round(performance*.03,2),round(trip,2),round(performance*1.03+trip+greatest(tolls,0)+greatest(lodging,0),2),round(performance*.97+trip+greatest(tolls,0)+greatest(lodging,0),2) from x; $$;

create or replace function public.prevent_contact_leak() returns trigger language plpgsql security definer set search_path='' as $$
declare unlocked boolean; content text:=coalesce(new.body,'');
begin
 select coalesce(b.contact_unlocked,false) into unlocked from public.conversations c left join public.bookings b on b.id=c.booking_id where c.id=new.conversation_id;
 if not coalesce(unlocked,false) and content ~* '([[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|(\+?55[ .-]*)?(\(?[0-9]{2}\)?[ .-]*)?9?[0-9]{4}[ .-]*[0-9]{4}|whats(app)?|instagram\.com|@[[:alnum:]_]{3,})' then raise exception 'Contato externo bloqueado até a confirmação da contratação'; end if;
 return new;
end $$;
drop trigger if exists messages_prevent_contact_leak on public.messages;
create trigger messages_prevent_contact_leak before insert or update of body on public.messages for each row execute function public.prevent_contact_leak();

create or replace function public.prevent_booking_conflict() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status not in ('cancelled','completed','disputed') and exists(select 1 from public.bookings b where b.artist_id=new.artist_id and b.id<>new.id and b.status not in ('cancelled','completed','disputed') and tstzrange(b.starts_at,b.starts_at+make_interval(mins=>b.duration_minutes),'[)') && tstzrange(new.starts_at,new.starts_at+make_interval(mins=>new.duration_minutes),'[)')) then raise exception 'Artista indisponível neste horário'; end if;
 if exists(select 1 from public.artist_calendar s where s.artist_id=new.artist_id and s.kind in ('blocked','manual') and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(new.starts_at,new.starts_at+make_interval(mins=>new.duration_minutes),'[)')) then raise exception 'Horário conflita com a agenda do artista'; end if;
 return new;
end $$;
drop trigger if exists bookings_prevent_conflict on public.bookings;
create trigger bookings_prevent_conflict before insert or update of artist_id,starts_at,duration_minutes,status on public.bookings for each row execute function public.prevent_booking_conflict();

-- Storage buckets are private; signed URLs must be issued only after participant authorization.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('chat-attachments','chat-attachments',false,10485760,array['image/jpeg','image/png','image/webp','audio/mpeg','audio/webm','application/pdf']),
 ('verification-documents','verification-documents',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
