# Virtual Phone 📱

A phone in your browser — lock screen, home screen, Messages, Phone dialer, Contacts and Settings — that **sends and receives real text messages**.

## Two ways to send

| Mode | What happens when you hit send | Needs |
| --- | --- | --- |
| **Real SMS (Twilio)** | The server texts the number from your Twilio number. Replies show up in the phone live, with notifications and unread badges. | `node server.js` + a Twilio account |
| **Device hand-off** | Opens your device's Messages app with the number and text filled in — you tap send there. | Nothing. Just open `public/index.html` |

The phone picks the mode automatically; Settings shows which one is active.

## Quick start (no setup)

Open `public/index.html` in a browser. Best on an actual phone, where send hands off to your Messages app.

## Real two-way SMS with Twilio

1. Sign up at <https://www.twilio.com> and get a phone number with SMS (a trial account works, but can only text numbers you've verified).
2. `cp .env.example .env` and fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and an `APP_TOKEN` password.
3. `npm start` (Node 18+, nothing to install) and open <http://localhost:3000>. Enter your `APP_TOKEN` in **Settings** on the phone.
4. To receive replies, Twilio needs to reach your server:
   - Expose it, e.g. `ngrok http 3000`.
   - Twilio console → your number → *Messaging* → "A message comes in": **Webhook**, `POST`, `https://<your-ngrok-url>/api/twilio/inbound`.
   - Set `PUBLIC_URL=https://<your-ngrok-url>` in `.env` so incoming webhooks are signature-checked.

Messages the server sends/receives are kept in `data/messages.json`; the phone also keeps its own copy (and your contacts) in browser storage.

> US numbers: Twilio requires A2P 10DLC registration to text US numbers from a regular long code. Without it, messages may fail with a carrier error — the phone shows the error under the message.

## Features

- Lock screen with live clock and unread message previews (swipe up or tap)
- Home screen with badges, dock, and a home bar (tap it to go home / lock)
- iMessage-style threads, timestamps, delivery status, tap-to-retry on failures
- Incoming-message banners, contact names, search
- Dialer with keypad (keyboard works too; long-press 0 for +) — calls hand off to your device
- Light/dark theme and wallpapers

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/status` | `{ twilio, from, authRequired }` |
| GET | `/api/messages?since=<seq>` | header `x-app-token` if `APP_TOKEN` set |
| POST | `/api/send` | `{ to, body, id? }`, header `x-app-token` |
| POST | `/api/twilio/inbound` | Twilio webhook |
