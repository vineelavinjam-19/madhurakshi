// src/controllers/products.js
import { supabase } from '../config/supabase.js';

// GET /api/products?q=&category=&page=&limit=&featured=&new_arrivals=&min_price=&max_price=
export async function searchProducts(req, res) {
  try {
    const { q, category, featured, new_arrivals } = req.query;
    const page      = Math.max(1, parseInt(req.query.page)  || 1);
    const limit     = Math.min(100, parseInt(req.query.limit) || 20);
    const from      = (page - 1) * limit;
    const min_price = parseFloat(req.query.min_price);
    const max_price = parseFloat(req.query.max_price);

    let query = supabase
      .from('products')
      .select(
        'id, name, price, images, description, stock, fabric_options, categories(name, slug)',
        { count: 'exact' }
      );

    if (q) {
      // Sanitise query: Supabase parameterises the value but strip % wildcards from user input
      // to prevent very broad accidental scans. Use trigram index (idx_products_name_trgm).
      const safeQ = q.replace(/[%_]/g, '').trim().slice(0, 100);
      if (safeQ) query = query.or(`name.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }

    if (category) {
      const { data: cat } = await supabase
        .from('categories').select('id').eq('slug', category).single();
      if (cat) query = query.eq('category_id', cat.id);
    }

    if (featured === 'true') query = query.eq('is_featured', true);
    if (new_arrivals === 'true') query = query.eq('is_new_arrival', true);
    if (!isNaN(min_price)) query = query.gte('price', min_price);
    if (!isNaN(max_price)) query = query.lte('price', max_price);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;
    res.json({
      products: data || [],
      pagination: { page, limit, total: count, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) {
    console.error('[searchProducts]', err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/products/:id
export async function getProduct(req, res) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories(id, name, slug),
        reviews(id, rating, title, body, created_at,
          profiles(full_name, avatar_url))
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: data });
  } catch (err) {
    console.error('[getProduct]', err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/products/:id/related
export async function getRelatedProducts(req, res) {
  try {
    const { data: product } = await supabase
      .from('products').select('category_id').eq('id', req.params.id).single();
    if (!product) return res.json({ products: [] });

    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, images, fabric_options, categories(name)')
      .eq('category_id', product.category_id)
      .neq('id', req.params.id)
      .gt('stock', 0) // only show in-stock related products
      .limit(4);

    if (error) throw error;
    res.json({ products: data || [] });
  } catch (err) {
    console.error('[getRelatedProducts]', err);
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/products/:id/fabric-options   (admin only)
export async function updateFabricOptions(req, res) {
  try {
    const { fabric_options } = req.body;

    if (!Array.isArray(fabric_options)) {
      return res.status(400).json({ error: 'fabric_options must be an array' });
    }
    for (const opt of fabric_options) {
      if (!opt.label || typeof opt.label !== 'string') {
        return res.status(400).json({ error: 'Each option must have a "label" string' });
      }
      if (typeof opt.extra_price !== 'number' || opt.extra_price < 0) {
        return res.status(400).json({ error: 'Each option must have a non-negative "extra_price" number' });
      }
    }

    const { data, error } = await supabase
      .from('products')
      .update({ fabric_options })
      .eq('id', req.params.id)
      .select('id, name, fabric_options')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: data });
  } catch (err) {
    console.error('[updateFabricOptions]', err);
    res.status(500).json({ error: err.message });
  }
}

// ── Admin: create / update / delete products ──────────────────

// POST /api/products  (admin only)
export async function createProduct(req, res) {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert(req.body)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ product: data });
  } catch (err) {
    console.error('[createProduct]', err);
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/products/:id  (admin only)
export async function updateProduct(req, res) {
  try {
    const { data, error } = await supabase
      .from('products')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: data });
  } catch (err) {
    console.error('[updateProduct]', err);
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/products/:id  (admin only)
export async function deleteProduct(req, res) {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('[deleteProduct]', err);
    res.status(500).json({ error: err.message });
  }
}
