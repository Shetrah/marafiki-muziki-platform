# Marafiki Muziki Platform

React + Vite event publishing, booking, ticket verification, and admin attendance management backed by Supabase Auth, PostgreSQL, Realtime, and Storage.

## Configure Supabase

1. Create a Supabase project.
2. Enable email/password and anonymous sign-in in **Authentication → Providers**. Configure the Auth site URL and allowed redirect URL to include `/admin` for password recovery.
3. Apply the migrations:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

4. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or publishable key). These are the only Supabase credentials used by browser code.
5. Invite the first administrator in Supabase Auth, then promote the matching profile using the SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'admin@example.com';
```

6. Install and run the frontend:

```powershell
npm install
npm run dev
```

The schema, RLS policies, booking and check-in functions, Storage buckets, and artwork budget functions are in `supabase/migrations/`. Anonymous Auth must be enabled for public bookings. Booking inventory is allocated in one database transaction, so concurrent requests cannot oversell an event.

## Migrate Firebase data

The Firebase source is read-only during migration. Keep the source project available until the generated report confirms the destination counts and links. Do not migrate while bookings are being written; pause booking writes, migrate, verify, then switch the deployed frontend environment to Supabase.

Install the isolated migration tool:

```powershell
npm --prefix migration install
```

Set these environment values in the migration shell. Keep the service account JSON outside the repository and never put the Supabase service role key in a `VITE_` variable:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\secure\firebase-service-account.json'
$env:FIREBASE_STORAGE_BUCKET = '<firebase-project>.firebasestorage.app'
$env:SUPABASE_URL = 'https://<project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<server-side service role key>'
```

First run a read-only inventory:

```powershell
node migration/migrate.mjs
```

Review source totals and warnings. To import, run:

```powershell
node migration/migrate.mjs --apply
```

The importer transfers Firebase Auth accounts with email, admin roles, event documents, nested bookings and tickets, and Firebase Storage objects. It preserves legacy IDs for ticket links and records Firebase-to-Supabase identity mappings. Existing email accounts receive random temporary passwords and must use **Forgot or migrated your password?** on `/admin`; password hashes are not copied by this importer. Anonymous Firebase identities cannot be recreated as Supabase Auth identities, so their bookings retain the legacy owner ID and their old ticket identifiers remain lookup compatible. External poster URLs are imported to Supabase Storage when they are reachable HTTPS image links; failures are listed in the report.

The importer is idempotent by legacy IDs and defaults to dry run. It writes a mode-`600` `migration-report.json` after an apply run with source/destination row counts and verification flags. Investigate any mismatch before cutover. Firebase source data and files are never deleted by this script. Legacy Firebase rules are archived in `migration/legacy/` for reference only; the running application does not use them.

## Gemini image generation

Deploy the server-side Supabase Edge Function and set its secrets:

```powershell
npx supabase secrets set GEMINI_API_KEY=<server-only-key>
npx supabase secrets set GEMINI_IMAGE_MODEL=gemini-3-pro-image GEMINI_FALLBACK_IMAGE_MODEL=gemini-3.1-flash-image
npx supabase functions deploy generate-ticket-artwork
```

The `/admin/ai-artwork` page allows administrators to set monthly call and variation limits and choose premium or standard generation. The function checks the authenticated profile role, reserves usage transactionally, reads the event's uploaded poster from Supabase Storage, retries a failed primary generation with the configured fallback, and stores private PNG/PDF outputs with expiring signed links. Gemini credentials and the service role key remain server-side. Generation is disabled until an admin enables a budget.

## Database and access model

- `profiles`, `events`, `event_assets`, `bookings`, `tickets`, `payments`, `email_logs`, `artwork_budgets`, and `artwork_generations` are defined with UUID primary keys and relational constraints.
- RLS isolates profiles and bookings, exposes published events and limited public ticket fields, and restricts management operations to `profiles.role = 'admin'`.
- `create_booking` locks the event row, checks status/capacity, creates booking and ticket records, and updates reservations atomically.
- `check_in_ticket` verifies ticket and event ownership, prevents duplicate check-in, then updates both ticket and attendance state atomically.
- Event posters are public objects in `event-posters`; generated ticket files are private in `generated-tickets`; other imported assets are private in `event-assets`.

The app's routes remain `/`, `/events`, `/events/:eventId`, `/ticket/:eventId/:ticketId`, `/admin`, `/admin/dashboard`, `/admin/events`, and `/admin/ai-artwork`.
