// public/api.js
// public/api.js — Madhurakshi frontend API client
// Usage: <script type="module" src="/api.js"></script>
//
// Set base URL via meta tag in your HTML:
//   <meta name="api-base" content="https://your-api.railway.app/api">
// Falls back to localhost for local dev.

const metaTag  = document.querySelector('meta[name="api-base"]');
const API_BASE = metaTag?.content?.replace(/\/$/, '') || 'http://localhost:3000/api';

let _token = null;

export const api = {
  setToken(token)  { _token = token; },
  clearToken()     { _token = null;  },
  hasToken()       { return !!_token; },

  async _fetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch (networkErr) {
      throw new Error('Network error — check your connection');
    }

    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), {
      status: res.status,
      errors: data.errors,
    });
    return data;
  },

  // ── Products ──────────────────────────────────────────────
  products: {
    // params: { q, category, page, limit, featured, new_arrivals, min_price, max_price }
    search: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v != null && q.set(k, v));
      return api._fetch(`/products?${q}`);
    },
    get:     (id) => api._fetch(`/products/${id}`),
    related: (id) => api._fetch(`/products/${id}/related`),
  },

  // ── Cart ──────────────────────────────────────────────────
  cart: {
    get:    () => api._fetch('/cart'),
    add:    (product_id, qty = 1, size = null, color = null, fabric_option = null) =>
      api._fetch('/cart', {
        method: 'POST',
        body: JSON.stringify({ product_id, quantity: qty, size, color, fabric_option }),
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
    get:            (orderId)              => api._fetch(`/orders/${orderId}`),
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

  // ── Admin ─────────────────────────────────────────────────
  admin: {
    createProduct:    (data)                => api._fetch('/products', {
      method: 'POST', body: JSON.stringify(data),
    }),
    updateProduct:    (productId, data)     => api._fetch(`/products/${productId}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
    deleteProduct:    (productId)           => api._fetch(`/products/${productId}`, { method: 'DELETE' }),
    setFabricOptions: (productId, options)  => api._fetch(`/products/${productId}/fabric-options`, {
      method: 'PATCH', body: JSON.stringify({ fabric_options: options }),
    }),
  },
};

// Make available globally for non-module scripts
window.api = api;

