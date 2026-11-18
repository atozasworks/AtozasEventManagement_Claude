# EventSphere — All-in-one Event Management Platform (MERN)

India-first, global-ready event platform covering conferences, webinars, festivals, concerts,
workshops and meetups — in-person, virtual and **hybrid** — in one modular system.

| Area | What's built |
|---|---|
| Marketplace & discovery | Public event listing with search, city, category, format, free/paid filters, featured & popular sorting |
| Self-service ticketing | Multiple ticket tiers, per-order limits, sold-out handling, oversell-proof inventory reservation |
| Promo codes & discounts | Per-event promo codes (percent or fixed amount, usage limit, expiry, limited to chosen ticket types), 100% codes for free passes, early-bird sale windows per ticket type, group discount, sales report per code |
| Promo invitation links | Every promo code has a shareable link (`/e/<event>?promo=CODE`) with a ready-made, editable message and buttons for WhatsApp, Facebook, X, LinkedIn, Telegram and email. A visitor who opens it sees the offer, and after logging in or signing up the code is applied to the booking automatically. Each network's link is tracked in Marketing attribution |
| Payments (India) | Razorpay Standard Checkout (UPI / cards / net banking / wallets / EMI) with server-side verification and webhook safety net; simulated mode for demos; platform fee model |
| Refunds & cancellations | Organizer refunds whole orders or single tickets (seat goes back on sale, ticket stops working), buyers request refunds from My Tickets (organizer approves or declines), free registrations cancel instantly, cancelling an event refunds every order and emails everyone, refund policy shown before payment |
| Custom registration | Per-event custom questions (text, select, checkbox, required) |
| Marketing attribution | UTM capture (first touch), attribution by source, conversion rate, CSV export for CRM import |
| CRM sync | Per-event webhook push of every registration (Zapier/Make/HubSpot/Salesforce flows) |
| Email & PDF tickets | Confirmation email with a printable PDF ticket (QR inside), "Download PDF" in My Tickets, reminders 24 hours and 1 hour before the event (saved to `server/.outbox` until SMTP is configured) |
| Accounts | Forgot/reset password by emailed link, email verification with a "confirm your email" banner (required to publish once SMTP is configured) |
| WhatsApp | Ticket confirmations and reminders via WhatsApp API (logs to console until configured) |
| Hybrid / virtual venue | Live stage (YouTube/Vimeo embed), real-time chat, Q&A, emoji reactions, live viewer count (Socket.IO) |
| Virtual expo | Sponsor booths by tier, on-site stall mapping, visit tracking, lead capture & export |
| Networking | Attendee directory, connection requests, contact sharing on acceptance |
| On-ground ops | QR tickets, gate scanner with **phone camera scanning** (also USB/Bluetooth scanners or typing), **offline mode** with manifest download + later sync, duplicate-entry protection, undo for a wrong scan |
| Named tickets & transfer | Optional name/email per ticket at checkout (guests are emailed their own ticket and can add it to their account), ticket transfer to another person with a fresh QR code, cancel before acceptance, organizer on/off switch |
| **Signed tickets (offline-proof gate)** | Every ticket QR is digitally signed with a per-event key. A gate phone can confirm a ticket is genuine with **no internet and no downloaded list** - including tickets sold after the list was downloaded - and forged or edited QR codes are refused. Gate devices hold only the public key, so they cannot create tickets |
| **Vendor & facility marketplace** | Search, compare and book marriage halls, event planners, caterers, decorators and photographers. Filters for city, guest count, budget and "free on date"; side-by-side comparison of up to 3; live availability calendar per listing; book a date (vendor confirms, or instant booking), request a custom quote, schedule a site visit / food tasting / meeting; direct WhatsApp, phone and email contact; any user can list a business, manage its calendar and answer requests |
| Organizer notifications | Bell button in the top menu with an unread badge: every new booking for your events, quote requests for venues you listed, and refund requests from buyers. Click one to jump to the right page |
| Admin console | Platform overview (people, live events, organizer earnings, platform fees, refunds per currency), feature or take down events, change roles and plans, suspend accounts, find any order, remove venue listings, activity log of every admin action |
| Gate staff | Organizer adds volunteers by email; they get a scan-only gate screen at `/gate/:eventId` with a live entry count and cannot see revenue, attendees or settings |
| Venue sourcing | Venue marketplace with capacity/price/type filters and quote requests |
| Budget tracking | Estimated vs actual by category, over-budget highlighting, revenue vs spend |
| Organizer analytics | Revenue, tickets, check-in rate, sales per day, payment-method mix, booth engagement |
| Modular events | Toggle Ticketing / Agenda / Streaming / Expo / Networking / Check-in / Budget / CRM per event, with presets per event type |

