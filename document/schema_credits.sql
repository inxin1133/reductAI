-- ============================================
-- 크레딧 / 포인트 원장 및 풀
-- PostgreSQL 데이터베이스 스키마
-- ============================================
--
-- 중요:
-- 1. schema.sql 및 schema_models.sql을 먼저 실행하세요.
-- 2. 이 스키마를 적용하기 전에 schema_billing.sql을 먼저 실행하세요(FK 참조 있음).
--
-- 권장 실행 순서:
--   schema.sql -> schema_models.sql -> schema_pricing.sql -> schema_billing.sql -> schema_credits.sql -> schema_llm_usage.sql
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CREDIT SETTINGS
-- ============================================

CREATE TABLE credit_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credits_per_usd INTEGER NOT NULL DEFAULT 1000,
    topup_expiry_months INTEGER NOT NULL DEFAULT 36,
    subscription_expiry_days INTEGER NOT NULL DEFAULT 31,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (currency)
);

COMMENT ON TABLE credit_settings IS '글로벌 크레딧 변환 및 만료 설정.';
COMMENT ON COLUMN credit_settings.credits_per_usd IS '1 USD당 크레딧 수.';
COMMENT ON COLUMN credit_settings.topup_expiry_months IS '탑업 크레딧 만료 개월 수.';
COMMENT ON COLUMN credit_settings.subscription_expiry_days IS '구독 크레딧 만료 일 수.';
COMMENT ON COLUMN credit_settings.currency IS '크레딧 통화.';
COMMENT ON COLUMN credit_settings.created_at IS '생성 시간.';
COMMENT ON COLUMN credit_settings.updated_at IS '수정 시간.';


-- ============================================
-- 2. TOP-UP CREDIT PRODUCTS (탑업 크레딧 제품)
-- ============================================

CREATE TABLE credit_topup_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    price_usd DECIMAL(10, 2) NOT NULL,
    credits BIGINT NOT NULL,
    bonus_credits BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_topup_products_active ON credit_topup_products(is_active);

COMMENT ON TABLE credit_topup_products IS '선불 충전용 크레딧 상품(Top-up credit packs).';
COMMENT ON COLUMN credit_topup_products.sku_code IS '상품 코드(sku_code)'; 
COMMENT ON COLUMN credit_topup_products.name IS '상품 이름(name)';
COMMENT ON COLUMN credit_topup_products.price_usd IS '가격(USD)';
COMMENT ON COLUMN credit_topup_products.credits IS '크레딧 수(credits)';
COMMENT ON COLUMN credit_topup_products.bonus_credits IS '보너스 크레딧 수(bonus_credits)';
COMMENT ON COLUMN credit_topup_products.currency IS '통화(currency)';
COMMENT ON COLUMN credit_topup_products.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN credit_topup_products.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN credit_topup_products.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_topup_products.updated_at IS '수정 시간(TIMESTAMP)';


-- ============================================
-- 3. PLAN CREDIT GRANTS (monthly entitlement) (월간 크레딧 권한)
-- ============================================

CREATE TABLE credit_plan_grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_slug VARCHAR(50) NOT NULL, -- free/pro/premium/business/enterprise
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    monthly_credits BIGINT NOT NULL DEFAULT 0,
    initial_credits BIGINT NOT NULL DEFAULT 0,
    credit_type VARCHAR(20) NOT NULL DEFAULT 'subscription' CHECK (credit_type IN ('subscription', 'topup')),
    expires_in_days INTEGER DEFAULT 31,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plan_slug, billing_cycle, credit_type)
);

COMMENT ON TABLE credit_plan_grants IS '월간 크레딧 권한(monthly entitlement)';
COMMENT ON COLUMN credit_plan_grants.id IS '크레딧 권한 ID(UUID)';
COMMENT ON COLUMN credit_plan_grants.plan_slug IS '요금제 슬러그(plan_slug)';
COMMENT ON COLUMN credit_plan_grants.billing_cycle IS '결제 주기(billing_cycle)';
COMMENT ON COLUMN credit_plan_grants.monthly_credits IS '월간 크레딧 수(monthly_credits)';
COMMENT ON COLUMN credit_plan_grants.initial_credits IS '초기 크레딧 수(initial_credits)';
COMMENT ON COLUMN credit_plan_grants.credit_type IS '크레딧 타입(credit_type)';
COMMENT ON COLUMN credit_plan_grants.expires_in_days IS '만료 일 수(expires_in_days)';
COMMENT ON COLUMN credit_plan_grants.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN credit_plan_grants.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN credit_plan_grants.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_plan_grants.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 4. CREDIT ACCOUNTS (tenant pools & user grants) (크레딧 계정)
-- ============================================

CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_type VARCHAR(10) NOT NULL CHECK (owner_type IN ('tenant', 'user')),
    owner_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL, -- tenant that funds the credits
    credit_type VARCHAR(20) NOT NULL CHECK (credit_type IN ('subscription', 'topup')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
    balance_credits BIGINT NOT NULL DEFAULT 0,
    reserved_credits BIGINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    display_name VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (owner_type = 'tenant' AND owner_tenant_id IS NOT NULL AND owner_user_id IS NULL)
        OR (owner_type = 'user' AND owner_user_id IS NOT NULL AND source_tenant_id IS NOT NULL)
    ),
    CHECK (balance_credits >= 0),
    CHECK (reserved_credits >= 0)
);

CREATE UNIQUE INDEX uniq_credit_accounts_tenant_type
  ON credit_accounts(owner_tenant_id, credit_type)
  WHERE owner_type = 'tenant';
CREATE UNIQUE INDEX uniq_credit_accounts_user_source_type
  ON credit_accounts(owner_user_id, source_tenant_id, credit_type)
  WHERE owner_type = 'user';

CREATE INDEX idx_credit_accounts_owner_user ON credit_accounts(owner_user_id);
CREATE INDEX idx_credit_accounts_owner_tenant ON credit_accounts(owner_tenant_id);
CREATE INDEX idx_credit_accounts_source_tenant ON credit_accounts(source_tenant_id);

COMMENT ON TABLE credit_accounts IS '테넌트 또는 사용자(그랜트)를 통해 소유되는 크레딧 풀.';
COMMENT ON COLUMN credit_accounts.id IS '크레딧 계정 ID(UUID)';
COMMENT ON COLUMN credit_accounts.owner_type IS '소유자 타입(owner_type)';
COMMENT ON COLUMN credit_accounts.owner_tenant_id IS '테넌트 ID(tenants.id)';
COMMENT ON COLUMN credit_accounts.owner_user_id IS '사용자 ID(users.id)';
COMMENT ON COLUMN credit_accounts.source_tenant_id IS '소스 테넌트 ID(tenants.id)';
COMMENT ON COLUMN credit_accounts.credit_type IS '크레딧 타입(credit_type)';
COMMENT ON COLUMN credit_accounts.status IS '상태(status)';
COMMENT ON COLUMN credit_accounts.balance_credits IS '크레딧 잔액(balance_credits)';
COMMENT ON COLUMN credit_accounts.reserved_credits IS '예약 크레딧 수(reserved_credits)';
COMMENT ON COLUMN credit_accounts.expires_at IS '만료 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_accounts.display_name IS '표시 이름(display_name)';
COMMENT ON COLUMN credit_accounts.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN credit_accounts.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_accounts.updated_at IS '수정 시간(TIMESTAMP)';


-- ============================================
-- 5. CREDIT TRANSFERS (tenant -> user grants) (크레딧 이전)
-- ============================================

-- 
-- [credit_transfers 역할 설명]
-- 이 테이블은 크레딧 계정 간(주로 테넌트 계정에서 사용자 계정으로) 크레딧을 이전(grant)하거나 회수(revoke)한 모든 내역을 기록합니다.
-- 각 레코드는 크레딧 이동의 출발 계정, 도착 계정, 이전 유형, 크레딧 수량, 요청/승인자, 이전 사유, 상태 및 메타데이터를 포함합니다.
-- 실제 크레딧 풀에서 그랜트 지급/회수, 승인 흐름, 회계 추적 등을 위해 활용됩니다.
--

CREATE TABLE credit_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    to_account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    transfer_type VARCHAR(20) NOT NULL DEFAULT 'grant' CHECK (transfer_type IN ('grant', 'revoke')),
    amount_credits BIGINT NOT NULL CHECK (amount_credits > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'revoked', 'cancelled')),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_credit_transfers_from_account ON credit_transfers(from_account_id);
CREATE INDEX idx_credit_transfers_to_account ON credit_transfers(to_account_id);
CREATE INDEX idx_credit_transfers_status ON credit_transfers(status);

