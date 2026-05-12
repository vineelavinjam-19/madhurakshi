// src/middleware/validate.js
import { z } from 'zod';

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', errors });
    }
    req.body = result.data;
    next();
  };
}

export const schemas = {
  // Cart — now includes optional fabric_option
  addToCart: z.object({
    product_id:    z.string().uuid('product_id must be a valid UUID'),
    quantity:      z.number().int().min(1).max(100).default(1),
    size:          z.string().max(20).nullable().default(null),
    color:         z.string().max(30).nullable().default(null),
    fabric_option: z.string().max(50).nullable().default(null), // e.g. "6 meters"
  }),

  updateCartItem: z.object({
    quantity: z.number().int().min(0).max(100),
  }),

  addToWishlist: z.object({
    product_id: z.string().uuid('product_id must be a valid UUID'),
  }),

  createOrder: z.object({
    shipping_address: z.object({
      name:    z.string().min(2).max(100),
      line1:   z.string().min(5).max(200),
      line2:   z.string().max(200).optional(),
      city:    z.string().min(2).max(100),
      state:   z.string().min(2).max(100),
      pincode: z.string().regex(/^\d{6}$/, 'pincode must be a 6-digit number'),
      phone:   z.string().regex(/^\+?[\d\s\-]{7,15}$/, 'invalid phone number'),
    }),
  }),

  verifyPayment: z.object({
    razorpay_order_id:   z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature:  z.string().min(1),
    order_id:            z.string().uuid(),
  }),

  updateProfile: z.object({
    full_name: z.string().min(2).max(100).optional(),
    phone:     z.string().regex(/^\+?[\d\s\-]{7,15}$/).optional(),
  }),

  submitReview: z.object({
    product_id: z.string().uuid('product_id must be a valid UUID'),
    rating:     z.number().int().min(1).max(5),
    title:      z.string().max(120).optional(),
    body:       z.string().min(10).max(2000),
  }),
};
