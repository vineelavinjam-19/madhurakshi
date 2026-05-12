// src/controllers/wishlist.js
import { supabase } from '../config/supabase.js';

const TABLE = 'wishlist_items'; // change to 'wishlist' if that's your table name

// GET /api/wishlist
export async function getWishlist(req, res) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(`
        id, created_at,
        products(id, name, price, images, stock, categories(name))
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ items: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/wishlist  { product_id }
export async function addToWishlist(req, res) {
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });

    // Check if already wishlisted
    const { data: existing } = await supabase
      .from(TABLE)
      .select('id')
      .eq('user_id', req.user.id)
      .eq('product_id', product_id)
      .maybeSingle();

    if (existing) {
      return res.json({ wishlisted: true, message: 'Already in wishlist' });
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({ user_id: req.user.id, product_id })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ item: data, wishlisted: true, message: 'Added to wishlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/wishlist/:productId
export async function removeFromWishlist(req, res) {
  try {
    const { productId } = req.params;

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('user_id', req.user.id)
      .eq('product_id', productId);

    if (error) throw error;
    res.json({ wishlisted: false, message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/wishlist/check/:productId
export async function checkWishlist(req, res) {
  try {
    const { productId } = req.params;

    const { data } = await supabase
      .from(TABLE)
      .select('id')
      .eq('user_id', req.user.id)
      .eq('product_id', productId)
      .maybeSingle();

    res.json({ wishlisted: !!data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