COMMENT ON TABLE credit_transfers IS '테넌트 크레딧 풀에서 사용자에게 부여되는 크레딧 이전 테이블.';
COMMENT ON COLUMN credit_transfers.id IS '크레딧 이전 ID(UUID)';
COMMENT ON COLUMN credit_transfers.from_account_id IS '소스 크레딧 계정 ID(credit_accounts.id)';
COMMENT ON COLUMN credit_transfers.to_account_id IS '대상 크레딧 계정 ID(credit_accounts.id)';
COMMENT ON COLUMN credit_transfers.transfer_type IS '이전 유형(transfer_type)';
COMMENT ON COLUMN credit_transfers.amount_credits IS '이전 크레딧 수(amount_credits)';
COMMENT ON COLUMN credit_transfers.status IS '상태(status)';
COMMENT ON COLUMN credit_transfers.requested_by IS '요청자 ID(users.id)';
COMMENT ON COLUMN credit_transfers.approved_by IS '승인자 ID(users.id)';
COMMENT ON COLUMN credit_transfers.reason IS '이유(reason)';
COMMENT ON COLUMN credit_transfers.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN credit_transfers.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_transfers.completed_at IS '완료 시간(TIMESTAMP)';

-- ============================================
-- 6. CREDIT LEDGER ENTRIES (크레딧 원장)
-- ============================================

-- 
-- [credit_ledger_entries 역할 설명]
-- 이 테이블은 각 크레딧 계정에서 발생한 모든 크레딧 관련 이벤트(발행, 사용, 조정, 만료 등)를 기록하는 변경 불가능한 원장 테이블입니다.
-- 모든 입·출금, 이체, 만료, 환불 등 다양한 크레딧 이동 내역을 추적하며,
-- 각 이벤트 이후 계정의 잔액, 연관된 로그, 결제, 구독 등 관련 데이터와의 연결 정보를 포함합니다.
-- 회계 감사, 사용자별 크레딧 추적 및 분석, 데이터 불변성 확보에 활용됩니다.
--

CREATE TABLE credit_ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    entry_type VARCHAR(30) NOT NULL CHECK (
        entry_type IN ('subscription_grant', 'topup_purchase', 'transfer_in', 'transfer_out', 'usage', 'adjustment', 'expiry', 'refund', 'reversal')
    ),
    amount_credits BIGINT NOT NULL, -- positive for credit, negative for debit
    balance_after BIGINT,
    usage_log_id UUID REFERENCES llm_usage_logs(id) ON DELETE SET NULL,
    transfer_id UUID REFERENCES credit_transfers(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    CHECK (amount_credits <> 0)
);

CREATE INDEX idx_credit_ledger_entries_account ON credit_ledger_entries(account_id);
CREATE INDEX idx_credit_ledger_entries_usage_log ON credit_ledger_entries(usage_log_id);
CREATE INDEX idx_credit_ledger_entries_occurred_at ON credit_ledger_entries(occurred_at);

COMMENT ON TABLE credit_ledger_entries IS '변경 불가능한 크레딧 원장 (발행, 사용, 조정, 만료).';
COMMENT ON COLUMN credit_ledger_entries.id IS '크레딧 원장 ID(UUID)';
COMMENT ON COLUMN credit_ledger_entries.account_id IS '크레딧 계정 ID(credit_accounts.id)';
COMMENT ON COLUMN credit_ledger_entries.entry_type IS '원장 유형(entry_type)';
COMMENT ON COLUMN credit_ledger_entries.amount_credits IS '크레딧 수(amount_credits)';
COMMENT ON COLUMN credit_ledger_entries.balance_after IS '잔액 이후(balance_after)';
COMMENT ON COLUMN credit_ledger_entries.usage_log_id IS '사용 로그 ID(llm_usage_logs.id)';
COMMENT ON COLUMN credit_ledger_entries.transfer_id IS '이전 ID(credit_transfers.id)';
COMMENT ON COLUMN credit_ledger_entries.subscription_id IS '구독 ID(billing_subscriptions.id)';
COMMENT ON COLUMN credit_ledger_entries.invoice_id IS '청구서 ID(billing_invoices.id)';
COMMENT ON COLUMN credit_ledger_entries.payment_transaction_id IS '결제 거래 ID(payment_transactions.id)';
COMMENT ON COLUMN credit_ledger_entries.expires_at IS '만료 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_ledger_entries.occurred_at IS '발생 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_ledger_entries.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN credit_ledger_entries.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_ledger_entries.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 7. CREDIT USAGE ALLOCATIONS (usage split) (사용 할당)
-- ============================================
-- [credit_usage_allocations 역할 설명]
-- 이 테이블은 LLM 사용 이벤트(usage_log)를 하나 이상의 크레딧 계정(credit_accounts)에 분할 할당하는 역할을 합니다.
-- 예를 들어, 한 번의 사용 기록에 대해 여러 크레딧 계정에서 크레딧을 차감해야 할 경우,
-- 사용된 크레딧이 각 계정에 어떻게 분배(할당)되었는지 추적할 수 있도록 설계되었습니다.
-- 여러 계정으로 사용량을 분산 정산하거나 팀/조직 단위 배분 등 정밀한 크레딧 관리·추적에 활용됩니다.

