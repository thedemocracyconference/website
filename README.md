# DemCon 2027 Website

Plain static HTML/CSS/JS — no framework, no build step, no JS module runtime. Originally exported from Framer, then converted to hand-maintained static files (see Notes).

## How to View

Any static file server works. From this folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

or `npx serve`. Form submissions won't work this way — they need the serverless function under `api/`, which a plain file server can't run. Everything else on the site does.

## Structure

- `index.html`, `about/index.html` — the two pages
- `assets/custom/sticky-nav.js`, `assets/custom/sticky-nav.css` — all interactive behavior: sticky/adaptive-color header, scroll-spy nav, scroll-stacking sections, hover and cursor effects, scroll reveals, the host-bio / Join Us / Salon / Register / Apply / Propose / Partner modals, the footer's "Get Involved" links, and every form's submit handling
- `api/submit-form.js` — serverless function receiving every form submission (see Forms)
- `assets/framer/` — images, fonts, and other static media kept from the original Framer export; no runtime code remains here

## Forms

Every form on the site — the hero newsletter signup, the "Send us a message" contact form, and the Join Us / Salon / Register / Apply / Propose / Partner modals — is intercepted by `wireBackendForm` in `sticky-nav.js` and POSTed as JSON to `/api/submit-form`. The `action` attributes still sitting in the markup (including a Framer Forms URL) are vestigial and never used.

`api/submit-form.js` relays each submission through Sender.net two ways:

1. a transactional notification email to `CONTACT_NOTIFY_EMAIL` — the part submissions actually depend on arriving, and
2. a best-effort subscriber signup, tagged by which form it came from.

Required environment variables, set in the host's project settings rather than in this repo:

| Variable | Purpose |
| --- | --- |
| `SENDER_API_KEY` | Sender.net API access token |
| `SENDER_FROM_EMAIL` | A sending address verified in Sender |
| `CONTACT_NOTIFY_EMAIL` | Where notification emails land |
| `SENDER_FROM_NAME` | Optional; defaults to "DemCon Website" |
| `SENDER_GROUP_*` | Optional Sender group ID per form type — see `FORM_CONFIGS` in the handler |

With any of the first three missing, the endpoint returns 500 and visitors see an error pointing them at info@thedemcon.org. To check a live deployment end to end:

```bash
curl -s -X POST 'https://thedemcon.org/api/submit-form?debug=1' -H 'Content-Type: application/json' -d '{"formType":"newsletter","fields":{"Email":"you@thedemcon.org"}}'
```

`{"ok":true}` means the notification sent; anything else names the cause. `?debug=1` surfaces Sender's own rejection reason and is never used by the site's own forms.

## Deployment

`api/submit-form.js` follows Vercel's serverless-function convention, so **Vercel — or another host that runs `api/` — is required**. On a purely static host (Netlify Drop, GitHub Pages, S3+CloudFront) `/api/submit-form` 404s and every form on the site breaks, silently from the visitor's side apart from the error message. Everything else is plain static files needing no special headers, CORS config, or build step.

## Notes

- This is no longer a Framer export — edits happen directly in these files. Changes made in Framer Studio will not flow into this site automatically.
- `sticky-nav.css` and `sticky-nav.js` are loaded with a `?v=` cache-buster in both pages. Bump it when you change either, or returning visitors keep the old copy. The HTML itself has no cache-buster, so page-content edits reach returning visitors only once the host's cache expires.
