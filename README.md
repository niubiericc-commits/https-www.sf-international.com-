# SF International Style Waybill Tracking Site

A tracking-number lookup site in the style of SF International's waybill
tracking page, plus an admin panel where you manually enter each shipment's
tracking number, shipment details, and status history. There is no
connection to SF Express's own systems — you are the source of truth for
every tracking number and update.

## What's included

- **Public tracking page** (`/`) — visitors enter a tracking number and see
  shipment details plus a status timeline, styled like SF International's
  tracking page.
- **Admin panel** (`/admin`) — password-protected. Create/edit/delete
  waybills, and add/remove tracking events (e.g. "Picked Up", "In Transit",
  "Out for Delivery", "Delivered"). The waybill's current status always
  reflects whichever event has the latest date/time, so you can add events
  in any order.

## Local development

```bash
npm install
cp .env.example .env   # then edit .env with your local Postgres URL and admin credentials
npm start
```

The app needs a Postgres database. On first run it automatically creates the
`waybills`, `tracking_events`, and session tables if they don't exist yet.

## Deploying

This app is a standard Node.js + Express app that needs:

1. A Postgres database (`DATABASE_URL` environment variable).
2. Environment variables: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `PORT`.
3. Build command: `npm install`
4. Start command: `npm start`

It will run on Render, Railway, Fly.io, or any similar Node.js hosting
platform, as well as your own server.

## Security notes

- Change `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `SESSION_SECRET` before
  going live — never deploy with the defaults in `.env.example`.
- The admin panel is a single shared login. If more than one person needs
  access, treat the credentials like a shared password and rotate them if
  someone leaves.
- Consider putting the site behind HTTPS (Render and most hosts do this
  automatically) so login credentials aren't sent in plain text.
