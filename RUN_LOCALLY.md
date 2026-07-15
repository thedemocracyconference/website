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

## Deploying to production

Any static host works — no special server config needed:

- **Netlify** — drag & drop this folder onto [app.netlify.com/drop](https://app.netlify.com/drop)
- **Vercel** — `vercel` from this folder
- **Cloudflare Pages / GitHub Pages / S3+CloudFront / your own server** — upload the folder as-is

## Forms

- The Join Us modal's form posts to a working Framer Forms endpoint — submissions work with no extra setup.
- The hero and footer email-capture forms still need a real backend (Formspree, your own endpoint, etc.) wired up to their `action` attribute — see the HTML comments near those forms.
