-- ============================================
-- Billing Service Schema (per-service DB)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BILLING PLANS
CREATE TABLE billing_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'pro', 'premium', 'business', 'enterprise')),
    tenant_type VARCHAR(20) NOT NULL CHECK (tenant_type IN ('personal', 'team', 'group')),
    description TEXT,
    included_seats INTEGER NOT NULL DEFAULT 1 CHECK (included_seats > 0),
    min_seats INTEGER NOT NULL DEFAULT 1 CHECK (min_seats > 0),
    max_seats INTEGER CHECK (max_seats IS NULL OR max_seats >= min_seats),
    extra_seat_price_usd DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (extra_seat_price_usd >= 0),
    storage_limit_mb INTEGER CHECK (storage_limit_mb IS NULL OR storage_limit_mb >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_plans_tier ON billing_plans(tier);
CREATE INDEX idx_billing_plans_tenant_type ON billing_plans(tenant_type);

-- 2. PLAN PRICES
CREATE TABLE billing_plan_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE CASCADE,
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_usd DECIMAL(12,2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    version INTEGER NOT NULL DEFAULT 1,
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'retired')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plan_id, billing_cycle, version)
);

CREATE INDEX idx_billing_plan_prices_plan ON billing_plan_prices(plan_id);
CREATE INDEX idx_billing_plan_prices_status ON billing_plan_prices(status);

-- 3. SUBSCRIPTIONS
CREATE TABLE billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'suspended', 'scheduled_cancel')),
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_usd DECIMAL(12,2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_subscriptions_tenant ON billing_subscriptions(tenant_id);
CREATE INDEX idx_billing_subscriptions_plan ON billing_subscriptions(plan_id);

-- 4. SUBSCRIPTION CHANGES
CREATE TABLE billing_subscription_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('upgrade', 'downgrade', 'cancel', 'resume')),
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'applied', 'cancelled')),
    from_plan_id UUID REFERENCES billing_plans(id) ON DELETE SET NULL,
    to_plan_id UUID REFERENCES billing_plans(id) ON DELETE SET NULL,
    requested_by UUID,
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_subscription_changes_subscription ON billing_subscription_changes(subscription_id);

-- 5. BILLING ACCOUNTS
CREATE TABLE billing_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    billing_email VARCHAR(255),
    billing_name VARCHAR(255),
    country_code VARCHAR(2),
    tax_country_code VARCHAR(2),
    tax_id VARCHAR(100),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    default_payment_method_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_accounts_tenant ON billing_accounts(tenant_id);

-- 6. PAYMENT METHODS
CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'card',
    provider_customer_id VARCHAR(255),
    provider_payment_method_id VARCHAR(255) NOT NULL,
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'deleted')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_methods_account ON payment_methods(billing_account_id);

ALTER TABLE billing_accounts
  ADD CONSTRAINT fk_billing_accounts_default_payment_method
  FOREIGN KEY (default_payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL;

-- 7. PAYMENT PROVIDER CONFIGS
CREATE TABLE payment_provider_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider)
);

-- 8. TAX RATES
CREATE TABLE tax_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    rate_percent DECIMAL(6,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. FX RATES
CREATE TABLE fx_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    base_currency VARCHAR(3) NOT NULL,
    quote_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(18,6) NOT NULL CHECK (rate > 0),
    source VARCHAR(20) NOT NULL DEFAULT 'operating' CHECK (source IN ('operating', 'market')),
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (base_currency, quote_currency, source, effective_at)
);

-- 10. INVOICES
CREATE TABLE billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
    subtotal_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_rate_id UUID REFERENCES tax_rates(id) ON DELETE SET NULL,
    tax_amount_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
    fx_rate_id UUID REFERENCES fx_rates(id) ON DELETE SET NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    issue_date TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_invoices_tenant ON billing_invoices(tenant_id);
CREATE INDEX idx_billing_invoices_subscription ON billing_invoices(subscription_id);

-- 11. INVOICE LINE ITEMS
CREATE TABLE invoice_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    line_type VARCHAR(30) NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

-- 12. PAYMENT TRANSACTIONS
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    provider VARCHAR(20) NOT NULL,
    provider_transaction_id VARCHAR(255),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('charge', 'refund', 'adjustment')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
    amount_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    processed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    related_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_payment_transactions_account ON payment_transactions(billing_account_id);

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

DROP TRIGGER IF EXISTS update_billing_plans_updated_at ON billing_plans;
CREATE TRIGGER update_billing_plans_updated_at
BEFORE UPDATE ON billing_plans
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_plan_prices_updated_at ON billing_plan_prices;
CREATE TRIGGER update_billing_plan_prices_updated_at
BEFORE UPDATE ON billing_plan_prices
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_subscriptions_updated_at ON billing_subscriptions;
CREATE TRIGGER update_billing_subscriptions_updated_at
BEFORE UPDATE ON billing_subscriptions
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_subscription_changes_updated_at ON billing_subscription_changes;
CREATE TRIGGER update_billing_subscription_changes_updated_at
BEFORE UPDATE ON billing_subscription_changes
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_accounts_updated_at ON billing_accounts;
CREATE TRIGGER update_billing_accounts_updated_at
BEFORE UPDATE ON billing_accounts
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
BEFORE UPDATE ON payment_methods
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_provider_configs_updated_at ON payment_provider_configs;
CREATE TRIGGER update_payment_provider_configs_updated_at
BEFORE UPDATE ON payment_provider_configs
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_tax_rates_updated_at ON tax_rates;
CREATE TRIGGER update_tax_rates_updated_at
BEFORE UPDATE ON tax_rates
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_fx_rates_updated_at ON fx_rates;
CREATE TRIGGER update_fx_rates_updated_at
BEFORE UPDATE ON fx_rates
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_invoices_updated_at ON billing_invoices;
CREATE TRIGGER update_billing_invoices_updated_at
BEFORE UPDATE ON billing_invoices
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER update_payment_transactions_updated_at
BEFORE UPDATE ON payment_transactions
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
