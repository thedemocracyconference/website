# DemCon 2027 Website

Plain static HTML/CSS/JS — no framework, no build step, no JS runtime dependency. Originally exported from Framer, then converted to hand-maintained static files (see below).

## How to View

Any static file server works. From this folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

or `npx serve`, or open `index.html` directly in a browser — no build step or module loader required.

## Structure

- `index.html`, `contact/index.html` — the two pages
- `assets/custom/sticky-nav.js`, `assets/custom/sticky-nav.css` — all interactive behavior (sticky/adaptive-color header, scroll-spy nav, hover effects, Join Us modal, hero fade-in, scroll reveal)
- `assets/framer/` — images, fonts, and other static media (kept from the original Framer export; no runtime code remains here)

## Deployment

Deploy to any static host — Netlify, Vercel, Cloudflare Pages, GitHub Pages, or your own server. No special headers, CORS config, or HTTPS requirement beyond what any static site needs.

## Notes

- Forms (hero/footer email capture) still need a real backend configured — see the HTML comments near those form elements. The Join Us modal's form already posts to a working Framer Forms endpoint.
- This is no longer a Framer export — edits happen directly in these files. Changes made in Framer Studio will not flow into this site automatically.
