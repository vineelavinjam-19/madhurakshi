// src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import routes from './routes/index.js';
import { razorpayWebhook } from './controllers/webhook.js';

// ── Startup environment validation ───────────────────────────
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'ALLOWED_ORIGINS',
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\n❌  Missing required environment variables:\n    ${missing.join(', ')}\n`);
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// ── Request logging (dev only) ────────────────────────────────
if (isDev) {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ── Security ─────────────────────────────────────────────────
app.use(helmet());

// Trust Railway / Render / Vercel proxy
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    // Allow requests with no origin (server-to-server, mobile apps)
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
// Global limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Strict limiter for order/payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests, please try again later.' },
});

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
app.use(express.json({ limit: '1mb' }));

// ── API Routes ────────────────────────────────────────────────
app.use('/api', routes);

// Apply strict limiter to payment-sensitive routes
app.use('/api/orders/create-razorpay-order', paymentLimiter);
app.use('/api/orders/verify-payment', paymentLimiter);
app.use('/api/orders/cod', paymentLimiter);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  app: 'Madhurakshi API',
  env: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString(),
}));

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  // CORS errors — don't leak internals
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const status = err.status || err.statusCode || 500;

  // Log 5xx only (4xx are expected user errors)
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.path}:`, err);
  }

  // Never leak stack traces to clients in production
  res.status(status).json({
    error: isDev ? err.message : (status >= 500 ? 'Internal server error' : err.message),
    ...(isDev && status >= 500 && { stack: err.stack }),
  });
});

// ── Graceful shutdown ─────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🟢  Madhurakshi API running on http://localhost:${PORT}`);
  console.log(`    Health:  http://localhost:${PORT}/health`);
  console.log(`    Webhook: POST http://localhost:${PORT}/webhooks/razorpay`);
  console.log(`    Env:     ${process.env.NODE_ENV || 'development'}\n`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
