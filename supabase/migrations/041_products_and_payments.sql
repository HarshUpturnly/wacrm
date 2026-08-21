-- ============================================================
-- Products and Payment gateways
-- ============================================================

-- Products table for digital goods
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  file_public_url TEXT,
  file_path TEXT,
  keyword TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, keyword) -- allow mapping a keyword to one product per account
);

CREATE INDEX IF NOT EXISTS idx_products_account ON products(account_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_select ON products;
DROP POLICY IF EXISTS products_insert ON products;
DROP POLICY IF EXISTS products_update ON products;
DROP POLICY IF EXISTS products_delete ON products;

CREATE POLICY products_select ON products
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY products_insert ON products
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY products_update ON products
  FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY products_delete ON products
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payment gateways table (stores encrypted credentials in `config`)
CREATE TABLE IF NOT EXISTS payment_gateways (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'payu', 'razorpay')),
  label TEXT NOT NULL,
  config TEXT NOT NULL, -- encrypted blob (use server-side encryption)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_account ON payment_gateways(account_id);

ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_gateways_select ON payment_gateways;
DROP POLICY IF EXISTS payment_gateways_insert ON payment_gateways;
DROP POLICY IF EXISTS payment_gateways_update ON payment_gateways;
DROP POLICY IF EXISTS payment_gateways_delete ON payment_gateways;

CREATE POLICY payment_gateways_select ON payment_gateways
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY payment_gateways_insert ON payment_gateways
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY payment_gateways_update ON payment_gateways
  FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY payment_gateways_delete ON payment_gateways
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON payment_gateways;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON payment_gateways
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Extend instagram_keyword_rules to reference products or store a whatsapp link
ALTER TABLE instagram_keyword_rules
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_link TEXT;

CREATE INDEX IF NOT EXISTS idx_instagram_keyword_rules_product ON instagram_keyword_rules(product_id);
