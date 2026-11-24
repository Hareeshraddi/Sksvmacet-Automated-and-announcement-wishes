# Smart College Wishes & Notification System

A local-first college communication system with an administrator dashboard, SQLite database, student/staff records, Excel/CSV import/export, birthday and retirement automation, achievements, announcements, templates, audit trail and demo SMS mode.

## Architecture
React/Vite -> Express REST API -> SQLite; node-cron runs in the Express process, with a pluggable SMS module. For production at scale, migrate to PostgreSQL and a durable queue/worker. This edition is a functional local deployment / pilot, **not a security-audited production system**.

## Windows setup (Node.js 20 LTS or 22 LTS recommended)

### Quick start — double-click `start.bat`

1. Extract the ZIP to a normal folder (avoid OneDrive-synced paths if you can).
2. Double-click **`start.bat`** in the project root.
3. Dependencies (`node_modules`) are already bundled, so it starts immediately — no
   `npm install` and no internet needed. It creates `server/.env` from `.env.example`
   if missing, opens two windows (backend on port 4000, frontend on 5173) and launches
   your browser at <http://localhost:5173>.
4. Close the two server windows to stop the app.

If you delete `node_modules` later, `start.bat` reinstalls it automatically (that needs
internet and, on some machines, Visual Studio Build Tools for `better-sqlite3`).

Edit `server/.env` afterwards to set `ADMIN_PASSWORD`, `JWT_SECRET` and your SMS provider.

### Manual setup
1. Extract ZIP to a normal folder.
2. Open PowerShell in `server`: `cd server`
3. Run `Copy-Item .env.example .env`
4. Edit `.env` and set a unique `JWT_SECRET` (32+ characters) and `ADMIN_PASSWORD`. Keep `SMS_MODE=demo` initially.
5. Run `npm install` then `npm start`. Server starts at http://localhost:4000.
6. Open another PowerShell in `client`: `cd client`; run `npm install` then `npm run dev`.
7. Open http://localhost:5173. Sign in with the ADMIN_EMAIL and ADMIN_PASSWORD you configured.

`better-sqlite3` requires a compatible Node version; Node 22 LTS is a good choice. Database file `server/college.db` is created automatically. Back up this file securely. The first admin account is created on first startup; changing ADMIN_PASSWORD afterward does not reset it.

## Test the entire workflow
1. Keep `SMS_MODE=demo` so **no real SMS is sent**.
2. Add a student with DOB matching today's month/day and a valid Indian mobile number (a non-personal test number is fine in demo mode).
3. Settings -> Test daily automation -> select today's date -> Run.
4. Messages -> confirm one birthday message with status `demo`.
5. Run the same job again: no second message should be created.
6. Add a staff member with retirement date today; rerun and verify retirement message.
7. Add an achievement; confirm message in history.
8. Schedule an announcement for the current/past local time; it is processed immediately. Future announcements are processed every minute.
9. Import a CSV with columns `kind,name,phone,email,identifier,department,designation,dob,retirement_date`. Dates must be `YYYY-MM-DD`. Export records and message history as XLSX.

## Free SMS API options

**There is no free API that sends real SMS to India without either a phone or a
payment.** These are the tested facts, not guesses:

| Provider | What you get | Needs a phone? | Notes |
|---|---|---|---|
| **textbee** | 300 SMS/month, 50/day, permanent | **Yes** (any Android 7+ phone + SIM) | No card, no DLT, sends to any number from your own SIM. **This is the only genuinely free option.** |
| **Fast2SMS** | ₹50 signup credit, but API is locked | No | Tested: sending returns *"You need to complete one transaction of 100 INR or more before using API route."* One ₹100 recharge unlocks it. |
| **Textbelt** | Free key `textbelt` | No | Tested: *"free SMS are disabled for this country due to abuse"* for India. Not usable. |
| **Pingram** | 100 SMS/month (US-equivalent) | No | ~13 SMS to India at $0.075/SMS. India delivery/DLT is unverified. |
| **Twilio / Vonage / AWS SNS** | Trial credits | No | Trials only reach numbers you verify first, and usually need a card. Not usable for student blasts. |
| **SMSLocal** | Sandbox credits | No | Sandbox returns IDs but does not deliver. Live needs DLT sender/template. |

