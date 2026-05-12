// src/middleware/auth.js
import { supabase } from '../config/supabase.js';

// Verifies Bearer JWT and attaches req.user
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });

  const token = header.split(' ')[1];
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user)
    return res.status(401).json({ error: 'Invalid or expired session' });

  req.user = data.user;
  next();
}

// Must be used after requireAuth.
// Checks the profiles table for role = 'admin'.
export async function requireAdmin(req, res, next) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .single();

  if (error || data?.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });

  next();
}
