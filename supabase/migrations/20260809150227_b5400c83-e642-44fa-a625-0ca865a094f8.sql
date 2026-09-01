-- Add indexes to optimize performance for multi-tenant and multi-season queries

-- Table: queue
CREATE INDEX IF NOT EXISTS idx_queue_user_season ON public.queue(user_id, season_id);

-- Table: customers
CREATE INDEX IF NOT EXISTS idx_customers_user_season ON public.customers(user_id, season_id);

-- Table: invoices
CREATE INDEX IF NOT EXISTS idx_invoices_user_season ON public.invoices(user_id, season_id);

-- Table: workers
CREATE INDEX IF NOT EXISTS idx_workers_user ON public.workers(user_id);

-- Table: work_records
CREATE INDEX IF NOT EXISTS idx_work_records_user_season ON public.work_records(user_id, season_id);

-- Table: worker_payments
CREATE INDEX IF NOT EXISTS idx_worker_payments_user_season ON public.worker_payments(user_id, season_id);

-- Table: oil_transactions
CREATE INDEX IF NOT EXISTS idx_oil_transactions_user_season ON public.oil_transactions(user_id, season_id);

-- Table: expenses
CREATE INDEX IF NOT EXISTS idx_expenses_user_season ON public.expenses(user_id, season_id);

-- Table: container_types
CREATE INDEX IF NOT EXISTS idx_container_types_user_season ON public.container_types(user_id, season_id);
