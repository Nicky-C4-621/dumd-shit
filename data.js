// Sample events for demo mode (shown when no Ticketmaster key is saved).
(function () {
  const pad = n => String(n).padStart(2, '0');
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const V = (name, price, verified, url) => ({ name, price, verified, url });
  const TM = 'https://www.ticketmaster.com', SG = 'https://seatgeek.com', SH = 'https://www.stubhub.com', VV = 'https://www.vividseats.com', AX = 'https://www.axs.com';
  const E = (id, cat, title, n, time, venue, city, icon, price, extra = {}) =>
    ({ id: 'demo_' + id, cat, title, date: day(n), time, venue, city, icon, price, source: 'demo', url: null, ...extra });

  window.DEMO_EVENTS = [
    E('c1', 'concerts', 'Neon Skyline — Afterglow Tour', 6, '20:00:00', 'The Grand Hall', 'Your City', '🎤', { min: 48, max: 160, currency: 'USD' },
      { vendors: [V('Ticketmaster', 62, true, TM), V('SeatGeek', 54, true, SG), V('StubHub', 58, true, SH), V('Vivid Seats', 49, true, VV), V('QuickTixz (unknown seller)', 31, false, 'https://example.com')] }),
    E('c2', 'concerts', 'The Midnight Parade', 12, '19:30:00', 'Riverside Amphitheater', 'Your City', '🎸', { min: 35, max: 95, currency: 'USD' },
      { vendors: [V('AXS', 41, true, AX), V('SeatGeek', 38, true, SG), V('Ticketmaster', 45, true, TM)] }),
    E('c3', 'concerts', 'DJ Solenne — Live', 3, '22:00:00', 'Club Voltage', 'Your City', '🎧', { min: 25, max: 40, currency: 'USD' },
      { vendors: [V('Ticketmaster', 28, true, TM), V('Vivid Seats', 33, true, VV)] }),
    E('c4', 'concerts', 'Open Mic Night', 2, '19:00:00', 'The Corner Café', 'Your City', '🎶', { min: 0, max: 0, currency: 'USD' }, { vendors: [] }),
    E('s1', 'sports', 'City Hawks vs. Harbor Kings', 8, '19:05:00', 'Hawks Arena', 'Your City', '🏀', { min: 22, max: 310, currency: 'USD' },
      { vendors: [V('Ticketmaster', 30, true, TM), V('SeatGeek', 24, true, SG), V('StubHub', 27, true, SH)] }),
    E('s2', 'sports', 'Metro FC Home Opener', 15, '15:00:00', 'Metro Stadium', 'Your City', '⚽', { min: 18, max: 120, currency: 'USD' },
      { vendors: [V('Ticketmaster', 18, true, TM), V('SeatGeek', 21, true, SG)] }),
    E('s3', 'sports', 'Charity 5K Fun Run', 9, '08:00:00', 'Lakefront Park', 'Your City', '🏃', { min: 0, max: 0, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('t1', 'comedy-theater', 'Dana Ruiz: Unfiltered', 10, '20:30:00', 'The Laugh Loft', 'Your City', '😂', { min: 29, max: 59, currency: 'USD' },
      { vendors: [V('Ticketmaster', 34, true, TM), V('SeatGeek', 29, true, SG)] }),
    E('t2', 'comedy-theater', 'Les Étoiles — The Musical', 20, '19:00:00', 'Palace Theatre', 'Your City', '🎭', { min: 55, max: 210, currency: 'USD' },
      { vendors: [V('Ticketmaster', 79, true, TM), V('Vivid Seats', 68, true, VV)] }),
    E('t3', 'comedy-theater', 'Improv Free-for-All', 5, '21:00:00', 'Studio B', 'Your City', '🎪', { min: 0, max: 0, currency: 'USD' }, { vendors: [] }),
    E('f1', 'food-drink', 'Taco & Tequila Fest', 11, '12:00:00', 'Market Square', 'Your City', '🌮', { min: 15, max: 40, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('f2', 'food-drink', 'Farmers Market & Food Trucks', 4, '09:00:00', 'Central Plaza', 'Your City', '🥕', { min: 0, max: 0, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('f3', 'food-drink', 'Craft Beer Weekend', 18, '14:00:00', 'Brewery Row', 'Your City', '🍺', null, { url: 'https://example.com', vendors: [] }),
    E('v1', 'conventions', 'Pixel Con — Gaming & Comics Expo', 25, '10:00:00', 'Convention Center', 'Your City', '🎮', { min: 30, max: 120, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('v2', 'conventions', 'Home & Garden Expo', 14, '10:00:00', 'Expo Hall B', 'Your City', '🏡', { min: 10, max: 10, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('v3', 'conventions', 'Career & Tech Fair', 7, '11:00:00', 'University Union', 'Your City', '💼', { min: 0, max: 0, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('fe1', 'festivals', 'Summer Lights Festival', 30, null, 'Waterfront Park', 'Your City', '🎆', { min: 45, max: 180, currency: 'USD' },
      { vendors: [V('AXS', 85, true, AX), V('Ticketmaster', 89, true, TM)] }),
    E('fe2', 'festivals', 'Lantern & Culture Night', 16, '17:00:00', 'Old Town', 'Your City', '🏮', { min: 0, max: 0, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('fa1', 'family', 'Dino World Live', 13, '14:00:00', 'Expo Arena', 'Your City', '🦖', { min: 20, max: 65, currency: 'USD' },
      { vendors: [V('Ticketmaster', 24, true, TM), V('SeatGeek', 22, true, SG)] }),
    E('fa2', 'family', 'Puppet Story Hour', 1, '10:30:00', 'Public Library', 'Your City', '🧸', { min: 0, max: 0, currency: 'USD' }, { vendors: [] }),
    E('fr1', 'free', 'Outdoor Movie Night', 6, '20:30:00', 'Riverside Lawn', 'Your City', '🎬', { min: 0, max: 0, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('fr2', 'free', 'Art Walk Downtown', 9, '17:00:00', 'Gallery District', 'Your City', '🎨', { min: 0, max: 0, currency: 'USD' }, { url: 'https://example.com', vendors: [] }),
    E('fr3', 'free', 'Community Cleanup & Picnic', 17, '10:00:00', 'Greenway Trail', 'Your City', '🌳', { min: 0, max: 0, currency: 'USD' }, { url: 'https://example.com', vendors: [] })
  ];
})();