### Option 1 — textbee (free, 300 SMS/month, recommended)

1. Create an account at <https://textbee.dev> (no credit card).
2. On the phone: install the APK from <https://textbee.dev/download>, allow SMS
   permission, then scan the QR code shown in the textbee dashboard.
3. Copy the API key from the dashboard.
4. In `server/.env`:
   ```ini
   SMS_MODE=live
   SMS_PROVIDER=textbee
   TEXTBEE_API_KEY=your-key
   TEXTBEE_DEVICE_ID=
   ```
   Leave `TEXTBEE_DEVICE_ID` blank to use the linked phone.
5. Restart the backend and press **Check connection** — it should report the linked
   device. Then **Send test SMS**.

The phone must stay on and connected to the internet. Limits: 50/day, 300/month.

### Option 2 — Fast2SMS (₹100 one-time, no phone)

1. Sign up at <https://www.fast2sms.com>.
2. Recharge **₹100 or more once** — their API stays locked until that first payment.
3. Open **Dev API**, copy the API key.
4. In `server/.env`:
   ```ini
   SMS_MODE=live
   SMS_PROVIDER=fast2sms
   FAST2SMS_API_KEY=your-key
   FAST2SMS_ROUTE=q
   ```
5. Restart and send a test. Route `q` (Quick SMS) needs no DLT registration.

### Option 3 — your own Android phone bridge (no key, no account)

