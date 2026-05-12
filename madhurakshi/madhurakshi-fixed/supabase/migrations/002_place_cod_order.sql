-- ============================================================
-- Migration 002: Atomic COD order placement
-- Wraps stock decrement + order insert + order_items insert
-- in a single DB transaction so there is no window where
-- stock is decremented but the order doesn't exist.
-- ============================================================

CREATE OR REPLACE FUNCTION place_cod_order(
  p_user_id        UUID,
  p_total_amount   NUMERIC,
  p_shipping       JSONB,
  p_items          JSONB   -- [{product_id, quantity, size, color, fabric_option, fabric_extra_price, unit_price}]
)
RETURNS TABLE(
  ok            BOOLEAN,
  order_id      UUID,
  order_number  TEXT,
  error_msg     TEXT,
  failed_stock  JSONB     -- [{product_id, available}] when stock check fails
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id     UUID;
  v_order_number TEXT;
  v_item         JSONB;
  v_pid          UUID;
  v_qty          INT;
  v_stock        INT;
  v_failed       JSONB := '[]'::JSONB;
BEGIN
  -- 1. Lock all relevant product rows and check stock (sorted to prevent deadlocks)
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(p_items) ORDER BY value->>'product_id'
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;

    SELECT stock INTO v_stock FROM products WHERE id = v_pid FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_qty THEN
      v_failed := v_failed || jsonb_build_object(
        'product_id', v_pid,
        'available',  COALESCE(v_stock, 0)
      );
    END IF;
  END LOOP;

  -- 2. Bail out early if any item is out of stock — no side effects yet
  IF jsonb_array_length(v_failed) > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT,
      'Insufficient stock'::TEXT, v_failed;
    RETURN;
  END IF;

  -- 3. Decrement stock for all items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;
    UPDATE products SET stock = stock - v_qty WHERE id = v_pid;
  END LOOP;

  -- 4. Create the order
  INSERT INTO orders (user_id, status, total_amount, payment_method, shipping_address)
  VALUES (p_user_id, 'confirmed', p_total_amount, 'cod', p_shipping)
  RETURNING id, order_number INTO v_order_id, v_order_number;

  -- 5. Insert order items
  INSERT INTO order_items (
    order_id, product_id, quantity, size, color,
    fabric_option, fabric_extra_price, unit_price
  )
  SELECT
    v_order_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::INT,
    item->>'size',
    item->>'color',
    item->>'fabric_option',
    (item->>'fabric_extra_price')::NUMERIC,
    (item->>'unit_price')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;

  -- 6. Clear the user's cart
  DELETE FROM cart_items WHERE user_id = p_user_id;

  RETURN QUERY SELECT TRUE, v_order_id, v_order_number, NULL::TEXT, '[]'::JSONB;
END;
$$;
