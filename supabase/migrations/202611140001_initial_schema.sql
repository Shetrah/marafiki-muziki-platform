create extension if not exists pgcrypto with schema extensions;

create type public.account_role as enum ('customer', 'admin');
create type public.event_status as enum ('draft', 'published', 'completed', 'cancelled');
create type public.booking_status as enum ('confirmed', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text not null default '',
  role public.account_role not null default 'customer',
  legacy_firebase_uid text unique,
  password_reset_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  slug text not null unique,
  title text not null,
  description text not null default '',
  organizer text not null default 'Marafiki Muziki',
  event_date date not null,
  start_time time not null,
  end_time time not null,
  venue text not null,
  venue_note text not null default '',
  music_by text not null default '',
  poster_path text,
  capacity integer not null check (capacity >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= capacity),
  checked_in integer not null default 0 check (checked_in >= 0 and checked_in <= reserved),
  max_tickets_per_booking integer not null default 4 check (max_tickets_per_booking between 1 and 100),
  booking_open boolean not null default true,
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  storage_path text not null unique,
  asset_type text not null check (asset_type in ('poster', 'artwork', 'other')),
  content_type text not null,
  byte_size bigint not null default 0 check (byte_size >= 0),
  legacy_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  legacy_owner_uid text,
  booking_code text not null,
  full_name text not null,
  email text not null,
  phone text not null,
  country text not null default '',
  city text not null default '',
  quantity integer not null check (quantity > 0),
  status public.booking_status not null default 'confirmed',
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  ticket_delivery_status text not null default 'not_sent' check (ticket_delivery_status in ('not_sent', 'pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, user_id),
  unique(event_id, booking_code)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  event_id uuid not null references public.events(id) on delete restrict,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  ticket_code text not null,
  guest_name text not null,
  quantity integer not null check (quantity > 0),
  status public.booking_status not null default 'confirmed',
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  png_path text,
  pdf_path text,
  created_at timestamptz not null default now(),
  unique(event_id, ticket_code)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'KES',
  status public.payment_status not null default 'pending',
  provider text,
  provider_reference text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  recipient text not null,
  template text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_id text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.artwork_budgets (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  max_calls_per_month integer not null default 20 check (max_calls_per_month between 0 and 5000),
  max_variations_per_request integer not null default 3 check (max_variations_per_request between 1 and 3),
  used_calls integer not null default 0 check (used_calls >= 0),
  usage_month date not null default date_trunc('month', now())::date,
  updated_at timestamptz not null default now()
);
insert into public.artwork_budgets(id) values (true) on conflict do nothing;

create table public.artwork_generations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_model text not null,
  model_calls integer not null default 0,
  variations integer not null check (variations between 1 and 3),
  status text not null check (status in ('processing', 'complete', 'failed')),
  results jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.legacy_identity_map (
  firebase_uid text primary key,
  supabase_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  imported_at timestamptz not null default now()
);

create index events_public_schedule_idx on public.events(status, event_date);
create index bookings_event_created_idx on public.bookings(event_id, created_at desc);
create index bookings_user_idx on public.bookings(user_id);
create index bookings_code_idx on public.bookings(event_id, booking_code);
create index tickets_event_idx on public.tickets(event_id);
create index tickets_legacy_lookup_idx on public.tickets(event_id, legacy_id);
create index email_logs_booking_idx on public.email_logs(booking_id, created_at desc);
create index artwork_generations_event_idx on public.artwork_generations(event_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger events_touch_updated before update on public.events for each row execute function public.touch_updated_at();
create trigger profiles_touch_updated before update on public.profiles for each row execute function public.touch_updated_at();
create trigger bookings_touch_updated before update on public.bookings for each row execute function public.touch_updated_at();
create trigger payments_touch_updated before update on public.payments for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'::public.account_role)
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.create_booking(p_event_id uuid, p_full_name text, p_email text, p_phone text, p_quantity integer)
returns table(ticket_id uuid, booking_code text)
language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_booking_id uuid; v_ticket_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'Sign in before booking.'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is false then
    if public.is_admin() then raise exception 'Sign out of the admin account before booking.'; end if;
  end if;
  if length(trim(p_full_name)) < 2 or length(trim(p_email)) < 5 or length(trim(p_phone)) < 7 then raise exception 'Enter valid contact details.'; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status <> 'published' then raise exception 'This event is not available for booking.'; end if;
  if not v_event.booking_open then raise exception 'Bookings are currently closed.'; end if;
  if p_quantity < 1 or p_quantity > v_event.max_tickets_per_booking then raise exception 'Ticket quantity is outside the allowed range.'; end if;
  if v_event.capacity - v_event.reserved < p_quantity then raise exception 'Not enough tickets remain.'; end if;
  if exists(select 1 from public.bookings b where b.event_id = p_event_id and b.user_id = auth.uid()) then raise exception 'A booking already exists for this account and event.'; end if;
  v_code := upper(substr(regexp_replace(v_event.slug, '[^a-zA-Z0-9]', '', 'g'), 1, 3)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.bookings(event_id, user_id, booking_code, full_name, email, phone, quantity)
  values(p_event_id, auth.uid(), v_code, trim(p_full_name), lower(trim(p_email)), trim(p_phone), p_quantity)
  returning id into v_booking_id;
  insert into public.tickets(event_id, booking_id, ticket_code, guest_name, quantity)
  values(p_event_id, v_booking_id, v_code, trim(p_full_name), p_quantity)
  returning id into v_ticket_id;
  update public.events set reserved = reserved + p_quantity where id = p_event_id;
  return query select v_ticket_id, v_code;
end;
$$;
revoke all on function public.create_booking(uuid,text,text,text,integer) from public;
grant execute on function public.create_booking(uuid,text,text,text,integer) to authenticated;

create or replace function public.check_in_ticket(p_event_id uuid, p_ticket_id uuid)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select b.* into v_booking from public.bookings b join public.tickets t on t.booking_id = b.id
    where b.event_id = p_event_id and t.id = p_ticket_id for update of b;
  if not found or v_booking.status <> 'confirmed' then raise exception 'Ticket is invalid.'; end if;
  if v_booking.checked_in then raise exception 'Ticket has already been checked in.'; end if;
  update public.bookings set checked_in = true, checked_in_at = now(), checked_in_by = auth.uid() where id = v_booking.id returning * into v_booking;
  update public.tickets set checked_in = true, checked_in_at = now() where booking_id = v_booking.id;
  update public.events set checked_in = least(reserved, checked_in + v_booking.quantity) where id = p_event_id;
  return v_booking;
end;
$$;
revoke all on function public.check_in_ticket(uuid,uuid) from public;
grant execute on function public.check_in_ticket(uuid,uuid) to authenticated;

create view public.public_tickets with (security_barrier = true) as
  select t.id, t.legacy_id, t.event_id, t.ticket_code, t.guest_name, t.quantity, t.status, t.checked_in, t.checked_in_at, t.created_at
  from public.tickets t join public.events e on e.id = t.event_id
  where e.status in ('published', 'completed');

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_assets enable row level security;
alter table public.bookings enable row level security;
alter table public.tickets enable row level security;
alter table public.payments enable row level security;
alter table public.email_logs enable row level security;
alter table public.artwork_budgets enable row level security;
alter table public.artwork_generations enable row level security;
alter table public.legacy_identity_map enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated using ((select auth.uid()) = id or (select public.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy events_public_read on public.events for select to anon, authenticated using (status in ('published', 'completed') or (select public.is_admin()));
create policy events_admin_insert on public.events for insert to authenticated with check ((select public.is_admin()));
create policy events_admin_update on public.events for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy events_admin_delete on public.events for delete to authenticated using ((select public.is_admin()));
create policy assets_public_read on public.event_assets for select to anon, authenticated using (asset_type = 'poster' or (select public.is_admin()));
create policy assets_admin_write on public.event_assets for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bookings_owner_or_admin_read on public.bookings for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy bookings_admin_update on public.bookings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy tickets_admin_read on public.tickets for select to authenticated using ((select public.is_admin()));
create policy tickets_owner_read on public.tickets for select to authenticated using (exists(select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid())));
create policy payments_admin_read on public.payments for select to authenticated using ((select public.is_admin()));
create policy email_logs_admin_read on public.email_logs for select to authenticated using ((select public.is_admin()));
create policy artwork_budget_admin_read on public.artwork_budgets for select to authenticated using ((select public.is_admin()));
create policy artwork_budget_admin_update on public.artwork_budgets for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy artwork_generations_admin_read on public.artwork_generations for select to authenticated using ((select public.is_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.events, public.event_assets, public.public_tickets to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.bookings to authenticated;
grant select on public.tickets, public.payments, public.email_logs, public.artwork_generations, public.artwork_budgets to authenticated;
grant insert, update, delete on public.events to authenticated;
grant all on public.event_assets to authenticated;
grant update on public.bookings to authenticated;
grant update on public.artwork_budgets to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-posters', 'event-posters', true, 10485760, array['image/jpeg','image/png','image/webp']),
       ('event-assets', 'event-assets', false, 104857600, null),
       ('generated-tickets', 'generated-tickets', false, 20971520, array['image/png','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy public_read_event_posters on storage.objects for select to anon, authenticated using (bucket_id = 'event-posters');
create policy admin_upload_event_posters on storage.objects for insert to authenticated with check (bucket_id = 'event-posters' and (select public.is_admin()));
create policy admin_update_event_posters on storage.objects for update to authenticated using (bucket_id = 'event-posters' and (select public.is_admin())) with check (bucket_id = 'event-posters' and (select public.is_admin()));
create policy admin_delete_event_posters on storage.objects for delete to authenticated using (bucket_id = 'event-posters' and (select public.is_admin()));
create policy admin_manage_event_assets on storage.objects for all to authenticated using (bucket_id = 'event-assets' and (select public.is_admin())) with check (bucket_id = 'event-assets' and (select public.is_admin()));
create policy admin_read_event_assets on storage.objects for select to authenticated using (bucket_id = 'event-assets' and (select public.is_admin()));
create policy admin_insert_event_assets on storage.objects for insert to authenticated with check (bucket_id = 'event-assets' and (select public.is_admin()));
create policy admin_update_event_assets on storage.objects for update to authenticated using (bucket_id = 'event-assets' and (select public.is_admin())) with check (bucket_id = 'event-assets' and (select public.is_admin()));
create policy admin_delete_event_assets on storage.objects for delete to authenticated using (bucket_id = 'event-assets' and (select public.is_admin()));
create policy ticket_owner_or_admin_read on storage.objects for select to authenticated using (
  bucket_id = 'generated-tickets' and (
    (select public.is_admin()) or exists(
      select 1 from public.tickets t join public.bookings b on b.id = t.booking_id
      where b.user_id = (select auth.uid()) and (storage.objects.name = t.pdf_path or storage.objects.name = t.png_path)
    )
  )
);
create policy admin_upload_generated_tickets on storage.objects for insert to authenticated with check (bucket_id = 'generated-tickets' and (select public.is_admin()));

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.artwork_budgets;
