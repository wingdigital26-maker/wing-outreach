/* Per-roofer config for the onboarding pages. The pages never name a roofer: every roofer detail comes from here.
   Pick one with ?roofer=<key> (e.g. ?roofer=jackson). No key, or an unknown key, shows the blank template.
   To add a roofer: copy the "template" block, give it a new key, fill it in, then open any page with ?roofer=<key>.
   Fields:
     name, short       company name as it should appear, and a short form for tight spots
     owner             first name of the owner we work with (private handouts only, never public pages)
     phone, email, website   the roofer's own business contact
     city, state, area, counties   home city, two-letter state, service cities, counties
     accent, soft, ink, plate      brand colour (white text on it >= 4.5:1), light tint, dark text colour, logo plate colour
     logo              path to the logo file relative to tour/onboarding/ (null = dashed placeholder)
     tz, callHours, textHours      time zone label, the legal outreach window, the default texting window we propose
     licence           how the licence line reads for this state
     noCall            the state do-not-call list the roofer subscribes to
     deductibleLaw     the state law behind "no deductible promises"
     start             kickoff date (blank = "Day 0")                                                              */
window.WING = {
  name: 'Wing Digital',
  team: [
    { who: 'Grant', role: 'Your main contact. Email, weekly report, scheduling.' },
    { who: 'Maddox', role: 'Calls. Works the Daily 50 phone list with your team.' },
    { who: 'Jack', role: 'System and SEO. Builds your data, storm alerts and website work.' }
  ],
  contact: 'Reply to any Wing email or text the number on your kickoff email.'
};

window.ONBOARD_ROOFERS = {
  template: {
    name: 'Your Roofing Company', short: 'your company', owner: '',
    phone: '(___) ___-____', email: '__________', website: 'your website',
    city: 'Your city', state: '__', area: 'your service cities', counties: 'your counties',
    accent: '#334155', soft: '#EEF1F5', ink: '#1E293B', plate: '#ffffff', logo: null,
    tz: 'local time',
    callHours: '8 am to 8 pm local time, max 3 calls per home per day (your state may be stricter)',
    textHours: '9 am to 7 pm, Monday to Saturday',
    licence: 'Your state licence or registration number goes on every message where the law asks for it.',
    noCall: 'your state do-not-call list (if your state has one) plus the national list',
    deductibleLaw: 'state law',
    start: ''
  },

  // Jackson Roofing, Plano TX. Colours match tour/lib/brand.js (white on #0D6C99 is 5.8:1). Logo sits on its black plate.
  // Texas: no state roofing licence; calls 9 am to 8 pm Mon to Sat, noon to 8 pm Sunday (Bus. & Com. Code 301.051, our 8 pm cap).
  // No prices in roofer-facing material (Jack, 2026-10-26). Kickoff date stays blank until set.
  jackson: {
    name: 'Jackson Roofing', short: 'Jackson', owner: 'Chris',
    phone: '(469) 323-4626', email: 'admin@jacksonroofingco.us', website: 'jacksonroofingco.com',
    city: 'Plano', state: 'TX', area: 'Plano, Frisco, Allen, McKinney, Richardson and Rockwall', counties: 'Collin County (plus parts of Dallas and Rockwall counties)',
    accent: '#0D6C99', soft: '#E3F6FE', ink: '#07547A', plate: '#000000', logo: '../img/roofers/jackson/logo.webp',
    tz: 'Central time',
    callHours: '9 am to 8 pm Monday to Saturday, noon to 8 pm Sunday, Central, max 3 calls per home per day',
    textHours: '9 am to 7 pm Monday to Saturday, noon to 6 pm Sunday, Central',
    licence: 'Texas has no state roofing licence. We use your legal business name and phone on every message, and record your city registrations (Plano, Allen, Frisco, McKinney) for permits.',
    noCall: 'the Texas no-call list (texasnocall.com, in your name) plus the national list',
    deductibleLaw: 'Texas law (Bus. & Com. Code 27.02, Ins. Code 707.002)',
    start: ''
  }
};
