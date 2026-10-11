# MAAT Sales Portal

Internal sales and collections portal for MAAT Veterinary Trading (UAE and Oman). Sales reps create quotations, invoices and receipts; accountants and admins manage customers, inventory, expenses and cash handovers. English and Arabic (RTL) are both supported.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Row Level Security) · jsPDF for invoices, receipts and 80mm thermal bills.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase keys
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript only, no build |

## Project layout

```text
src/
  app/
    (dashboard)/        signed-in pages: dashboard, customers, products, inventory,
                        quotes, invoices, receipts, collection-ledger, expenses,
                        users, settings
    api/                route handlers; each one calls requireAuth()
    login/              public sign-in page
  components/           shared UI (DataTable, PageHeader, Sidebar, modals…)
  context/              LanguageContext (EN / AR)
  hooks/                useAuth
  lib/
    auth/               requireAuth guard, role permissions
    db/                 balances, collection ledger, inventory, document numbering
    i18n/               translations and formatters
    pdf*.ts, thermal*   document generation
  types/                shared TypeScript types
  utils/supabase/       browser, server, admin (service-role) and middleware clients
  middleware.ts         session refresh + redirect to /login
supabase/
  migrations/           timestamped SQL, applied in order
  manual/               one-off SQL bundles for the dashboard SQL editor
scripts/                ops and verification scripts — see scripts/README.md
docs/                   architecture and database notes
public/                 logos and images used by pages and PDFs
```

The `@/` import alias points at `src/`.

## Roles

Every user belongs to one country (UAE or Oman) and only ever sees that country's data. There is no global owner account.

| Role | Shown as | Scope (own country only) |
| --- | --- | --- |
| `super_admin` | Admin (UAE) / Admin (Oman) | Users, products and prices, stock, editing or cancelling invoices and receipts, settings |
| `accountant` | Accountant | Finance views, approvals, ledgers, opening balances, own-country prices |
| `salesperson` | Salesperson | Own customers and documents |

Products are one shared list; UAE prices are in AED (`selling_price`, `price_10`…) and Oman prices in OMR (`selling_price_omr`, `price_10_omr`…). Money is stored with 3 decimals so OMR amounts are exact; screens and documents show AED with 2 and OMR with 3.

Access is enforced three times: the middleware redirects signed-out users, every API route checks role and country, and Postgres RLS policies (`is_country_staff()`, `is_country_admin()`) limit rows per user and country. Nobody can change their own role or country, and an admin cannot move a user to the other country.

If the only admin of a country is locked out, fix it from the Supabase dashboard (Authentication → Users, or the `profiles` table).

## Database changes

Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`, then apply it with `supabase db push` (or `npx tsx scripts/db/apply-sql.ts <file> --confirm`). Don't run DDL from ad-hoc scripts, and never put database passwords in the repo.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATABASE.md](docs/DATABASE.md) · [scripts/README.md](scripts/README.md)
