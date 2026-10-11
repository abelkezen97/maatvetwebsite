# Architecture

The portal is a single Next.js 16 App Router app backed by one Supabase project. There is no other backend: pages call the app's own `/api/*` route handlers, and those talk to Supabase.

> Before August 2026 the portal read and wrote Google Sheets through Apps Script. That design is gone; its notes are kept in [`docs/legacy/`](legacy/) for reference only.

## Request flow

```mermaid
graph LR
  B[Browser] -->|page request| M[src/middleware.ts]
  M -->|no session| L[/login]
  M -->|session ok| P[Page in app/(dashboard)]
  P -->|fetch| A[app/api/* route]
  A -->|requireAuth: user + profile + role| G{allowed?}
  G -->|no| E[401 / 403]
  G -->|yes| U[Supabase as the user<br/>RLS applies]
  G -->|cross-user work| S[Supabase admin client<br/>service role, bypasses RLS]
```

1. **Middleware** (`src/middleware.ts` → `src/utils/supabase/middleware.ts`) runs on every page, refreshes the Supabase session cookie, and redirects to `/login` when there is no user. Only `/` and `/login` are public. API routes are skipped here.
2. **API routes** start with `requireAuth(roles?)` from `src/lib/auth/guard.ts`. It loads the user, their `profiles` row, rejects inactive accounts, and checks the role. Fine-grained rules live in `src/lib/auth/permissions.ts`.
3. **Database access** goes through the user's client by default, so Postgres RLS policies scope rows by role, owner and country. A few operations need to see across users — document numbering, inventory totals, customer lookups for admins — and use `createAdminClient()` (service-role key, server only).

## Clients (`src/utils/supabase/`)

| File | Runs in | Key | RLS |
| --- | --- | --- | --- |
| `client.ts` | Browser | publishable | yes |
| `server.ts` | Route handlers, server components | publishable + user cookie | yes |
| `middleware.ts` | Middleware | publishable + user cookie | yes |
| `admin.ts` | Server only | service role | **bypassed** — keep usage narrow |

## Business logic (`src/lib/db/`)

- **`sequence.ts`** — next document number per table. Invoices use the `D` series (D0353, D0354…); other documents use `PREFIX-YEAR-000001`. Runs with the admin client so numbers are unique across all users, and callers retry on unique-violation (23505).
- **`inventory.ts`** — stock is the sum of `inventory_transactions` per product and country. Invoices deduct stock on create, reconcile the difference on edit, and reverse on cancel.
- **`balances.ts`** — recomputes a customer's pending balance from opening balance, invoices and receipts.
- **`collectionLedger.ts`** — per-salesperson cash ledger: collections, expenses, handovers to admin and day-to-day carry-forward; `getCurrentCashInHand()` is the single source of truth for the handover limit.
- **`mappers.ts`** — converts between snake_case DB rows and the camelCase types in `src/types`.

## Documents and i18n

PDFs (quotes, invoices, receipts, ledgers) are generated in the browser with jsPDF (`src/lib/pdf*.ts`); 80mm thermal bills use `thermalPrintHelper.ts`. All UI strings come from `src/lib/i18n/{en,ar}.ts` via `LanguageContext`, which also flips layout to RTL for Arabic.

## Countries

Profiles, customers, products' stock and documents carry a `country` (`UAE` or `Oman`). Salespeople only see their own country; RLS and the API both enforce this.
