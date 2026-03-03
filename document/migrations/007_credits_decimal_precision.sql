-- 크레딧 소수점 2자리 적용: BIGINT → NUMERIC(18,2)
-- 실제 비용과 과금 정확도 향상을 위해 소수점 2자리 반올림 지원

-- credit_topup_products
ALTER TABLE credit_topup_products
  ALTER COLUMN credits TYPE NUMERIC(18, 2) USING credits::numeric(18, 2),
  ALTER COLUMN bonus_credits TYPE NUMERIC(18, 2) USING bonus_credits::numeric(18, 2);

-- credit_plan_grants
ALTER TABLE credit_plan_grants
  ALTER COLUMN monthly_credits TYPE NUMERIC(18, 2) USING monthly_credits::numeric(18, 2),
  ALTER COLUMN initial_credits TYPE NUMERIC(18, 2) USING initial_credits::numeric(18, 2);

-- credit_accounts
ALTER TABLE credit_accounts
  ALTER COLUMN balance_credits TYPE NUMERIC(18, 2) USING balance_credits::numeric(18, 2),
  ALTER COLUMN reserved_credits TYPE NUMERIC(18, 2) USING reserved_credits::numeric(18, 2);

-- credit_account_access
ALTER TABLE credit_account_access
  ALTER COLUMN max_per_period TYPE NUMERIC(18, 2) USING max_per_period::numeric(18, 2);

-- credit_transfers
ALTER TABLE credit_transfers
  ALTER COLUMN amount_credits TYPE NUMERIC(18, 2) USING amount_credits::numeric(18, 2);

-- credit_ledger_entries
ALTER TABLE credit_ledger_entries
  ALTER COLUMN amount_credits TYPE NUMERIC(18, 2) USING amount_credits::numeric(18, 2),
  ALTER COLUMN balance_after TYPE NUMERIC(18, 2) USING balance_after::numeric(18, 2);

-- credit_usage_allocations
ALTER TABLE credit_usage_allocations
  ALTER COLUMN amount_credits TYPE NUMERIC(18, 2) USING amount_credits::numeric(18, 2);

-- billing_subscription_changes (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_subscription_changes'
    AND column_name = 'credit_proration_credits'
  ) THEN
    ALTER TABLE billing_subscription_changes
      ALTER COLUMN credit_proration_credits TYPE NUMERIC(18, 2) USING credit_proration_credits::numeric(18, 2);
  END IF;
END $$;
