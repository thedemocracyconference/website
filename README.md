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
| `MAILERLITE_API_KEY` | Optional; The Parlor Magazine's list is on MailerLite, so its opt-in is a second provider |
| `MAILERLITE_GROUP_PARLOR` | Optional; the MailerLite group id that newsletter lives in |
| `SALON_JOIN_URL` | Optional; the current salon's Zoom link, sent in the registration confirmation |

### Which lists a salon registrant lands on

The note beside the checkbox on the salons page states the rule, and the handler implements it:

| | Provider | List |
| --- | --- | --- |
| Registering for a salon | Sender | `SENDER_GROUP_SALON` **and** `SENDER_GROUP_NEWSLETTER` (DemCon's), automatically |
| Ticking the opt-in as well | MailerLite | the group in `MAILERLITE_GROUP_PARLOR` (The Parlor Magazine's) |

The two halves sit with different providers: everything DemCon runs on Sender, while The Parlor Magazine's newsletter is on MailerLite, so the opt-in is a second call to `POST https://connect.mailerlite.com/api/subscribers` rather than another group on the Sender subscriber. That endpoint upserts — 201 for a new subscriber, 200 for one already known — so a repeat registration is not an error. Whether the subscriber is then asked to confirm is MailerLite's own double opt-in setting, which is account-level and deliberately not overridden here.

The opt-in is honoured only on the salon forms (`salon`, `register`), because those are the ones whose wording promises it — the same checkbox on another form means whatever that form's own copy says it means.

Every one of these variables is optional and fails soft. No `MAILERLITE_API_KEY` and the tick is recorded in the notification email but subscribes nobody (the handler logs a warning); no `MAILERLITE_GROUP_PARLOR` and the subscriber is created but filed into no group; and if MailerLite is down, the registration still succeeds — a list that did not take a subscriber is not a reason to tell someone their registration failed.

### The salon registration confirmation

A submission from the salons page (`formType` `salon` or `register`) also sends the registrant their own confirmation: what they signed up for, when, and how to join.

Its facts come from `assets/salons/salon.json`, which is the same file the salons page fills its hero from — so changing the salon means editing that one file, and the page and the email cannot drift apart. The values also sit in the page's markup as the fallback a reader sees if the fetch fails.

The Zoom link is **not** in that file. `salon.json` is served to anyone who visits the site, and a Zoom link carrying a `pwd` token is a key to the room, so it lives in `SALON_JOIN_URL` and is read only when the email is built. Leave it unset and registrants still get their confirmation, with the joining line omitted rather than empty (the handler logs a warning).

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
