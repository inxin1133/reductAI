-- ============================================
-- Credits Service Schema (per-service DB)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CREDIT SETTINGS
CREATE TABLE credit_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_currency VARCHAR(10) NOT NULL DEFAULT 'credit',
    credit_precision INTEGER NOT NULL DEFAULT 2,
    allow_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. CREDIT TOPUP PRODUCTS
CREATE TABLE credit_topup_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    price_usd DECIMAL(12,2) NOT NULL CHECK (price_usd >= 0),
    credits BIGINT NOT NULL CHECK (credits > 0),
    bonus_credits BIGINT NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. CREDIT PLAN GRANTS
CREATE TABLE credit_plan_grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_slug VARCHAR(100) NOT NULL,
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    credit_type VARCHAR(20) NOT NULL CHECK (credit_type IN ('subscription', 'topup')),
    monthly_credits BIGINT NOT NULL DEFAULT 0 CHECK (monthly_credits >= 0),
    initial_credits BIGINT NOT NULL DEFAULT 0 CHECK (initial_credits >= 0),
    expires_in_days INTEGER CHECK (expires_in_days IS NULL OR expires_in_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plan_slug, billing_cycle, credit_type)
);

-- 4. CREDIT ACCOUNTS
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('tenant', 'user')),
    owner_tenant_id UUID,
    owner_user_id UUID,
    source_tenant_id UUID,
    credit_type VARCHAR(20) NOT NULL CHECK (credit_type IN ('subscription', 'topup')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
    balance_credits BIGINT NOT NULL DEFAULT 0,
    reserved_credits BIGINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    display_name VARCHAR(200),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_accounts_owner_tenant ON credit_accounts(owner_tenant_id);
CREATE INDEX idx_credit_accounts_owner_user ON credit_accounts(owner_user_id);

-- 5. CREDIT TRANSFERS
CREATE TABLE credit_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_type VARCHAR(20) NOT NULL CHECK (transfer_type IN ('grant', 'revoke')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'revoked', 'cancelled')),
    from_account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    to_account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    amount_credits BIGINT NOT NULL CHECK (amount_credits > 0),
    requested_by UUID,
    approved_by UUID,
    processed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_transfers_from ON credit_transfers(from_account_id);
CREATE INDEX idx_credit_transfers_to ON credit_transfers(to_account_id);

-- 6. CREDIT LEDGER ENTRIES
CREATE TABLE credit_ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('subscription_grant', 'topup_purchase', 'transfer_in', 'transfer_out', 'usage', 'adjustment', 'expiry', 'refund', 'reversal')),
    amount_credits BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    usage_log_id UUID,
    transfer_id UUID REFERENCES credit_transfers(id) ON DELETE SET NULL,
    subscription_id UUID,
    invoice_id UUID,
    payment_transaction_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_ledger_account ON credit_ledger_entries(account_id);

-- 7. CREDIT USAGE ALLOCATIONS
CREATE TABLE credit_usage_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL,
    user_id UUID,
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    amount_credits BIGINT NOT NULL CHECK (amount_credits >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_usage_allocations_usage ON credit_usage_allocations(usage_log_id);

-- 8. CREDIT USER PREFERENCES
CREATE TABLE credit_user_preferences (
    user_id UUID PRIMARY KEY,
    selected_account_id UUID REFERENCES credit_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- updated_at trigger
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END
$do$;

DROP TRIGGER IF EXISTS update_credit_settings_updated_at ON credit_settings;
CREATE TRIGGER update_credit_settings_updated_at
BEFORE UPDATE ON credit_settings
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_topup_products_updated_at ON credit_topup_products;
CREATE TRIGGER update_credit_topup_products_updated_at
BEFORE UPDATE ON credit_topup_products
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_plan_grants_updated_at ON credit_plan_grants;
CREATE TRIGGER update_credit_plan_grants_updated_at
BEFORE UPDATE ON credit_plan_grants
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_accounts_updated_at ON credit_accounts;
CREATE TRIGGER update_credit_accounts_updated_at
BEFORE UPDATE ON credit_accounts
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_transfers_updated_at ON credit_transfers;
CREATE TRIGGER update_credit_transfers_updated_at
BEFORE UPDATE ON credit_transfers
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_ledger_entries_updated_at ON credit_ledger_entries;
CREATE TRIGGER update_credit_ledger_entries_updated_at
BEFORE UPDATE ON credit_ledger_entries
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_user_preferences_updated_at ON credit_user_preferences;
CREATE TRIGGER update_credit_user_preferences_updated_at
BEFORE UPDATE ON credit_user_preferences
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
