// src/controllers/cart.js
import { supabase } from '../config/supabase.js';

// GET /api/cart
export async function getCart(req, res) {
  try {
    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        id, quantity, size, color, fabric_option, created_at,
        products(id, name, price, images, stock, fabric_options)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Compute line totals including fabric extra price
    const items = (data || []).map(item => {
      const fabricExtra = resolveFabricExtra(item.products.fabric_options, item.fabric_option);
      const unitPrice   = parseFloat(item.products.price) + fabricExtra;
      return { ...item, fabric_extra_price: fabricExtra, unit_price: unitPrice };
    });

    const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    res.json({ items, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/cart  { product_id, quantity, size, color, fabric_option }
export async function addToCart(req, res) {
  try {
    const { product_id, quantity = 1, size = null, color = null, fabric_option = null } = req.body;

    // Fetch product + validate fabric_option
    const { data: product } = await supabase
      .from('products')
      .select('id, stock, fabric_options')
      .eq('id', product_id)
      .single();

    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock <= 0) return res.status(400).json({ error: 'Product is out of stock' });

    // If product has fabric options, the customer must pick one
    if (product.fabric_options?.length > 0 && !fabric_option) {
      return res.status(400).json({
        error: 'Please select a fabric length option',
        options: product.fabric_options,
      });
    }

    // Validate chosen fabric_option actually exists on this product
    if (fabric_option && product.fabric_options?.length > 0) {
      const valid = product.fabric_options.some(o => o.label === fabric_option);
      if (!valid) {
        return res.status(400).json({
          error: `Invalid fabric option "${fabric_option}"`,
          options: product.fabric_options,
        });
      }
    }

    // Deduplicate: same product + size + color + fabric_option → increment qty
    // Use IS NULL filters for null fields — comparing null as '' causes false
    // misses on Postgres when the column stores actual NULL (not empty string).
    let dupQuery = supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', req.user.id)
      .eq('product_id', product_id);

    if (size   === null) dupQuery = dupQuery.is('size', null);
    else                 dupQuery = dupQuery.eq('size', size);

    if (color  === null) dupQuery = dupQuery.is('color', null);
    else                 dupQuery = dupQuery.eq('color', color);

    if (fabric_option === null) dupQuery = dupQuery.is('fabric_option', null);
    else                        dupQuery = dupQuery.eq('fabric_option', fabric_option);

    const { data: existing } = await dupQuery.maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return res.json({ item: data, message: 'Cart updated' });
    }

    const { data, error } = await supabase
      .from('cart_items')
      .insert({ user_id: req.user.id, product_id, quantity, size, color, fabric_option })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ item: data, message: 'Added to cart' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/cart/:itemId  { quantity }
export async function updateCartItem(req, res) {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      const { error } = await supabase
        .from('cart_items').delete().eq('id', itemId).eq('user_id', req.user.id);
      if (error) throw error;
      return res.json({ message: 'Item removed' });
    }

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/cart/:itemId
export async function removeFromCart(req, res) {
  try {
    const { error } = await supabase
      .from('cart_items').delete()
      .eq('id', req.params.itemId).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/cart
export async function clearCart(req, res) {
  try {
    const { error } = await supabase
      .from('cart_items').delete().eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Helper ────────────────────────────────────────────────────
// Given a product's fabric_options array and the customer's chosen label,
// return the extra price (0 if no match or no option chosen).
export function resolveFabricExtra(fabricOptions, chosenLabel) {
  if (!chosenLabel || !fabricOptions?.length) return 0;
  const match = fabricOptions.find(o => o.label === chosenLabel);
  return match ? parseFloat(match.extra_price || 0) : 0;
}
