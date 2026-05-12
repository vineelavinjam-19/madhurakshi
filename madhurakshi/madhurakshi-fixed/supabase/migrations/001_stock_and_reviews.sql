-- ============================================================
-- Migration 001: Atomic stock decrement + purchase verification
-- Run in Supabase SQL Editor or via supabase db push
-- ============================================================


-- ── 1. Atomic stock decrement ────────────────────────────────
-- Called from the backend when an order is confirmed.
-- Decrements stock for each item only if sufficient stock exists.
-- Returns an error row if any product is out of stock (so the
-- backend can roll back the order in one round-trip).

CREATE OR REPLACE FUNCTION decrement_stock(items JSONB)
RETURNS TABLE(product_id UUID, ok BOOLEAN, available INT)
LANGUAGE plpgsql
AS $$
DECLARE
  item      JSONB;
  p_id      UUID;
  p_qty     INT;
  p_stock   INT;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    p_id  := (item->>'product_id')::UUID;
    p_qty := (item->>'quantity')::INT;

    -- Lock the row for this product
    SELECT stock INTO p_stock
    FROM products
    WHERE id = p_id
    FOR UPDATE;

    IF p_stock IS NULL THEN
      RETURN QUERY SELECT p_id, FALSE, 0;
    ELSIF p_stock < p_qty THEN
      RETURN QUERY SELECT p_id, FALSE, p_stock;
    ELSE
      UPDATE products SET stock = stock - p_qty WHERE id = p_id;
      RETURN QUERY SELECT p_id, TRUE, p_stock - p_qty;
    END IF;
  END LOOP;
END;
$$;


-- ── 2. Review eligibility check ──────────────────────────────
-- Returns TRUE if the given user has at least one confirmed/delivered
-- order that contains the given product.

CREATE OR REPLACE FUNCTION has_purchased(p_user_id UUID, p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id  = p_user_id
      AND oi.product_id = p_product_id
      AND o.status IN ('confirmed', 'delivered')
  );
$$;


-- ── 3. Prevent duplicate reviews ────────────────────────────
-- Unique constraint so one user can only review a product once.
-- (Skip if it already exists.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reviews_user_product_unique'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_user_product_unique
      UNIQUE (user_id, product_id);
  END IF;
END;
$$;
