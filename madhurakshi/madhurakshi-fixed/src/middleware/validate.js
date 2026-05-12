// src/middleware/validate.js
import { z } from 'zod';

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', errors });
    }
    req.body = result.data;
    next();
  };
}

// Validate query params (for GET routes with complex params)
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Invalid query parameters', errors });
    }
    req.query = result.data;
    next();
  };
}

export const schemas = {
  // Cart — includes optional fabric_option
  addToCart: z.object({
    product_id:    z.string().uuid('product_id must be a valid UUID'),
    quantity:      z.number().int().min(1).max(100).default(1),
    size:          z.string().max(20).nullable().default(null),
    color:         z.string().max(30).nullable().default(null),
    fabric_option: z.string().max(50).nullable().default(null),
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
      pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
      phone:   z.string().regex(/^\+?[\d\s\-]{7,15}$/, 'Invalid phone number'),
    }),
    coupon_code: z.string().max(30).optional(),
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

  // Admin: create a new product — all required fields explicit, unknown keys stripped
  createProduct: z.object({
    name:           z.string().min(2).max(200),
    price:          z.number().positive(),
    description:    z.string().max(5000).optional(),
    stock:          z.number().int().min(0).default(0),
    category_id:    z.string().uuid().optional().nullable(),
    images:         z.array(z.string().url()).max(10).default([]),
    fabric_options: z.array(z.object({
      label:       z.string().min(1).max(50),
      extra_price: z.number().min(0),
    })).max(20).default([]),
    is_featured:    z.boolean().default(false),
    is_new_arrival: z.boolean().default(false),
    slug:           z.string().max(250).optional(),
  }),

  // Admin: update an existing product — all fields optional (PATCH semantics), unknown keys stripped
  updateProduct: z.object({
    name:           z.string().min(2).max(200).optional(),
    price:          z.number().positive().optional(),
    description:    z.string().max(5000).optional(),
    stock:          z.number().int().min(0).optional(),
    category_id:    z.string().uuid().nullable().optional(),
    images:         z.array(z.string().url()).max(10).optional(),
    fabric_options: z.array(z.object({
      label:       z.string().min(1).max(50),
      extra_price: z.number().min(0),
    })).max(20).optional(),
    is_featured:    z.boolean().optional(),
    is_new_arrival: z.boolean().optional(),
    slug:           z.string().max(250).optional(),
  }).refine(obj => Object.keys(obj).length > 0, {
    message: 'Request body must contain at least one field to update',
  }),

    // Product search query params
  productSearch: z.object({
    q:            z.string().max(100).optional(),
    category:     z.string().max(100).optional(),
    page:         z.coerce.number().int().min(1).default(1),
    limit:        z.coerce.number().int().min(1).max(100).default(20),
    featured:     z.enum(['true', 'false']).optional(),
    new_arrivals: z.enum(['true', 'false']).optional(),
    min_price:    z.coerce.number().min(0).optional(),
    max_price:    z.coerce.number().min(0).optional(),
  }),
};
