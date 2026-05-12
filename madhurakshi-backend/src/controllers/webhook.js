// src/controllers/webhook.js
// Razorpay sends server-to-server events here.
// This handles the case where the user closes the tab after payment —
// the webhook fires regardless and confirms the order.

import crypto from 'crypto';
import { supabase } from '../config/supabase.js';

export async function razorpayWebhook(req, res) {
  // 1. Verify webhook signature
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] RAZORPAY_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-razorpay-signature'];
  const expected  = crypto
    .createHmac('sha256', webhookSecret)
    .update(req.rawBody) // raw bytes — see index.js for how we capture this
    .digest('hex');

  if (signature !== expected) {
    console.warn('[webhook] Invalid signature — rejecting');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;
  console.log(`[webhook] Received event: ${event.event}`);

  // 2. Handle payment.captured (most reliable event for online payments)
  if (event.event === 'payment.captured') {
    const payment  = event.payload.payment.entity;
    const orderId  = payment.notes?.order_id; // we stored this in notes at order creation

    if (!orderId) {
      console.warn('[webhook] payment.captured has no order_id in notes — skipping');
      return res.json({ received: true });
    }

    try {
      // Fetch the order + items
      const { data: order, error: fetchErr } = await supabase
        .from('orders')
        .select('id, status, user_id, order_items(quantity, products(id, name, stock))')
        .eq('id', orderId)
        .single();

      if (fetchErr || !order) {
        console.error(`[webhook] Order ${orderId} not found`);
        return res.json({ received: true }); // always 200 to Razorpay
      }

      // Idempotency: already confirmed (frontend verify-payment got there first)
      if (order.status === 'confirmed' || order.status === 'delivered') {
        console.log(`[webhook] Order ${orderId} already confirmed — nothing to do`);
        return res.json({ received: true });
      }

      if (order.status !== 'pending') {
        console.warn(`[webhook] Unexpected order status "${order.status}" for ${orderId}`);
        return res.json({ received: true });
      }

      // Decrement stock atomically
      const items = order.order_items.map(oi => ({
        product_id: oi.products.id,
        quantity:   oi.quantity,
      }));
      const { data: stockResults, error: stockErr } = await supabase
        .rpc('decrement_stock', { items: JSON.stringify(items) });

      if (stockErr) {
        console.error('[webhook] Stock decrement error:', stockErr.message);
        // Don't fail the webhook — still confirm the order so it's not stuck
      } else {
        const failed = (stockResults || []).filter(r => !r.ok);
        if (failed.length) {
          // Log oversell — handle manually or auto-cancel
          console.warn('[webhook] Stock insufficient for order', orderId, failed);
        }
      }

      // Confirm the order
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'confirmed', payment_id: payment.id })
        .eq('id', orderId);

      if (updateErr) {
        console.error('[webhook] Failed to confirm order:', updateErr.message);
      } else {
        // Clear the user's cart
        await supabase.from('cart_items').delete().eq('user_id', order.user_id);
        console.log(`[webhook] Order ${orderId} confirmed via webhook`);
      }
    } catch (err) {
      console.error('[webhook] Unexpected error:', err.message);
    }
  }

  // Always respond 200 — Razorpay retries on non-2xx
  res.json({ received: true });
}
