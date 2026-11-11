# EventSphere — All-in-one Event Management Platform (MERN)

India-first, global-ready event platform covering conferences, webinars, festivals, concerts,
workshops and meetups — in-person, virtual and **hybrid** — in one modular system.

| Area | What's built |
|---|---|
| Marketplace & discovery | Public event listing with search, city, category, format, free/paid filters, featured & popular sorting |
| Self-service ticketing | Multiple ticket tiers, per-order limits, sold-out handling, oversell-proof inventory reservation |
| Payments (India) | UPI / card / net banking / wallet checkout (simulated adapter — swap in Razorpay/Cashfree), platform fee model |
| Custom registration | Per-event custom questions (text, select, checkbox, required) |
| Marketing attribution | UTM capture (first touch), attribution by source, conversion rate, CSV export for CRM import |
| CRM sync | Per-event webhook push of every registration (Zapier/Make/HubSpot/Salesforce flows) |
| WhatsApp | Ticket confirmations via WhatsApp API (logs to console until configured) |
| Hybrid / virtual venue | Live stage (YouTube/Vimeo embed), real-time chat, Q&A, emoji reactions, live viewer count (Socket.IO) |
| Virtual expo | Sponsor booths by tier, on-site stall mapping, visit tracking, lead capture & export |
| Networking | Attendee directory, connection requests, contact sharing on acceptance |
| On-ground ops | QR tickets, gate scanner (works with USB/Bluetooth scanners), **offline mode** with manifest download + later sync, duplicate-entry protection |
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
| admin@eventsphere.in | Platform admin | Can manage any event |

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
| GET | /api/events | marketplace search (`q, category, format, city, price, sort, page`) |
| GET | /api/events/:idOrSlug | event page (stream URLs only for ticket holders) |
| POST/PUT | /api/events, /api/events/:id | organizer create/edit |
| POST | /api/events/:id/status | draft / published / cancelled / completed |
| GET | /api/events/:id/analytics | revenue, attribution, check-ins, budget, booths |
| GET | /api/events/:id/attendees?format=csv | attendee export |
| POST | /api/orders → /api/orders/:id/pay | two-step checkout (free orders complete in step 1) |
| GET | /api/tickets/mine | attendee tickets |
| GET | /api/tickets/manifest/:eventId | offline gate list |
| POST | /api/tickets/checkin, /api/tickets/checkin/sync | live + offline check-in |
| GET/POST | /api/venues, /api/venues/:id/inquiries | venue sourcing |
| GET/POST | /api/expo/events/:eventId/booths, /api/expo/booths/:id/leads | expo + leads |
| GET/POST | /api/networking/events/:eventId/people, …/connections | networking |

## 7. Going from pilot to production

- **Real payments:** implement `createIntent` / `verify` for Razorpay or Cashfree in
  `server/src/services/payments.js` and set `PAYMENT_MODE`. Verify webhooks server-side.
- **WhatsApp:** set `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN` (Meta Cloud API or a BSP like Gupshup/Interakt) and use approved templates.
- **Email:** add an email channel (SES/SendGrid) in `services/notifications.js`.
- **Streaming at scale:** keep using YouTube/Vimeo/Mux embeds; add Mux or AWS IVS for private, ticket-gated streams.
- **Scale:** MongoDB Atlas (replica set → transactions), Redis adapter for Socket.IO across instances, queue (BullMQ) for notifications/CRM.
- **Security & compliance:** strong `JWT_SECRET`, rate limiting, HTTPS, DPDP Act (India) & GDPR consent records, data-deletion endpoints, audit logs for SOC 2.
- **Global:** multi-currency is already per event; add i18n (react-i18next) and Stripe for international cards.
- **Native check-in app:** wrap the check-in tab as a PWA or React Native app with camera scanning.

## 8. Production build (single server)

```powershell
npm run build
set NODE_ENV=production   # PowerShell: $env:NODE_ENV="production"
npm start
```
The API then also serves the built React app on http://localhost:5000.
