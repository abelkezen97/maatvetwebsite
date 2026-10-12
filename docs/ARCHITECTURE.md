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
- **`balances.ts`** — reads the `customer_balances` view: opening balance + open invoice amounts − payments not applied to an invoice. The stored `customers.pending_balance` is a copy for list screens.
- **`collectionLedger.ts`** — per-salesperson cash ledger: collections, expenses, handovers to admin and day-to-day carry-forward; `getCurrentCashInHand()` is the single source of truth for the handover limit.
- **`mappers.ts`** — converts between snake_case DB rows and the camelCase types in `src/types`.

## Documents and i18n

PDFs (quotes, invoices, receipts, ledgers) are generated in the browser with jsPDF (`src/lib/pdf*.ts`); 80mm thermal bills use `thermalPrintHelper.ts`. All UI strings come from `src/lib/i18n/{en,ar}.ts` via `LanguageContext`, which also flips layout to RTL for Arabic.

## Countries

Profiles, customers, stock and documents carry a `country` (`UAE` or `Oman`). **Every** role, admins included, sees only its own country: the API filters by `profile.country` (helper `isCountryStaff()` in `src/lib/auth/permissions.ts`) and RLS does the same in the database (`is_country_staff()`, `is_country_admin()`, `is_own_country()`). The admin role is still stored as `super_admin`, but it is country-scoped and shown as "Admin (UAE)" / "Admin (Oman)".

Products are shared; prices are per country (AED columns for UAE, `*_omr` columns for Oman). A trigger stops an admin or accountant from changing the other country's prices. Currency formatting lives in `src/lib/currency.ts` (AED 2 decimals, OMR 3).

## Payments and cheques

- A receipt can settle several invoices through `receipt_allocations`; anything not allocated stays on the customer as an advance. A receipt with `invoice_id` and no allocation rows (the automatic receipt of a Paid invoice) counts as applied to that invoice in full (`receipt_applications` view).
- `invoice_balances` gives each invoice's paid amount, pending cheques, open amount, due date (issue date + credit days) and state: Paid, Cheque pending, Partly paid, Unpaid, plus overdue days.
- Cheques: `cheque_status` Pending → Cleared or Bounced (`POST /api/receipts/:id/cheque`, admin or accountant). A cheque counts as paid only when Cleared. "Received" records that the office has the cheque from the salesperson; until then it shows in the salesperson's *Cheques in hand*, separate from cash in hand.
- A bounce reopens the invoices automatically (the receipt stops counting) and sets `customers.cash_only`, which blocks credit invoices and cheque payments until an admin clears it (`POST /api/customers/:id/cash-only`).

## Credit notes and returns

- Built from an invoice's lines (`/credit-notes/new?invoiceId=`): quantity per line at the price actually paid (line total ÷ quantity), capped at what is not already on a Pending or Approved note (`GET /api/invoices/:id/returnable`).
- Each line chooses *Back to stock* (a `SALE_RETURN` stock movement on approval) or written off (damaged / expired; no stock change).
- A salesperson's note is Pending and changes nothing until an admin or accountant approves it (`POST /api/credit-notes/:id`). A note created by an admin or accountant is approved at once.
- Approved notes lower the invoice's open amount in `invoice_balances` (`credited_amount`); any amount beyond what was open (`excess_credit`) stays with the customer as credit in `customer_balances`.
- Numbering: `CN000001` via `generateNextDocumentNumber`.

## UAE billing series (UAE- vs Oman-registered products)

- `products.registered_in` (UAE | Oman, one per product; set by the UAE admin).
- In the UAE, Oman-registered products are billed separately: `billing_series` on invoices, receipts and credit notes is `standard` (UAE-registered, printed with the company header; every Oman document too) or `oman_reg` (Oman-registered, own numbers, no header). The customer keeps one combined balance.
- `invoices.invoice_group_id` links the two invoices of one split sale.
- Number series per salesman (`document_series`): prefix + next number per document type (invoice / receipt) and billing series, set in Settings → Users → Number series. `next_document_number()` hands numbers out atomically and skips numbers that already exist. Without a series, standard invoices fall back to the shared D-series.
- The database enforces that a receipt only settles invoices of its own billing series; credit notes and single-invoice receipts take their invoice's series automatically.
