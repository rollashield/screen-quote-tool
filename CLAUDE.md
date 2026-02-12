# Screen Quote Tool

## Overview
Web application for generating custom rolling screen quotes with email integration and cloud database storage. Used by Roll-A-Shield sales reps to create quotes for customers.

## Architecture
- **Frontend**: Vanilla HTML/CSS/JavaScript (NO build tools, NO framework)
  - `index.html` - Quote generation UI (main page)
  - `finalize.html` - Final measurements and production order form
  - `styles.css` - Shared styles
  - `app.js` - Core application logic (~1,760 lines)
  - `pricing-data.js` - Pricing tables and product constants
  - `email-templates.js` - Email HTML template generation
- **Backend**: Cloudflare Worker (`cloudflare-worker.js`)
  - Deployed as `rollashield-quote-worker`
  - Secrets managed via `wrangler secret put` (never in code)
- **Database**: Cloudflare D1 (`rollashield_quotes`, schema in `d1-schema.sql`)
- **Hosting**: GitHub Pages (frontend), Cloudflare (worker)

## Key Endpoints (Cloudflare Worker)
- POST /api/send-email - Send quote/production email via Resend
- POST /api/save-quote - Save quote to D1
- GET /api/quotes - List all quotes
- GET /api/quote/:id - Get specific quote

## Development
- No build step. Open HTML files directly or use a local server.
- Worker dev: `wrangler dev` (starts local worker on port 8787)
- When testing locally, update WORKER_URL in HTML files to http://localhost:8787

## Deployment
- Frontend: Push to `main` -> GitHub Pages deploys automatically
- Backend: `wrangler deploy` from this directory
- Secrets: `wrangler secret put RESEND_API_KEY`

## Important Notes
- This is a vanilla JS project. Do NOT suggest adding npm, webpack, React, or any framework.
- All pricing logic is in `pricing-data.js`. If pricing changes, update ONLY that file.
- The D1 database ID is in `wrangler.toml`. This is a Cloudflare resource identifier, not a secret.