---

## 1. Prerequisites (Windows 11)

1. **Node.js 20 LTS or newer** — https://nodejs.org (tick "Add to PATH"). Check in a terminal:
   ```powershell
   node -v
   npm -v
   ```
2. **MongoDB Community Server** — https://www.mongodb.com/try/download/community
   - Choose the Windows `.msi`, select **"Install MongoD as a Service"** (it then starts automatically).
   - MongoDB Compass is offered in the same installer — keep it ticked.
3. **Cursor IDE** — open the `eventsphere` folder via *File → Open Folder*.

> If MongoDB isn't running: press `Win + R` → `services.msc` → find **MongoDB Server** → *Start*.

## 2. Set up the project

Open Cursor's terminal (`` Ctrl + ` ``) in the `eventsphere` folder:

```powershell
# 1. Install everything (root, server and client)
npm run install-all

# 2. Create the server config
copy server\.env.example server\.env

# 3. Load demo data (wipes and refills the "eventsphere" database)
npm run seed

# 4. Start API + web app together
npm run dev
```

- Web app: **http://localhost:5173**
- API: http://localhost:5000/api/health

> PowerShell error *"running scripts is disabled on this system"* when running `npm`?
> Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then reopen the terminal.

## 3. View the data in MongoDB Compass

1. Open Compass → **New connection** → URI: `mongodb://127.0.0.1:27017` → *Connect*.
2. Open the **eventsphere** database. Collections: `users`, `events`, `orders`, `tickets`,
   `venues`, `venueinquiries`, `booths`, `connections`, `chatmessages`.

## 4. Demo accounts (password for all: `password123`)

| Email | Role | Try this |
|---|---|---|
| organizer@eventsphere.in | Enterprise organizer | Open *Organizer* → **Bengaluru Tech & Culture Summit** → analytics, attendees, check-in, budget, expo |
| creator@eventsphere.in | Independent creator (free plan) | Create a small paid workshop in 2 minutes |
| attendee@eventsphere.in | Attendee with tickets | *My Tickets* → QR codes → *Join online* for the virtual venue |
| admin@eventsphere.in | Platform admin | Log in to land on the **Admin console** (`/admin`): overview, events, people, orders, activity log |

The Login page has one-click demo buttons.

### Suggested pilot walkthrough
1. Log in as **attendee** → buy a *Delegate* ticket for the summit using UPI → see the QR in *My Tickets*.
2. Open the **virtual venue**: chat, ask a question, send reactions, visit a sponsor booth, share your contact, connect with people.
3. Log in as **organizer** (another browser / incognito) → *Check-in* tab → paste the attendee's ticket code → ✓.
   Scan it again → ⚠ duplicate. Tick *Offline mode*, download the list, scan, then *Sync*.
4. Visit `http://localhost:5173/e/bengaluru-tech-culture-summit-2026?utm_source=linkedin&utm_campaign=pilot`
   in a fresh session, register, and watch the attribution chart update.
5. Add a **stream URL** (YouTube Live link) to a session in *Edit* → it plays on the virtual stage.

## 5. Project structure

