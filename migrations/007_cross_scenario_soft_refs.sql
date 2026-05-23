-- Cross-scenario soft references. These are NOT enforced foreign keys —
-- in a real org, different teams own different DBs, and there's no
-- mechanism to enforce FK integrity across schemas they don't share.
--
-- The columns + comments here document the relationship. The visualizer
-- reads pg_description to render these as dashed edges between scenario
-- group boxes.
--
-- Format: 'soft_ref: <target_schema>.<target_table>.<target_col>'

-- 1. ecommerce.payments.processor_user_id → ft_identity.users.id
--    (ec_payments.payments.processor_user_id already exists from
--    005_ecommerce.sql; only the comment is added here.)
COMMENT ON COLUMN ec_payments.payments.processor_user_id IS
  'soft_ref: ft_identity.users.id';

-- 2. infra_identity.users.external_contact_email → es_accounts.contacts.email
ALTER TABLE infra_identity.users
  ADD COLUMN external_contact_email TEXT;
COMMENT ON COLUMN infra_identity.users.external_contact_email IS
  'soft_ref: es_accounts.contacts.email';

-- 3. sm_identity.users.payment_account_id → ft_ledger.accounts.id
ALTER TABLE sm_identity.users
  ADD COLUMN payment_account_id INT;
COMMENT ON COLUMN sm_identity.users.payment_account_id IS
  'soft_ref: ft_ledger.accounts.id';

-- 4. es_pipeline.activities.actor_external_email → sm_identity.users.email
ALTER TABLE es_pipeline.activities
  ADD COLUMN actor_external_email TEXT;
COMMENT ON COLUMN es_pipeline.activities.actor_external_email IS
  'soft_ref: sm_identity.users.email';
