// src/controllers/account.js
import { supabase } from '../config/supabase.js';

// GET /api/account/profile
export async function getProfile(req, res) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email, avatar_url, created_at')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: data });
  } catch (err) {
    console.error('[getProfile]', err);
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/account/profile  { full_name?, phone? }
export async function updateProfile(req, res) {
  try {
    const updates = {};
    if (req.body.full_name !== undefined) updates.full_name = req.body.full_name;
    if (req.body.phone     !== undefined) updates.phone     = req.body.phone;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: data });
  } catch (err) {
    console.error('[updateProfile]', err);
    res.status(500).json({ error: err.message });
  }
}

// POST /api/account/reviews  { product_id, rating, title?, body }
export async function submitReview(req, res) {
  try {
    const { product_id, rating, title, body } = req.body; // validated by Zod middleware

    // ── Purchase verification ──────────────────────────────
    // Uses the has_purchased() SQL function from migration 001.
    const { data: purchased, error: purchaseErr } = await supabase
      .rpc('has_purchased', { p_user_id: req.user.id, p_product_id: product_id });

    if (purchaseErr) throw purchaseErr;

    if (!purchased) {
      return res.status(403).json({
        error: 'You can only review products you have purchased and received',
      });
    }

    // ── Insert review ──────────────────────────────────────
    const { data, error } = await supabase
      .from('reviews')
      .insert({ product_id, user_id: req.user.id, rating, title, body })
      .select()
      .single();

    if (error) {
      // Unique constraint violation = already reviewed
      if (error.code === '23505') {
        return res.status(409).json({ error: 'You have already reviewed this product' });
      }
      throw error;
    }

    res.status(201).json({ review: data });
  } catch (err) {
    console.error('[submitReview]', err);
    res.status(500).json({ error: err.message });
  }
}
