# Lineup

A shared, no-login events finder: concerts, sports, comedy & theater, food, conventions, festivals, family and free events near you.

- Category home page → live event list with **Free / Paid** badges
- Price comparison across sellers, with the cheapest **verified** seller highlighted (unknown sellers get a warning)
- Add to Google Calendar or download an `.ics` (Apple/Outlook)
- Share button (native share sheet, or copy)
- All outside links open in a new tab
- City / ZIP search or 📍 use my location

## Run it
It's a static site. Open `index.html`, or host the repo root with GitHub Pages (Settings → Pages → deploy from branch).

## Live data
With no key it runs in **demo mode** (sample events). Each person taps ⚙️ and pastes a free key, which is stored only in their own browser:
- Ticketmaster Consumer Key — https://developer.ticketmaster.com/ (events + prices)
- SeatGeek client ID (optional) — https://seatgeek.com/build (adds a second price)

## Notes / limits
- Event data comes from Ticketmaster, so small local, food and free events may be sparse.
- "Verified" = official box office or resellers with a buyer guarantee (list in `app.js`, `VERIFIED`). Vendors without a shared price show a "Search" link instead of a number.
