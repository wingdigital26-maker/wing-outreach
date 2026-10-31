# Onboarding material: progress
Session: onboarding side session, 2026-10-26. Folder: tour/onboarding/ only (plus one entry on tour/audit/changes/index.html).

## Done
- assets/: onboard.css (light theme, print rules), roofers.js (per-roofer config: template + jackson), onboard.js (fills {{tokens}}, header, nav, footer)
- Pages: index, welcome, needs, timeline, kickoff, rep-quickstart, faq, intake (no network, download only), past-customers-template.csv
- make_pdfs.py: PDFs in pdf/jackson and pdf/template (per page + merged packet); screenshots to side-session-notes/local_29875bdc.../onboarding/
- Changes-page entry (Oct 26)

## Open (for Jack)
- No Wing pricing or monthly floor anywhere in roofer-facing material (Jack, 2026-10-26); those fields were removed. Kickoff date (`start`) stays blank until set, then rerun make_pdfs.py.
- WING.contact is generic ("reply to any Wing email"); add a Wing phone/email if wanted.

## Resume step
Nothing pending. To add a roofer: copy the template block in assets/roofers.js, open index.html?roofer=<key>, run `python -E tour/onboarding/make_pdfs.py <key>`.
