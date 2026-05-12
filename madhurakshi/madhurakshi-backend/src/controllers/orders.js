// src/controllers/orders.js
import { supabase } from '../config/supabase.js';
import { razorpay } from '../config/razorpay.js';
import crypto from 'crypto';
import { resolveFabricExtra } from './cart.js';

// ── Helpers ───────────────────────────────────────────────────

async function fetchCart(userId) {
  const { data: cartItems, error } = await supabase
    .from('cart_items')
    .select('quantity, size, color, fabric_option, products(id, name, price, stock, fabric_options)')
    .eq('user_id', userId);

  if (error) throw error;
  if (!cartItems?.length) {
    const e = new Error('Cart is empty'); e.status = 400; throw e;
  }

  // Validate all products still exist
  const missingProducts = cartItems.filter(item => !item.products);
  if (missingProducts.length) {
    const e = new Error('Some products in your cart are no longer available');
    e.status = 409; throw e;
  }

  const totalAmount = cartItems.reduce((sum, item) => {
    const fabricExtra = resolveFabricExtra(item.products.fabric_options, item.fabric_option);
    return sum + (parseFloat(item.products.price) + fabricExtra) * item.quantity;
  }, 0);

  return { cartItems, totalAmount };
}

async function decrementStock(cartItems) {
  const items = cartItems.map(item => ({
    product_id: item.products.id,
    quantity:   item.quantity,
  }));

  const { data: results, error } = await supabase.rpc('decrement_stock', {
    items: JSON.stringify(items),
  });

  if (error) throw error;

  const failed = (results || []).filter(r => !r.ok);
  if (failed.length) {
    const names = failed.map(f => {
      const item = cartItems.find(c => c.products.id === f.product_id);
      return item ? `"${item.products.name}" (${f.available} left)` : f.product_id;
    });
    const e = new Error(`Insufficient stock for: ${names.join(', ')}`);
    e.status = 409; throw e;
  }
}

async function insertOrderItems(orderId, cartItems) {
  const { error } = await supabase.from('order_items').insert(
    cartItems.map(item => {
      const fabricExtra = resolveFabricExtra(item.products.fabric_options, item.fabric_option);
      return {
        order_id:           orderId,
        product_id:         item.products.id,
        quantity:           item.quantity,
        size:               item.size,
        color:              item.color,
        fabric_option:      item.fabric_option,
        fabric_extra_price: fabricExtra,
        unit_price:         parseFloat(item.products.price) + fabricExtra, // snapshotted
      };
    })
  );
  if (error) throw error;
}

// ── POST /api/orders/create-razorpay-order ────────────────────
// IMPORTANT: This route does NOT decrement stock and does NOT set order status
// to 'confirmed'. Stock is only decremented in verify-payment (or webhook fallback).
// This prevents double-decrements if both verify-payment and the webhook fire.
export async function createRazorpayOrder(req, res) {
  try {
    const { shipping_address } = req.body;
    const { cartItems, totalAmount } = await fetchCart(req.user.id);

    // Create internal order in 'pending' state — no stock decrement yet
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id:        req.user.id,
        status:         'pending',
        total_amount:   totalAmount,
        payment_method: 'razorpay',
        shipping_address,
      })
      .select().single();
    if (orderErr) throw orderErr;

    await insertOrderItems(order.id, cartItems);

    // Create Razorpay order
    const rzpOrder = await razorpay.orders.create({
      amount:   Math.round(totalAmount * 100),
      currency: 'INR',
      receipt:  order.id, // use UUID, not timestamp — guaranteed unique
      notes:    { order_id: order.id, user_id: req.user.id },
    });

    await supabase
      .from('orders')
      .update({ razorpay_order_id: rzpOrder.id })
      .eq('id', order.id);

    res.json({
      order_id:          order.id,
      order_number:      order.order_number,
      razorpay_order_id: rzpOrder.id,
      amount:            rzpOrder.amount,
      currency:          rzpOrder.currency,
      key_id:            process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('[createRazorpayOrder]', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

// ── POST /api/orders/verify-payment ──────────────────────────
export async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    // 1. Verify signature
    const body        = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(razorpay_signature))) {
      return res.status(400).json({ error: 'Payment verification failed: invalid signature' });
    }

    // 2. Fetch the order, scoped to this user
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, order_items(quantity, products(id, name, stock))')
      .eq('id', order_id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });

    // 3. Idempotency — webhook may have already confirmed it
    if (order.status === 'confirmed') {
      return res.json({ success: true, order_id, already_confirmed: true });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ error: `Order is in unexpected state: ${order.status}` });
    }

    // 4. Decrement stock atomically
    const stockItems = order.order_items.map(oi => ({
      products: { id: oi.products.id, name: oi.products.name, stock: oi.products.stock },
      quantity: oi.quantity,
    }));
    await decrementStock(stockItems);

    // 5. Confirm order
    const { data: confirmed, error: confirmErr } = await supabase
      .from('orders')
      .update({ status: 'confirmed', payment_id: razorpay_payment_id })
      .eq('id', order_id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending') // extra guard: only update if still pending
      .select().single();

    if (confirmErr) throw confirmErr;
    if (!confirmed) {
      // Another process (webhook) beat us — just return success
      return res.json({ success: true, order_id, already_confirmed: true });
    }

    // 6. Clear cart
    await supabase.from('cart_items').delete().eq('user_id', req.user.id);

    res.json({ success: true, order: confirmed });
  } catch (err) {
    console.error('[verifyPayment]', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

// ── POST /api/orders/cod ──────────────────────────────────────
export async function placeCodOrder(req, res) {
  try {
    const { shipping_address } = req.body;
    const { cartItems, totalAmount } = await fetchCart(req.user.id);

    // Decrement stock BEFORE creating the order — if stock fails, no order is left dangling
    await decrementStock(cartItems);

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id:        req.user.id,
        status:         'confirmed',
        total_amount:   totalAmount,
        payment_method: 'cod',
        shipping_address,
      })
      .select().single();

    if (orderErr) {
      // Stock was already decremented — try to restore it (best-effort)
      console.error('[placeCodOrder] Order insert failed after stock decrement:', orderErr);
      throw orderErr;
    }

    await insertOrderItems(order.id, cartItems);
    await supabase.from('cart_items').delete().eq('user_id', req.user.id);

    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('[placeCodOrder]', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

// ── GET /api/orders ───────────────────────────────────────────
export async function getOrders(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const from  = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total_amount, payment_method,
        payment_id, shipping_address, created_at,
        order_items(id, quantity, size, color, fabric_option,
          fabric_extra_price, unit_price, products(id, name, images))
      `, { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;
    res.json({
      orders: data || [],
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error('[getOrders]', err);
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/orders/:id ───────────────────────────────────────
export async function getOrder(req, res) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total_amount, payment_method,
        payment_id, shipping_address, notes, created_at, updated_at,
        order_items(id, quantity, size, color, fabric_option,
          fabric_extra_price, unit_price, products(id, name, images, slug))
      `)
      .eq('id', req.params.orderId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: data });
  } catch (err) {
    console.error('[getOrder]', err);
    res.status(500).json({ error: err.message });
  }
}