See [Real SMS with no API key](#real-sms-with-no-api-key-android-phone-gateway) below.

All providers are implemented in `server/sms.js`; the status/test buttons in Settings
work for `textbelt`, `textbee`, `fast2sms` and `phone`.

## Real SMS with no API key (Android phone gateway)

This build can send **real SMS through your own Android phone's SIM**, with no
vendor API key and no cloud account. The backend calls the phone over Wi-Fi; the
phone sends the SMS. Setup and limitations are in
[`android-gateway/README.md`](android-gateway/README.md). Short version:

1. Install the Termux bridge (`android-gateway/termux-gateway.py`) or build the
   Android app in `android-gateway/android/`.
2. Put the phone and the backend PC on the same Wi-Fi (or the PC on the phone's
   hotspot), and confirm `http://PHONE_IP:8080/health` opens from the PC.
3. In `server/.env`: `SMS_MODE=live`, `SMS_PROVIDER=phone`,
   `PHONE_GATEWAY_URL=http://PHONE_IP:8080`, and ideally
   `PHONE_GATEWAY_TOKEN=<long random value>`.
4. Restart the backend, then use **Settings -> Real SMS gateway -> Check
   connection / Send test SMS**.

Reality check: without a SIM there is no free, no-key way to reach real phones.
A normal Android app is also rate-limited to roughly 30 SMS per 30 minutes, so
this route suits small batches and notices, not college-wide blasts. In India,
bulk commercial SMS still requires DLT registration; use this only for consented,
low-volume messages.

## Real SMS gateway
The included live adapter targets **Fast2SMS** at `https://www.fast2sms.com/dev/bulkV2`. **Confirm your key is actually issued by Fast2SMS**; API keys from other providers will not work. Rotate any key previously shared in a chat. Add the new key to `server/.env` as `FAST2SMS_API_KEY`, then set `SMS_MODE=live` and restart. Never put secrets in React or Git. The route defaults to `q`; the appropriate approved route, sender ID and DLT template ID depend on your account and Indian operator rules. Gateway acceptance is shown as `submitted`, **not delivered**. Delivery receipt webhook/polling is NOT implemented because Fast2SMS callback capability and the account configuration must be verified. No fabricated delivery confirmations are shown.

### Regulatory and cost considerations
Indian commercial/bulk SMS may require TRAI DLT entity registration, sender header, approved message templates and consent/notice depending on route and purpose. Verify current rules with your gateway before going live. Pricing depends on route, volume, taxes and gateway; review the provider's current rate card rather than relying on a fixed estimate. Test with approved recipients only.

## Security and production checklist
Passwords are bcrypt-hashed; API uses signed JWT with an 8-hour expiry; protected endpoints require login; write endpoints require admin; HTTP security headers and rate limits are enabled. Sensitive database and environment files are gitignored. Restrict hosting, use HTTPS, strong secrets, secure backups, a retention policy, access logging and proper authorization before using actual student/staff personal data. Single-admin local setup is included; a multi-user role management UI is not included. The API role guard is ready for extension. The scheduler runs only while the backend is online. For dependable hosted scheduling use a persistent worker/queue and an always-on backend; never deploy this as a sleeping free web service.

## Hosting
Frontend: build with `npm run build` in client and deploy `client/dist` to a static host. Update the API base URL in `client/src/main.jsx` before building. Backend: deploy to an always-on Node host with a persistent disk (SQLite) and configure environment secrets; set `CLIENT_ORIGIN` to the frontend origin. A stateless/serverless backend without persistent storage or scheduled worker will not work correctly. Most always-on hosted backends or SMS sending incur costs; local demo remains free.

## Limitations to know
- Current message status is `demo`, `submitted` or `failed`; delivery receipts require provider-specific verified callbacks.
- The built-in scheduler is suitable for a single always-on Node instance, not multi-instance deployment.
- Calendar is a chronological birthday list, not a month-grid calendar.
- No automated retry of failed live SMS; review failures in Messages before resending through a new workflow.
- The included dependencies require internet for initial `npm install`.
- Production hardening (CSRF/session model, consent workflows, comprehensive integration testing, backups, DLT approval and gateway callback verification) remains the operator's responsibility.

## SMSLocal India integration (updated)

This build supports SMSLocal India (`https://app.smslocal.in`) and retains Fast2SMS as an alternative. **No API key is included.** The credential previously pasted into chat should be rotated in SMSLocal Settings → API & Webhooks before live use.

1. Install Node.js 24 and run `npm install` inside `server` and `client` separately. If a native `better-sqlite3` installation fails, run `npm install better-sqlite3@latest --save` in `server` and retry.
2. In `server`, run `Copy-Item .env.example .env` (PowerShell) and edit `.env`. Set a unique `JWT_SECRET` (32+ characters) and strong `ADMIN_PASSWORD`. The `.env` must remain inside `server`, not in the project root.
3. Start in `SMS_MODE=demo`, `SMS_PROVIDER=smslocal`. Leave the SMSLocal key blank in demo mode. Start backend with `npm start`, then frontend with `npm run dev` from `client`.
4. Add a sample student/staff record and use an announcement or achievement to verify the message history says `demo`. Demo sends do not reach phones.
5. To enable **real SMS**, obtain an active SMSLocal API key and approved DLT 6-character sender ID and 19-digit content template ID, and ensure the message body matches the approved DLT template. In `server/.env` set `SMS_MODE=live`, `SMS_PROVIDER=smslocal`, `SMSLOCAL_API_KEY`, `SMSLOCAL_SENDER_ID`, `SMSLOCAL_DLT_TEMPLATE_ID`, and `SMSLOCAL_ROUTE=1` only if your content qualifies as transactional/service messaging. Restart the backend. **Do not put the key in the frontend or commit `.env`.**
6. Send a single consented test SMS. A `submitted` message only means the gateway accepted the request. For a submitted message, a logged-in administrator can POST `/api/messages/:id/check-delivery` (Authorization: Bearer token) to query the SMSLocal delivery report and update the local message status. This is not automatic polling; the UI currently does not expose a delivery-refresh button.
7. The birthday job runs daily at the configured send time while the backend is running. Use the dashboard's manual birthday-job action for testing. Duplicate daily birthday messages are prevented by unique keys. **For production**, use a persistent always-on server, proper backups, monitoring, HTTPS, approved SMS templates, and institutional consent/legal review. This local project has not been end-to-end tested against a live SMSLocal account.

Official API documentation: https://www.smslocal.in/developers/api-docs/ . SMSLocal reports that sandbox credits return message IDs without delivering SMS to the handset. Real delivery requires a live/eligible account and approved sender/template, not merely an API key.

### Local SMS adapter tests

After installing server dependencies, run `npm test`. These tests mock SMSLocal network responses and do not send SMS.
