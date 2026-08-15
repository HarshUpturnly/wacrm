-- ============================================================
-- Instagram account config + keyword rules
-- ============================================================

CREATE TABLE IF NOT EXISTS instagram_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  business_account_id TEXT,
  access_token TEXT,
  webhook_verify_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id),
  UNIQUE(business_account_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_configs_account
  ON instagram_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_configs_business_account
  ON instagram_configs(business_account_id);

ALTER TABLE instagram_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instagram_configs_select ON instagram_configs;
DROP POLICY IF EXISTS instagram_configs_insert ON instagram_configs;
DROP POLICY IF EXISTS instagram_configs_update ON instagram_configs;
DROP POLICY IF EXISTS instagram_configs_delete ON instagram_configs;

CREATE POLICY instagram_configs_select ON instagram_configs
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY instagram_configs_insert ON instagram_configs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY instagram_configs_update ON instagram_configs
  FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY instagram_configs_delete ON instagram_configs
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON instagram_configs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON instagram_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS instagram_keyword_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains'
    CHECK (match_type IN ('contains', 'exact', 'word')),
  trigger_type TEXT NOT NULL DEFAULT 'both'
    CHECK (trigger_type IN ('dm', 'comment', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  reply_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, keyword, match_type, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_instagram_keyword_rules_account
  ON instagram_keyword_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_keyword_rules_active
  ON instagram_keyword_rules(account_id, is_active);

ALTER TABLE instagram_keyword_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instagram_keyword_rules_select ON instagram_keyword_rules;
DROP POLICY IF EXISTS instagram_keyword_rules_insert ON instagram_keyword_rules;
DROP POLICY IF EXISTS instagram_keyword_rules_update ON instagram_keyword_rules;
DROP POLICY IF EXISTS instagram_keyword_rules_delete ON instagram_keyword_rules;

CREATE POLICY instagram_keyword_rules_select ON instagram_keyword_rules
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY instagram_keyword_rules_insert ON instagram_keyword_rules
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY instagram_keyword_rules_update ON instagram_keyword_rules
  FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY instagram_keyword_rules_delete ON instagram_keyword_rules
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON instagram_keyword_rules;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON instagram_keyword_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