CREATE TABLE credit_usage_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    amount_credits BIGINT NOT NULL CHECK (amount_credits > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usage_log_id, account_id)
);

CREATE INDEX idx_credit_usage_allocations_usage_log ON credit_usage_allocations(usage_log_id);
CREATE INDEX idx_credit_usage_allocations_user ON credit_usage_allocations(user_id);

COMMENT ON TABLE credit_usage_allocations IS '사용 이벤트를 하나 이상의 크레딧 계정에 매핑. (사용 할당)';
COMMENT ON COLUMN credit_usage_allocations.id IS '사용 할당 ID(UUID)';
COMMENT ON COLUMN credit_usage_allocations.usage_log_id IS '사용 로그 ID(llm_usage_logs.id)';
COMMENT ON COLUMN credit_usage_allocations.user_id IS '사용자 ID(users.id)';
COMMENT ON COLUMN credit_usage_allocations.account_id IS '크레딧 계정 ID(credit_accounts.id)';
COMMENT ON COLUMN credit_usage_allocations.amount_credits IS '크레딧 수(amount_credits)';
COMMENT ON COLUMN credit_usage_allocations.created_at IS '생성 시간(TIMESTAMP)';

-- ============================================
-- 8. CREDIT USER PREFERENCES (consumption order) (사용 순서)
-- ============================================

CREATE TABLE credit_user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    selected_account_id UUID REFERENCES credit_accounts(id) ON DELETE SET NULL,
    selection_mode VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (selection_mode IN ('manual', 'auto')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE credit_user_preferences IS '사용자가 선택한 기본 크레딧 소비 계정.';
COMMENT ON COLUMN credit_user_preferences.user_id IS '사용자 ID(users.id)';
COMMENT ON COLUMN credit_user_preferences.selected_account_id IS '선택된 크레딧 계정 ID(credit_accounts.id)';
COMMENT ON COLUMN credit_user_preferences.selection_mode IS '선택 모드(manual, auto)';
COMMENT ON COLUMN credit_user_preferences.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN credit_user_preferences.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 9. UPDATED_AT TRIGGERS (업데이트 시간 트리거)
-- ============================================

DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $func$ language 'plpgsql';
    END IF;
END $do$;

CREATE TRIGGER update_credit_settings_updated_at BEFORE UPDATE ON credit_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_topup_products_updated_at BEFORE UPDATE ON credit_topup_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_plan_grants_updated_at BEFORE UPDATE ON credit_plan_grants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_accounts_updated_at BEFORE UPDATE ON credit_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_user_preferences_updated_at BEFORE UPDATE ON credit_user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. SEED DATA
-- ============================================

INSERT INTO credit_settings (credits_per_usd, topup_expiry_months, subscription_expiry_days, currency)
VALUES (1000, 36, 31, 'USD')
ON CONFLICT (currency) DO NOTHING;

INSERT INTO credit_topup_products (sku_code, name, price_usd, credits, bonus_credits, currency)
VALUES
    ('topup-10', 'Top-up $10', 10, 10000, 0, 'USD'),
    ('topup-20', 'Top-up $20', 20, 21000, 1000, 'USD'),
    ('topup-50', 'Top-up $50', 50, 55000, 5000, 'USD'),
    ('topup-100', 'Top-up $100', 100, 120000, 20000, 'USD')
ON CONFLICT (sku_code) DO NOTHING;

INSERT INTO credit_plan_grants (plan_slug, billing_cycle, monthly_credits, initial_credits, credit_type, expires_in_days, is_active, metadata)
VALUES
    ('free', 'monthly', 0, 500, 'subscription', 31, TRUE, '{"note":"initial free credits only"}'::jsonb),
    ('pro', 'monthly', 20000, 0, 'subscription', 31, TRUE, '{}'::jsonb),
    ('premium', 'monthly', 50000, 0, 'subscription', 31, TRUE, '{}'::jsonb),
    ('business', 'monthly', 100000, 0, 'subscription', 31, TRUE, '{}'::jsonb),
    ('enterprise', 'monthly', 0, 0, 'subscription', 31, FALSE, '{"note":"TBD"}'::jsonb)
ON CONFLICT (plan_slug, billing_cycle, credit_type) DO NOTHING;
