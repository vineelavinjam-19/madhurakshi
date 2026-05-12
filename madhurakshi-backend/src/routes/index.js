// src/routes/index.js
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

import { searchProducts, getProduct, getRelatedProducts, updateFabricOptions } from '../controllers/products.js';
import { getCart, addToCart, updateCartItem, removeFromCart, clearCart } from '../controllers/cart.js';
import { getWishlist, addToWishlist, removeFromWishlist, checkWishlist } from '../controllers/wishlist.js';
import { createRazorpayOrder, verifyPayment, placeCodOrder, getOrders } from '../controllers/orders.js';
import { getProfile, updateProfile, submitReview } from '../controllers/account.js';

const router = Router();

// ── Products (public) ─────────────────────────────────────────
router.get('/products',             searchProducts);
router.get('/products/:id',         getProduct);
router.get('/products/:id/related', getRelatedProducts);

// ── Fabric options (admin only) ───────────────────────────────
// PATCH /api/products/:id/fabric-options
// Body: { fabric_options: [{ label: "4 meters", extra_price: 0 }, { label: "6 meters", extra_price: 500 }] }
router.patch('/products/:id/fabric-options', requireAuth, requireAdmin, updateFabricOptions);

// ── Cart ──────────────────────────────────────────────────────
router.get   ('/cart',         requireAuth,                               getCart);
router.post  ('/cart',         requireAuth, validate(schemas.addToCart),  addToCart);
router.patch ('/cart/:itemId', requireAuth, validate(schemas.updateCartItem), updateCartItem);
router.delete('/cart/:itemId', requireAuth,                               removeFromCart);
router.delete('/cart',         requireAuth,                               clearCart);

// ── Wishlist ──────────────────────────────────────────────────
router.get   ('/wishlist',                  requireAuth,                          getWishlist);
router.post  ('/wishlist',                  requireAuth, validate(schemas.addToWishlist), addToWishlist);
router.delete('/wishlist/:productId',       requireAuth,                          removeFromWishlist);
router.get   ('/wishlist/check/:productId', requireAuth,                          checkWishlist);

// ── Orders ────────────────────────────────────────────────────
router.get ('/orders',                       requireAuth,                              getOrders);
router.post('/orders/cod',                   requireAuth, validate(schemas.createOrder), placeCodOrder);
router.post('/orders/create-razorpay-order', requireAuth, validate(schemas.createOrder), createRazorpayOrder);
router.post('/orders/verify-payment',        requireAuth, validate(schemas.verifyPayment), verifyPayment);

// ── Account ───────────────────────────────────────────────────
router.get  ('/account/profile', requireAuth,                                  getProfile);
router.patch('/account/profile', requireAuth, validate(schemas.updateProfile), updateProfile);
router.post ('/account/reviews', requireAuth, validate(schemas.submitReview),  submitReview);

export default router;
