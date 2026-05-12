// public/api.js
// Drop this in your frontend: <script src="/api.js"></script>
// All pages call this instead of touching Supabase directly.

// Reads the backend URL from a meta tag so you never hardcode localhost.
// In your HTML: <meta name="api-base" content="https://your-api.railway.app/api">
// Falls back to localhost for local dev.
const metaTag  = document.querySelector('meta[name="api-base"]');
const API_BASE = metaTag?.content || 'http://localhost:3000/api';

let _token = null;

export const api = {
  setToken(token)  { _token = token; },
  clearToken()     { _token = null;  },

  async _fetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    const res  = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  // ── Products ──────────────────────────────────────────────
  products: {
    search:  (q, category, page = 1, limit = 20) =>
      api._fetch(`/products?q=${encodeURIComponent(q||'')}&category=${category||''}&page=${page}&limit=${limit}`),
    get:     (id) => api._fetch(`/products/${id}`),
    related: (id) => api._fetch(`/products/${id}/related`),
  },

  // ── Cart ──────────────────────────────────────────────────
  cart: {
    get:    ()                             => api._fetch('/cart'),
    add:    (product_id, qty, size, color) => api._fetch('/cart', {
      method: 'POST', body: JSON.stringify({ product_id, quantity: qty, size, color }),
    }),
    update: (itemId, quantity) => api._fetch(`/cart/${itemId}`, {
      method: 'PATCH', body: JSON.stringify({ quantity }),
    }),
    remove: (itemId) => api._fetch(`/cart/${itemId}`, { method: 'DELETE' }),
    clear:  ()       => api._fetch('/cart', { method: 'DELETE' }),
  },

  // ── Wishlist ──────────────────────────────────────────────
  wishlist: {
    get:    ()          => api._fetch('/wishlist'),
    add:    (productId) => api._fetch('/wishlist', {
      method: 'POST', body: JSON.stringify({ product_id: productId }),
    }),
    remove: (productId) => api._fetch(`/wishlist/${productId}`, { method: 'DELETE' }),
    check:  (productId) => api._fetch(`/wishlist/check/${productId}`),
  },

  // ── Orders ────────────────────────────────────────────────
  orders: {
    list:           (page = 1, limit = 10) => api._fetch(`/orders?page=${page}&limit=${limit}`),
    cod:            (shipping_address)     => api._fetch('/orders/cod', {
      method: 'POST', body: JSON.stringify({ shipping_address }),
    }),
    createRazorpay: (shipping_address)    => api._fetch('/orders/create-razorpay-order', {
      method: 'POST', body: JSON.stringify({ shipping_address }),
    }),
    verifyPayment:  (payload)             => api._fetch('/orders/verify-payment', {
      method: 'POST', body: JSON.stringify(payload),
    }),
  },

  // ── Account ───────────────────────────────────────────────
  account: {
    profile:       ()       => api._fetch('/account/profile'),
    updateProfile: (data)   => api._fetch('/account/profile', {
      method: 'PATCH', body: JSON.stringify(data),
    }),
    submitReview:  (review) => api._fetch('/account/reviews', {
      method: 'POST', body: JSON.stringify(review),
    }),
  },
};

window.api = api;

// ── Admin: fabric options ─────────────────────────────────────
// api.admin.setFabricOptions(productId, [{ label: "4 meters", extra_price: 0 }, { label: "6 meters", extra_price: 500 }])
if (window.api) {
  window.api.admin = {
    setFabricOptions: (productId, options) =>
      api._fetch(`/products/${productId}/fabric-options`, {
        method: 'PATCH',
        body: JSON.stringify({ fabric_options: options }),
      }),
  };
}
