-- Production hardening for payment and review writes.

revoke insert, update, delete, truncate, references, trigger
on public.payments
from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
on public.payment_releases
from anon, authenticated;

drop policy if exists payments_select_parties
on public.payments;

create policy payments_select_authorized
on public.payments
for select
to authenticated
using (
  public.is_admin()
  or (
    payments.payer_user_id is not null
    and payments.payer_user_id = auth.uid()
  )
  or (
    payments.payer_user_id is null
    and exists (
      select 1
      from public.bookings b
      where b.id = payments.booking_id
        and (
          public.owns_artist(b.artist_id)
          or public.is_venue_member(b.venue_id)
        )
    )
  )
);

drop policy if exists releases_participants_read
on public.payment_releases;

create policy releases_legacy_participants_read
on public.payment_releases
for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    join public.bookings b on b.id=p.booking_id
    where p.id=payment_releases.payment_id
      and p.charge_type='legacy_booking_total'
      and (
        public.owns_artist(b.artist_id)
        or public.is_venue_member(b.venue_id)
        or public.is_admin()
      )
  )
);

-- Reviews are created only through submit_review(), which validates both parties.
drop policy if exists reviews_insert_booking_party
on public.reviews;

revoke insert, update, delete, truncate, references, trigger
on public.reviews
from anon, authenticated;

notify pgrst,'reload schema';
