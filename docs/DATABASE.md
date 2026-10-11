# Database

Supabase Postgres, `public` schema. All business tables have Row Level Security enabled; policies grant access to the `authenticated` role only, scoped by role, ownership and country through helper functions such as `get_user_role()`, `get_user_country()` and `is_super_admin()`.

## Tables used by the app

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user: role, country, active flag |
| `customers` | Clinics, farms, doctors; assigned salesperson, opening and pending balance |
| `products`, `product_categories` | Catalogue and tiered pricing |
| `inventory_transactions` | Every stock movement, per product and country (stock = sum) |
| `quotations`, `quotation_items` | Quotes |
| `invoices`, `invoice_items` | Invoices (`D` number series) |
| `receipts` | Payments against customers / invoices |
| `expenses` | Salesperson expenses with approve / reject |
| `cash_handovers` | Cash handed to admin, or carried forward to the next day |
| `salesperson_opening_balances` | Starting cash per salesperson for the collection ledger |
| `admin_audit_logs`, `activity_logs` | Audit trail |
| `settings`, `document_settings` | App and document configuration |

`inventory_movements` is the older stock table that `inventory_transactions` replaced.

## Migrations

Files in `supabase/migrations/` run in timestamp order. Add new ones as `YYYYMMDDHHMMSS_description.sql` and apply with `supabase db push`, or for a single file:

```bash
npx tsx scripts/db/apply-sql.ts supabase/migrations/<file>.sql --confirm
```

`supabase/manual/combined_sql_editor_bundle.sql` is an older all-in-one script meant for pasting into the dashboard SQL editor. It is not part of the migration chain.

### Known gap: no baseline migration

The core tables (`customers`, `products`, `invoices`, `receipts`, `quotations`, `expenses` and their items) were first created in the Supabase dashboard, so the migrations here alter them but never create them. A fresh database cannot be rebuilt from this folder alone. To fix that, capture the current schema once and commit it as the first migration:

```bash
supabase link --project-ref <project-ref>
supabase db dump --schema public -f supabase/migrations/20260801000000_baseline.sql
```