```
eventsphere/
├── package.json              # root scripts: install-all, dev, seed, build, start
├── server/                   # Express + Mongoose API (ES modules)
│   ├── .env.example
│   └── src/
│       ├── index.js          # app, routes, Socket.IO, production static hosting
│       ├── seed.js           # demo data for the universal pilot event
│       ├── socket.js         # live chat, Q&A, reactions, presence
│       ├── config/db.js
│       ├── middleware/auth.js            # JWT, roles
│       ├── models/           # User, Event, Venue, VenueInquiry, Order, Ticket, Booth, Connection, ChatMessage
│       ├── routes/           # auth, events, orders, tickets, venues, expo, networking
│       ├── services/         # payments (gateway adapter), notifications (WhatsApp), crm (webhook)
│       └── utils/http.js     # errors, async wrapper, slugify
└── client/                   # React 18 + Vite
    └── src/
        ├── App.jsx, main.jsx, api.js, styles.css
        ├── context/AuthContext.jsx
        ├── components/       # Navbar, EventCard
        ├── pages/            # Home, EventDetail, Login, Register, MyTickets, VirtualVenue,
        │                     # OrganizerDashboard, EventEditor, ManageEvent, Venues
        └── utils/format.js
```

## 6. Key API endpoints

| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | JWT auth |
| POST | /api/auth/forgot-password, /api/auth/reset-password | password reset by emailed link (1 hour, single use) |
| POST | /api/auth/verify-email, /api/auth/resend-verification | email verification (24 hours) |
| GET | /api/tickets/:id/pdf | printable ticket PDF (holder or organizer) |
| GET | /api/events | marketplace search (`q, category, format, city, price, sort, page`) |
| GET | /api/events/:idOrSlug | event page (stream URLs only for ticket holders) |
| POST/PUT | /api/events, /api/events/:id | organizer create/edit |
| POST | /api/events/:id/status | draft / published / cancelled / completed |
| GET | /api/events/:id/analytics | revenue, attribution, check-ins, budget, booths |
| GET | /api/events/:id/attendees?format=csv | attendee export |
| GET | /api/coupons/check?eventId=&code= | public: is this promo code usable, and what is it worth (used by invitation links) |
| POST | /api/orders/quote | live price for a selection (group discount, optional `promoCode`) |
| POST | /api/orders → /api/orders/:id/pay | two-step checkout (free orders complete in step 1); accepts `promoCode` |
| GET | /api/events/:id/orders | organizer: orders with tickets, refund requests and refund history |
| POST | /api/orders/:id/refund | organizer: cancel and refund chosen tickets (`ticketIds`) or the whole order |
| POST | /api/tickets/:id/cancel-request (+ /withdraw, /decline) | buyer asks for a refund / withdraws it; organizer declines it |
| GET | /api/admin/overview, /events, /users, /orders, /activity | admin console data (admin role only) |
| POST | /api/admin/events/:id/feature, /takedown, /restore | pin an event to the top, hide it and stop sales, or put it back |
| PUT | /api/admin/users/:id | change role or plan, suspend or reinstate an account |
| GET/POST | /api/coupons/events/:eventId | organizer: list codes with sales per code / create a code |
| PUT/DELETE | /api/coupons/:id | pause, edit or delete a code (used codes can only be paused) |
| GET | /api/tickets/mine | my tickets, each with a `relation`: holder, transferPending or givenAway |
| POST | /api/tickets/:id/transfer, /api/tickets/:id/cancel-transfer | pass a ticket to someone else (new QR code) / take it back before they accept |
| POST | /api/tickets/claim | "Add to my account" link from a ticket email |
| GET | /api/tickets/manifest/:eventId | offline gate list (organizer or gate staff) |
| GET | /api/tickets/gate/:eventId | gate screen: event, caller's role, live entry count |
| GET/POST/DELETE | /api/events/:id/staff, /api/events/:id/staff/:userId | organizer: list, add (by email) or remove gate staff |
| GET | /api/events/staffed | events the logged-in user is gate staff for |
| POST | /api/tickets/checkin, /api/tickets/checkin/sync | live + offline check-in |
| GET/POST | /api/venues, /api/venues/:id/inquiries | venue sourcing |
| GET | /api/vendors | marketplace search (`category, city, guests, maxBudget, date, q, sort, page`) |
| GET | /api/vendors/:id, /api/vendors/:id/availability | listing page and its live calendar (`from`, `days`) |
| POST/PUT/DELETE | /api/vendors, /api/vendors/:id, /api/vendors/:id/blocked-dates | list a business, edit it, mark dates unavailable |
| POST | /api/vendors/:id/requests | customer: `kind` = booking, quote or visit |
| GET/POST | /api/vendors/requests/mine, /received, /:id/respond, /:id/act | both sides' request lists; vendor confirms/declines/quotes/reschedules; customer cancels or accepts |
| GET | /api/venues/inquiries/received | quote requests sent for venues I listed (admins: platform-listed venues too) |
| GET/POST | /api/notifications, /unread-count, /:id/read, /read-all | bell notifications for the logged-in organizer or admin |
| GET/POST | /api/expo/events/:eventId/booths, /api/expo/booths/:id/leads | expo + leads |
| GET/POST | /api/networking/events/:eventId/people, …/connections | networking |

