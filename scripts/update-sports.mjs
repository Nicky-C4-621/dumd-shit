// Fetches St. Louis Blues and Cardinals home games from the leagues' public schedule APIs
// (no keys needed) and writes data/sports.json. Run by .github/workflows/update-events.yml.
import { writeFileSync } from 'node:fs';

const TZ = 'America/Chicago';
const parts = iso => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:00` };
};
const today = parts(new Date().toISOString()).date;
const get = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'lineup-events' } }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const events = [];

try { // Blues (NHL)
  const d = await get('https://api-web.nhle.com/v1/club-schedule-season/STL/now');
  for (const g of d.games) {
    if (g.homeTeam.abbrev !== 'STL' || g.gameType === 1) continue; // home games, skip preseason
    const t = parts(g.startTimeUTC); if (t.date < today) continue;
    events.push({ id: 'nhl_' + g.id, cat: 'sports', title: `Blues vs. ${g.awayTeam.commonName.default}`, ...t,
      venue: 'Enterprise Center', city: 'St. Louis, MO', icon: '🏒', price: null,
      url: 'https://www.nhl.com/blues/tickets', source: 'NHL schedule' });
  }
} catch (e) { console.error('Blues failed:', e.message); }

try { // Cardinals (MLB)
  const y = new Date().getFullYear();
  for (const season of [y, y + 1]) {
    const d = await get(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=138&season=${season}&gameType=R`);
    for (const day of d.dates) for (const g of day.games) {
      if (g.teams.home.team.id !== 138 || /postponed|cancel/i.test(g.status.detailedState)) continue;
      const t = parts(g.gameDate); if (t.date < today) continue;
      events.push({ id: 'mlb_' + g.gamePk, cat: 'sports', title: `Cardinals vs. ${g.teams.away.team.name}`, ...t,
        venue: 'Busch Stadium', city: 'St. Louis, MO', icon: '⚾', price: null,
        url: 'https://www.mlb.com/cardinals/tickets', source: 'MLB schedule' });
    }
  }
} catch (e) { console.error('Cardinals failed:', e.message); }

if (!events.length) { console.error('No events fetched; leaving data/sports.json unchanged.'); process.exit(0); }
events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
writeFileSync(new URL('../data/sports.json', import.meta.url), JSON.stringify({ updated: new Date().toISOString(), events }, null, 1) + '\n');
console.log('Wrote', events.length, 'events');
