// src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import routes from './routes/index.js';
import { razorpayWebhook } from './controllers/webhook.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security ─────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()),
  credentials: true,
}));

// Rate limit — 100 requests per 15 min per IP
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ── Webhook route (raw body MUST come before express.json()) ─
// Razorpay signature verification requires the raw request bytes.
app.post(
  '/webhooks/razorpay',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    // Attach raw body string for HMAC verification in the controller
    req.rawBody = req.body.toString('utf8');
    req.body    = JSON.parse(req.rawBody);
    next();
  },
  razorpayWebhook
);

// ── Body parsing (all other routes) ──────────────────────────
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'Madhurakshi API' }));

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🟢  Madhurakshi API running on http://localhost:${PORT}`);
  console.log(`    Health: http://localhost:${PORT}/health`);
  console.log(`    Webhook: POST http://localhost:${PORT}/webhooks/razorpay\n`);
});