## 7. Going from pilot to production

- **Real payments:** set `PAYMENT_MODE=razorpay` with `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `server/.env` (start with
  `rzp_test_...` keys - no real money moves) and restart the API. The checkout then opens Razorpay's payment window. Also add the
  webhook `https://<your-domain>/api/payments/razorpay/webhook` in the Razorpay dashboard (events: `payment.captured`, `payment.failed`,
  `order.paid`, `refund.processed`) and set `RAZORPAY_WEBHOOK_SECRET`, so tickets are issued even if the buyer closes the tab after paying.
- **Refunds:** go back through the gateway the order was paid with, for the exact amount paid for the cancelled tickets (ticket price
  after discount plus its share of the platform fee). Razorpay keeps its own transaction fee on refunds, and all ticket money currently
  lands in the platform's Razorpay account - organizer payouts and GST invoices are not built yet.
- **WhatsApp:** set `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN` (Meta Cloud API or a BSP like Gupshup/Interakt) and use approved templates.
- **Email:** set `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` (any SMTP provider: SES, Brevo, SendGrid, Zoho) and make sure
  `CLIENT_URL` is the public site address - it is used for the links inside emails. Until then every email is saved as an `.eml` file in `server/.outbox`
  and printed in the server console (that is where verification and reset links appear while developing).
- **Reminders:** run inside the API process every 5 minutes (`services/reminders.js`); switch off with `REMINDERS_ENABLED=false`.
- **Streaming at scale:** keep using YouTube/Vimeo/Mux embeds; add Mux or AWS IVS for private, ticket-gated streams.
- **Scale:** MongoDB Atlas (replica set → transactions), Redis adapter for Socket.IO across instances, queue (BullMQ) for notifications/CRM.
- **Security & compliance:** strong `JWT_SECRET`, rate limiting, HTTPS, DPDP Act (India) & GDPR consent records, data-deletion endpoints, audit logs for SOC 2.
- **Global:** multi-currency is already per event; add i18n (react-i18next) and Stripe for international cards.
- **Vendor marketplace demo data:** `npm run seed-vendors -- you@example.com` adds 11 demo listings owned by that existing
  account without wiping anything (the full `npm run seed` also creates them). Vendor bookings take no payment: the date is
  held once the vendor confirms (or at once with instant booking) and money is agreed directly between customer and vendor.
- **Admins:** there is no sign-up for admins. Ask the person to register normally, then run
  `npm run make-admin -- their@email.com` on the machine whose database you mean (add `--remove` to undo). On a live site do
  this instead of running the seed script, which wipes the database.
- **Signed QR codes:** each event's signing key pair is created automatically and stored on the event (`gateKey`); the private key is
  never sent to any browser. Back up the database - if an event's private key were lost, already-issued QR codes would stop verifying offline
  (typed codes and online scans would still work). Offline, a gate cannot know about scans made at *other* gates or transfers made after its
  last download, so sync as soon as the connection returns. Signature checking in the browser also needs HTTPS.
- **Camera scanning needs HTTPS:** browsers only allow camera access on `https://` sites (and on `localhost`). On a phone,
  open the deployed HTTPS site - a plain `http://192.168.x.x` address will not get camera access.
- **Native check-in app:** the gate screen (`/gate/:eventId`) can later be wrapped as an installable PWA or React Native app.

## 8. Production build (single server)

```powershell
npm run build
set NODE_ENV=production   # PowerShell: $env:NODE_ENV="production"
npm start
```
The API then also serves the built React app on http://localhost:5000.
