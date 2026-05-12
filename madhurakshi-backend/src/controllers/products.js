// src/controllers/products.js
import { supabase } from '../config/supabase.js';

// GET /api/products?q=&category=&page=&limit=
export async function searchProducts(req, res) {
  try {
    const { q, category } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const from  = (page - 1) * limit;

    let query = supabase
      .from('products')
      .select(
        'id, name, price, compare_price, images, description, stock, fabric_options, categories(name, slug)',
        { count: 'exact' }
      );

    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);

    if (category) {
      const { data: cat } = await supabase
        .from('categories').select('id').eq('slug', category).single();
      if (cat) query = query.eq('category_id', cat.id);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;
    res.json({
      products: data || [],
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (err) {
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
      .select('id, name, price, compare_price, images, fabric_options, categories(name)')
      .eq('category_id', product.category_id)
      .neq('id', req.params.id)
      .limit(4);

    if (error) throw error;
    res.json({ products: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/products/:id/fabric-options   (admin only)
// Body: { fabric_options: [{ label: "4 meters", extra_price: 0 }, { label: "6 meters", extra_price: 500 }] }
export async function updateFabricOptions(req, res) {
  try {
    const { fabric_options } = req.body;

    // Validate shape
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
    res.json({ product: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
