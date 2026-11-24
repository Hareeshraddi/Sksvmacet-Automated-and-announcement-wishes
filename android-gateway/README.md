# Sending real SMS with no API key (Android phone gateway)

This sends real SMS through **your own Android phone's SIM**. The college backend
posts a message to the phone over Wi-Fi; the phone sends it. There is no vendor
account, no API key, and no cloud service. It works for a single phone and small
batches (Android limits non-default SMS apps to about 30 messages per 30 minutes).

## Choose one phone bridge

- **Termux bridge (fastest, no compiling):** `termux-gateway.py`
- **Android app (cleaner, always-on notification):** the `android/` project

Both expose the same API on port 8080:

- `GET /health` -> `{"ok":true,"device":"...","port":8080}`
- `POST /send` with `{"to":"+919164066966","body":"Hello"}` -> `{"ok":true,"id":"..."}`
- Optional header `X-Gateway-Token: <token>` when a token is configured.

## 1. Network requirement (read this first)

The phone and the PC running the backend must be on the same network, and the
router must **not** isolate clients (guest Wi-Fi and many campus Wi-Fis do).
If the PC cannot open `http://PHONE_IP:8080/health` in a browser, the phone is
unreachable. (When a shared token is set, test with
`curl -H "X-Gateway-Token: <token>" http://PHONE_IP:8080/health`.) A phone
hotspot with the PC connected to it is the most reliable setup. Allow the
phone's hotspot to stay on while sending.

Find the phone IP in Android Settings > Wi-Fi > current network, or the gateway
app/script prints it.

## 2A. Termux bridge (recommended to get running today)

Install **Termux** and **Termux:API** from F-Droid (not the outdated Play Store
build). In Termux:

```sh
pkg update
pkg install python termux-api
termux-wake-lock
```

Get `termux-gateway.py` onto the phone. Easiest: on the PC, from this folder run
`python -m http.server 9000`, then on the phone run
`pkg install curl` and `curl -O http://PC_IP:9000/termux-gateway.py`.
(Or copy it to Downloads with `termux-setup-storage` and `cp`.)

Start it:

```sh
GATEWAY_TOKEN=choose-a-long-random-value python termux-gateway.py
```

The first send prompts for the SMS permission in Termux:API — allow it. Keep
Termux open; disable battery optimisation for Termux so Android does not kill it.

## 2B. Android app

1. Install Android Studio (or JDK 17 + Android SDK), open the `android/` folder.
   If Android Studio asks about a missing Gradle wrapper, let it use Gradle 8.7
   (or run `gradle wrapper --gradle-version 8.7` once with a local Gradle).
2. Let Gradle sync, then **Build > Build Bundle(s)/APK(s) > Build APK(s)**.
3. Copy `app/build/outputs/apk/debug/app-debug.apk` to the phone and install it
   (allow "install unknown apps" for your file manager).
4. Open **SMS Gateway**, set the port and the same shared token, tap
   **Start gateway**, allow SMS and notification permissions, then
   **Allow background running**.

The APK contains no third-party SDK, no analytics and no internet permissions
beyond the local HTTP server.

## 3. Configure the backend

In `server/.env`:

```ini
SMS_MODE=live
SMS_PROVIDER=phone
PHONE_GATEWAY_URL=http://192.168.1.50:8080
PHONE_GATEWAY_TOKEN=choose-a-long-random-value
PHONE_GATEWAY_DELAY_MS=1200
```

Restart the backend. Then in the dashboard **Settings > Real SMS gateway**:

1. **Check connection** — confirms the backend can reach the phone.
2. **Send test SMS** — sends one real message and logs it under Messages.

## 4. Reality checks

- **Real SMS needs a carrier.** Without a SIM there is no free, unlimited,
  no-key way to send SMS. This is the only no-key route that reaches real phones.
- **Volume:** a normal Android app is rate-limited by the OS to roughly
  30 SMS / 30 minutes. A college-wide blast of hundreds of messages per day is
  not practical this way; use an approved DLT gateway for that.
- **India / TRAI:** bulk commercial SMS requires DLT registration; sending bulk
  promotional traffic through a personal SIM can be blocked by the operator and
  may violate TRAI rules. Use this for consented, low-volume notices only.
- **The phone must stay on, online, unlocked enough to keep the bridge alive,**
  on the same network, and with credit/plan for SMS.
- The backend marks a message `submitted` when the phone accepts it. A handset
  delivery report is not implemented; there is no fabricated "delivered" status.
