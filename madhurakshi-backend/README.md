# Madhurakshi Backend

Node.js + Express + Supabase + Razorpay e-commerce API.

## Stack
- **Runtime**: Node.js 20+ (ESM)
- **Framework**: Express 4
- **Database / Auth**: Supabase (PostgreSQL + Supabase Auth)
- **Payments**: Razorpay (online + COD)
- **Validation**: Zod

## Quick start

```bash
cp .env.example .env   # fill in your keys
npm install
npm run dev
```

## Environment variables

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
ALLOWED_ORIGINS=http://localhost:5500,https://yoursite.com
PORT=3000
```

## Database setup

Run the migration in Supabase SQL Editor:

```
supabase/migrations/001_stock_and_reviews.sql
```

This adds:
- `decrement_stock(items JSONB)` — atomic stock deduction
- `has_purchased(user_id, product_id)` — review gating
- Unique constraint on `reviews(user_id, product_id)`

## Razorpay webhook

In Razorpay Dashboard → Webhooks, add:

```
URL: https://your-api.railway.app/webhooks/razorpay
Events: payment.captured
```

Copy the webhook secret to `RAZORPAY_WEBHOOK_SECRET`.

## API reference

### Products (public)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products?q=&category=&page=&limit=` | Search / list |
| GET | `/api/products/:id` | Single product + reviews |
| GET | `/api/products/:id/related` | Related products |

### Cart (auth required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cart` | Get cart |
| POST | `/api/cart` | Add item |
| PATCH | `/api/cart/:itemId` | Update quantity |
| DELETE | `/api/cart/:itemId` | Remove item |
| DELETE | `/api/cart` | Clear cart |

### Wishlist (auth required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wishlist` | Get wishlist |
| POST | `/api/wishlist` | Add to wishlist |
| DELETE | `/api/wishlist/:productId` | Remove |
| GET | `/api/wishlist/check/:productId` | Is wishlisted? |

### Orders (auth required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders?page=&limit=` | Order history |
| POST | `/api/orders/cod` | Place COD order |
| POST | `/api/orders/create-razorpay-order` | Init Razorpay |
| POST | `/api/orders/verify-payment` | Confirm payment |

### Account (auth required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/account/profile` | Get profile |
| PATCH | `/api/account/profile` | Update profile |
| POST | `/api/account/reviews` | Submit review (purchased items only) |

### Webhook (server-to-server)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/razorpay` | Razorpay payment events |

## Frontend usage

```html
<meta name="api-base" content="https://your-api.railway.app/api">
<script src="/api.js"></script>
<script>
  // After Supabase login:
  api.setToken(session.access_token);

  // Add to cart
  await api.cart.add(productId, 1, 'M', 'Red');

  // Place COD order
  await api.orders.cod({ name: 'Priya', line1: '12 MG Road', city: 'Bengaluru',
                          state: 'Karnataka', pincode: '560001', phone: '9876543210' });
</script>
```
