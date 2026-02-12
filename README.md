# Roll-A-Shield Screen Quote Tool

A web application for generating custom rolling screen quotes with email integration and production order management.

## Features

### Quote Generation (index.html)
- Multi-screen order support
- Real-time pricing calculations
- Discount management
- Customer information collection
- PDF export functionality
- Email quotes to customers
- Local quote storage

### Project Finalization (finalize.html)
- Final measurement collection (3-point width/height)
- Operator configuration (gear, motor, cable, RTS, solar)
- Installation requirement tracking
- Production order email generation
- Auto-adjusting hem bar brush size based on slope

### Backend (Cloudflare Worker)
- Secure email sending via Resend API
- Cloud quote storage in D1 database
- CORS-compliant API endpoints

## Project Structure

```
screen-quote-tool/
├── index.html            # Quote generation (HTML + page-specific CSS)
├── finalize.html         # Finalization and measurements
├── styles.css            # Shared CSS
├── pricing-data.js       # Pricing tables and constants
├── app.js                # Core application logic
├── email-templates.js    # Customer quote email generation
├── cloudflare-worker.js  # Backend API (Cloudflare Worker)
├── wrangler.toml         # Worker configuration
├── d1-schema.sql         # Database schema
├── .gitignore
└── README.md
```

## Technology Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript (no build tools)
- **Backend:** Cloudflare Workers (serverless)
- **Database:** Cloudflare D1 (SQL)
- **Email:** Resend API
- **Hosting:** GitHub Pages (frontend), Cloudflare (backend)

## Deployment

### Worker (already deployed)
The Cloudflare Worker is deployed at `rollashield-quote-worker.derek-44b.workers.dev`.

To redeploy after changes:
```bash
wrangler deploy
```

### Secrets
Set via Cloudflare (never commit API keys):
```bash
wrangler secret put RESEND_API_KEY
```

### Frontend
Push to `main` branch — GitHub Pages deploys automatically.

## Email Functionality

### Customer Quote Email
- Sent from: `Roll-A-Shield Quotes <onboarding@resend.dev>`
- Sent to: Customer email
- CC: derek@rollashield.com
- Contains: Quote summary, pricing, screen details

### Production Order Email
- Sent from: `Roll-A-Shield Production <onboarding@resend.dev>`
- Sent to: derek@rollashield.com
- Contains: Final measurements, installation details, operator configuration

## API Endpoints (Cloudflare Worker)

- `POST /api/send-email` — Send email via Resend
- `POST /api/save-quote` — Save quote to D1
- `GET /api/quotes` — List all quotes
- `GET /api/quote/:id` — Get specific quote

## Local Development

```bash
# Start local Worker
wrangler dev

# Update WORKER_URL in index.html and finalize.html to:
# const WORKER_URL = 'http://localhost:8787';
```

## Troubleshooting

### Email Not Sending
1. Check Worker is deployed: `wrangler deployments list`
2. Verify API key is set: `wrangler secret list`
3. Check Worker logs: `wrangler tail`
4. Verify `WORKER_URL` is correct in HTML files

### CORS Errors
- Make sure you're calling the Worker, not Resend directly
- Check browser console for the specific error
- Verify Worker is returning proper CORS headers

### Database Errors
- Verify D1 binding name is `DB` in `wrangler.toml`
- Check database exists: `wrangler d1 list`
- Verify schema: `wrangler d1 execute rollashield_quotes --command="SELECT * FROM quotes"`

## License

Internal use for Roll-A-Shield only.
