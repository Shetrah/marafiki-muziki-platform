# Marafiki Muziki Platform

A full React + Vite + Firebase website for the Marafiki Muziki band, with reusable event publishing, ticket booking, QR verification, downloadable themed PDF tickets, and an admin attendance dashboard.

## Public website

- lively Marafiki Muziki landing page
- About / Our Sound / Contact sections
- public Events page
- individual themed event pages
- slot availability and sold-out handling
- free online reservations
- private booking information
- public themed ticket page reached by QR code
- one-click PDF ticket download
- Marafiki Muziki logo used as brand logo and favicon

## Admin area

The public navigation does **not** contain an Admin link.

Open admin directly at:

```text
/admin
```

Admin features:

- dashboard with total capacity, bookings, check-ins and attendance rate
- simple attendance bars for every event
- create / edit / publish events
- upload event posters to Firebase Storage
- set total slots and max tickets per booking
- open / close online booking
- guest list per event
- event-specific QR scanner under Admin only
- manual ticket lookup fallback

## Firestore structure

```text
admins
  {adminUid}

events
  {eventId}
    title
    slug
    description
    organizer
    eventDate
    startTime
    endTime
    venue
    venueNote
    musicBy
    posterUrl
    capacity
    reserved
    checkedIn
    maxTicketsPerBooking
    bookingOpen
    status
    createdAt
    updatedAt

    bookings
      {anonymousUserUid}
        fullName
        phone
        email
        quantity
        bookingCode
        checkedIn
        ...

    tickets
      {anonymousUserUid}
        guestName
        quantity
        ticketCode
        checkedIn
        ...
```

The `bookings` subcollection is private. The `tickets` subcollection contains only the limited information required for the public QR ticket page.

## 1. Environment variables

Create `.env` in the project root:

```env
VITE_FIREBASE_API_KEY=AIzaSyCYo9LBQzeokRYwdsFuAGhSrRC8Uz-QsNo
VITE_FIREBASE_AUTH_DOMAIN=living-room-experience.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=living-room-experience
VITE_FIREBASE_STORAGE_BUCKET=living-room-experience.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=547184049291
VITE_FIREBASE_APP_ID=1:547184049291:web:a80bf1279b6494ed07a88e
VITE_FIREBASE_MEASUREMENT_ID=G-WVQ5WB3BWW
```

## 2. Firebase Authentication

Firebase Console → Authentication → Sign-in method:

Enable:

- **Email/Password** — admin login
- **Anonymous** — public ticket booking

Create the admin user under Authentication → Users.

## 3. Create the admin document

Copy the UID of the Email/Password admin account.

In Firestore create:

```text
admins/{ADMIN_UID}
```

Example fields:

```text
name: "Marafiki Muziki Admin"
email: "admin@example.com"
role: "admin"
active: true
```

The document ID must exactly equal the Firebase Authentication UID.

## 4. Publish Firestore rules

Copy `firestore.rules` to:

Firebase Console → Firestore Database → Rules → Publish

Or use Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

## 5. Publish Storage rules

Copy `storage.rules` to Firebase Storage Rules and publish, or run:

```bash
firebase deploy --only storage
```

Firebase Storage must be enabled before event poster uploads can work.

## 6. Install and run

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run build
```

## 7. Create the first event

Go directly to:

```text
/admin
```

Sign in, then:

```text
Events → Create Event
```

For The Living Room Vibe, use for example:

```text
Title: The Living Room Vibe
Date: 2026-09-25
Start: 18:00
End: 20:00
Venue: Oasis Apartment
Venue Note: Near Kwa Ndege Level 4 Hospital
Music By: randy_muziki
Status: Published
Booking Open: Yes
```

Upload the event poster and choose the capacity from the admin form.

## QR behavior

The QR contains the public ticket URL:

```text
/ticket/{eventId}/{ticketId}
```

Opening it shows a branded event-theme ticket page. The admin scanner, however, is only available under:

```text
/admin/events/{eventId}/scanner
```

The scanner checks the event, confirms the ticket and updates attendance in Firestore.

Recent Chrome / Edge browsers can use the built-in QR `BarcodeDetector` API. If a browser does not support live QR detection, the scanner includes a manual ticket-ID lookup fallback.

## PDF tickets

No extra PDF package is required. The project generates a one-page PDF directly in the browser from a rendered ticket design containing:

- event poster
- Marafiki Muziki logo
- guest name
- ticket number
- date / time / venue
- admit quantity
- QR code
- booking status

This avoids the missing `jspdf` / `html5-qrcode` import errors from the earlier version.

## Vercel deployment

This project includes `vercel.json` with an SPA rewrite to `index.html`. That means direct links and browser refreshes work correctly on routes such as:

```text
/events/{eventId}
/ticket/{eventId}/{ticketId}
/admin/dashboard
/admin/events/{eventId}
/admin/events/{eventId}/scanner
```

Before deploying, add the Firebase variables in:

```text
Vercel → Project → Settings → Environment Variables
```

Add every `VITE_FIREBASE_*` variable from `.env.example` for Production, Preview and Development as needed.

After adding or changing environment variables, redeploy the project.

## Page transitions

Public and admin route changes use lightweight CSS transitions with no extra animation dependency. The effect automatically respects `prefers-reduced-motion` accessibility settings.
