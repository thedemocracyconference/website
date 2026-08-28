# Run Locally

This is a plain static site — HTML, CSS, and vanilla JS, no build step, no JS module runtime. Any of the following work:

## Option 1 — Python (already installed on macOS/Linux)

```bash
cd /path/to/this/folder
python3 -m http.server 8000
```

Open http://localhost:8000.

## Option 2 — `npx serve`

```bash
cd /path/to/this/folder
npx serve
```

## Option 3 — open `index.html` directly

Since there's no JS module loader involved anymore, opening `index.html` straight from disk (`file://...`) works for a quick look, though relative links between pages and any fetch-based behavior are more reliable served over HTTP as above.

## Forms don't work under any of the above

Every form on the site POSTs to `/api/submit-form`, a serverless function (see the Forms section of `README.md`). None of the servers above can execute it — `python3 -m http.server` answers that POST with a 501 — so submitting any form locally shows the error message rather than sending. Everything else on the site works normally.

To exercise the forms locally you need a runtime that serves `api/`, e.g. `vercel dev` from this folder, with the same environment variables the production deployment uses.

## A note on caching

`python3 -m http.server` sends no `Cache-Control` headers, so browsers cache the HTML and CSS heuristically and keep serving stale copies after you edit them. If a change doesn't appear, hard-refresh (**Cmd+Shift+R**) rather than assuming the edit failed — a normal reload will not do it, and a `?v=1`-style query string only creates a separate cache entry instead of clearing the stale one.

## Deploying to production

**Vercel, or another host that runs `api/`.** The site is otherwise plain static files, but `api/submit-form.js` is a Vercel-convention serverless function that every form on the site depends on:

- **Vercel** — `vercel` from this folder. Set `SENDER_API_KEY`, `SENDER_FROM_EMAIL`, and `CONTACT_NOTIFY_EMAIL` in the project settings, or the forms return 500.
- **Static-only hosts** (Netlify Drop, GitHub Pages, S3+CloudFront, plain nginx) will serve the pages correctly but 404 on `/api/submit-form`, breaking every form. Use one only if you first move form handling somewhere else.

## Forms

All of them — the hero newsletter signup, the "Send us a message" contact form, and the Join Us / Salon / Register / Apply / Propose / Partner modals — are intercepted by `wireBackendForm` in `assets/custom/sticky-nav.js` and posted to `/api/submit-form`, which emails a notification to `CONTACT_NOTIFY_EMAIL` and adds the person as a Sender.net subscriber. The `action` attributes left in the markup are vestigial and never used. See `README.md` for the full variable list and a curl check for a live deployment.
