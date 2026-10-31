// SAMPLE business data for a fictional roofer. Generated from a fixed seed, dated relative to today.
// Nothing in this file is real: names, jobs, revenue, calls and agent stats are illustrative.
(function () {
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const R = rng(20260924);
  const pick = a => a[Math.floor(R() * a.length)];
  const DAY = 864e5;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const daysAgo = n => new Date(today.getTime() - n * DAY);
  const iso = d => d.toISOString().slice(0, 10);

  const first = "Mike Sarah James Linda Robert Karen David Lisa Chris Amy Brian Megan Kevin Rachel Jason Tara Mark Holly Travis Dana Wes Kristen Dustin Jenna Lance Haley Brent Kelsey".split(" ");
  const last = "Parker Bennett Hughes Collins Foster Reed Price Morgan Brooks Sanders Hayes Ward Tucker Fields Harmon Pruitt Whitfield Dalton Crowder Boone Holloway Ashby Odom Rainey Sutter Yates Kemp".split(" ");
  const streets = ["Timbercrest Ct", "Brookhaven Blvd", "Rock Creek Rd", "Classen Blvd", "W Boyd St", "Lindsey St", "Pebble Creek Dr", "Hollywood Ave", "Crestmont Dr", "Cherry Stone Dr", "Wheatland Dr", "Summit Lake Blvd", "Hidden Hill Rd", "E Alameda St", "Kingfisher Dr", "Sandpiper Dr"];
  const reps = ["Cody", "Jordan", "Alyssa", "Marcus"];
  const zips = ["73069", "73071", "73072", "73026"];
  const name = () => `${pick(first)} ${pick(last)}`;
  const addr = () => `${100 + Math.floor(R() * 4800)} ${pick(streets)}`;

  // ---------- jobs ----------
  const jobs = [];
  for (let i = 0; i < 96; i++) {
    const d = daysAgo(Math.floor(Math.pow(R(), 1.35) * 180));
    const kind = R() < 0.62 ? "Full replacement" : pick(["Repair", "Repair", "Gutters", "Skylight reseal"]);
    const amount = kind === "Full replacement" ? Math.round((9800 + R() * 15800) / 50) * 50 : Math.round((450 + R() * 2600) / 25) * 25;
    const insurance = kind === "Full replacement" && R() < 0.7;
    jobs.push({ id: 1000 + i, customer: name(), address: addr(), zip: pick(zips), signed: iso(d), date: d, kind, amount, insurance, rep: pick(reps), squares: kind === "Full replacement" ? Math.round((22 + R() * 18) * 10) / 10 : null });
  }
  jobs.sort((a, b) => b.date - a.date);

  const proposals = [];
  for (let i = 0; i < 21; i++) {
    const d = daysAgo(Math.floor(R() * 24));
    proposals.push({ customer: name(), address: addr(), sent: iso(d), date: d, amount: Math.round((10500 + R() * 14500) / 50) * 50, stage: pick(["Sent", "Viewed", "Viewed", "Adjuster meeting", "Waiting on carrier"]) });
  }

  // ---------- calendar (next 21 days and last 7) ----------
  const events = [];
  for (let k = -7; k < 22; k++) {
    const d = new Date(today.getTime() + k * DAY);
    if (d.getDay() === 0) continue;
    const n = d.getDay() === 6 ? 1 : 1 + Math.floor(R() * 3);
    for (let j = 0; j < n; j++) {
      const type = pick(["Inspection", "Inspection", "Install", "Adjuster meeting", "Estimate"]);
      const hour = 8 + Math.floor(R() * 9);
      events.push({ date: iso(d), time: `${hour > 12 ? hour - 12 : hour}:${R() < .5 ? "00" : "30"} ${hour >= 12 ? "PM" : "AM"}`, hour, type, who: name(), where: pick(streets) });
    }
  }
  events.sort((a, b) => (a.date + String(a.hour).padStart(2, "0")).localeCompare(b.date + String(b.hour).padStart(2, "0")));

  const tasks = [
    { t: "Call Dana Ward back about the adjuster visit", tag: "Claims", done: false },
    { t: "Order shingles for the Brooks job (Weathered Wood)", tag: "Install", done: false },
    { t: "Approve 3 proposals the Estimator drafted", tag: "Proposals", done: false },
    { t: "Review storm check-in list before it goes out", tag: "Storm", done: false },
    { t: "Upload final photos for the Hayes install", tag: "Install", done: true },
    { t: "Confirm dumpster drop for Thursday", tag: "Install", done: true }
  ];

  // ---------- calls (AI Front Desk) ----------
  const calls = [
    {
      who: "Rachel Foster", phone: "(405) 555-0187", ago: "12 min ago", dur: "3:42", tag: "Inspection booked", kind: "booked",
      steps: ["Looked up the address", "Checked radar hail history", "Checked the crew calendar", "Checked the forecast", "Booked the inspection", "Sent a text confirmation"],
      lines: [
        ["ai", "Thanks for calling " + "{company}" + ", this is the front desk. How can I help?"],
        ["caller", "Hi, we had hail come through last night and I think our roof got hit. There are dents on the gutters."],
        ["ai", "Sorry to hear that. What is the address so I can pull it up?"],
        ["caller", "It's on Timbercrest Court, in Norman."],
        ["ai", "Got it. Radar shows hail about an inch and a half over your street. That is big enough to bruise shingles, so an inspection makes sense."],
        ["caller", "Okay. How soon can someone come out?"],
        ["ai", "I have Thursday at 9:30 in the morning or Friday at 2. Thursday is dry, Friday has a chance of storms in the afternoon."],
        ["caller", "Thursday at 9:30 works."],
        ["ai", "You are booked for Thursday at 9:30 with Jordan. I just texted you a confirmation and his photo. Anything else?"],
        ["caller", "No, that's great. Thank you."]
      ]
    },
    { who: "Wes Holloway", phone: "(405) 555-0123", ago: "48 min ago", dur: "2:10", tag: "Quote follow-up", kind: "follow", steps: ["Found the open proposal", "Answered the warranty question", "Flagged for Cody"], lines: [["ai", "Thanks for calling {company}, how can I help?"], ["caller", "I got your proposal, I had a question on the warranty."], ["ai", "Sure. Your proposal includes the manufacturer system warranty plus our 10 year workmanship warranty. I have flagged Cody to call you this afternoon with the details."]] },
    { who: "Kelsey Rainey", phone: "(405) 555-0164", ago: "1 hr ago", dur: "4:05", tag: "Insurance claim", kind: "claim", steps: ["Looked up the address", "Pulled radar hail for the storm date", "Started a claim packet", "Booked adjuster meeting"], lines: [["ai", "Thanks for calling {company}, how can I help?"], ["caller", "My insurance adjuster wants to meet with the roofer. Can you be there?"], ["ai", "Yes. I see your claim packet. I can put Marcus on the adjuster meeting Tuesday at 10. Does that work?"]] },
    { who: "Brian Kemp", phone: "(405) 555-0101", ago: "2 hr ago", dur: "1:18", tag: "Leak, urgent", kind: "urgent", steps: ["Marked as urgent", "Texted the on-call crew lead", "Sent tarp instructions"], lines: [["caller", "Water is coming through the ceiling in the hallway."], ["ai", "I am marking this urgent and texting our on-call crew lead now. While you wait, put a bucket under the drip and move anything electrical away."]] },
    { who: "Holly Sutter", phone: "(405) 555-0148", ago: "Yesterday", dur: "2:55", tag: "Inspection booked", kind: "booked", steps: ["Looked up the address", "Checked the crew calendar", "Booked the inspection", "Sent a text confirmation"], lines: [["ai", "Thanks for calling {company}, how can I help?"], ["caller", "I'd like someone to look at my roof, it's about 15 years old."], ["ai", "Happy to help. I have Monday at 1 PM with Alyssa. I'll text you a confirmation."]] },
    { who: "Unknown caller", phone: "(405) 555-0199", ago: "Yesterday", dur: "0:41", tag: "Spam, ended", kind: "spam", steps: ["Screened as a sales call", "Ended politely"], lines: [["caller", "Hi, I'm calling about your business listing..."], ["ai", "Thanks, we are not interested. Have a good day."]] },
    { who: "Travis Odom", phone: "(405) 555-0172", ago: "Yesterday", dur: "3:20", tag: "Estimate sent", kind: "follow", steps: ["Looked up the address", "Measured the roof from imagery", "Drafted the estimate", "Texted the estimate link"], lines: [["caller", "Can I get a ballpark on a new roof?"], ["ai", "I measured your roof from aerial imagery at about 28 squares. A ballpark range is in your texts now, and a rep can confirm it on site."]] }
  ];

  // ---------- agents ----------
  const spark = (base, n = 14) => Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base * (0.55 + R() * 0.9) * (0.75 + i / n * 0.5))));
  const agents = [
    { id: "scout", name: "Storm Scout", icon: "hail", desc: "Reads NOAA radar every morning and maps which homes took hail overnight.", tasks: 214, hours: 41, on: true, spark: spark(15) },
    { id: "estimator", name: "Estimator", icon: "ruler", desc: "Measures roofs from aerial imagery and drafts proposals for your approval.", tasks: 96, hours: 64, on: true, spark: spark(7) },
    { id: "claims", name: "Claims", icon: "file", desc: "Builds insurance claim packets: hail history, photos, measurements.", tasks: 38, hours: 29, on: true, spark: spark(3) },
    { id: "scheduler", name: "Scheduler", icon: "calendar", desc: "Books inspections around crew calendars and the forecast.", tasks: 152, hours: 33, on: true, spark: spark(11) },
    { id: "followups", name: "Follow-ups", icon: "message", desc: "Nudges open proposals and asks happy customers for reviews.", tasks: 187, hours: 22, on: false, spark: spark(13) }
  ];
  const agentDaily = Array.from({ length: 30 }, (_, i) => {
    const d = daysAgo(29 - i);
    const wk = d.getDay() === 0 ? 0.35 : 1;
    return { date: d, v: agents.map(a => Math.round(a.tasks / 30 * wk * (0.5 + R()))) };
  });

  window.SAMPLE = { today, DAY, iso, daysAgo, jobs, proposals, events, tasks, calls, agents, agentDaily, reps };
})();
