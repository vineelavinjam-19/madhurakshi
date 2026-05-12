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
//
// Role resolution — two-layer strategy, fast path first:
//
// 1. JWT fast path: Supabase embeds `app_metadata` in the token, so if you set
//    the role there (via the Supabase dashboard or a server-side call) it is
//    available without any DB round-trip:
//
//      await supabase.auth.admin.updateUserById(userId, {
//        app_metadata: { role: 'admin' },
//      });
//
//    The token is re-issued on next sign-in and the role is instantly readable
//    from req.user.app_metadata.role — zero extra queries.
//
// 2. DB fallback: if app_metadata.role is not set (e.g. during migration from
//    the old profiles-table approach), we fall back to a single profiles query.
//    This keeps backward compatibility without a big-bang migration.
//
// When you're fully on app_metadata you can delete the fallback block.
export async function requireAdmin(req, res, next) {
  // Fast path — role baked into the verified JWT (no DB query)
  if (req.user.app_metadata?.role === 'admin') return next();

  // Fallback — profiles table (one query; remove once all admins use app_metadata)
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .single();

  if (error || data?.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });

  next();
}
