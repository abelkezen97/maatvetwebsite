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

| Role | Scope |
| --- | --- |
| `super_admin` | Everything, all countries, user management |
| `accountant` | Finance views, approvals, ledgers |
| `salesperson` | Own customers and documents in their country |

Access is enforced three times: the middleware redirects signed-out users, every API route checks role with `requireAuth()`, and Postgres RLS policies limit rows per user and country.

## Database changes

Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`, then apply it with `supabase db push` (or `npx tsx scripts/db/apply-sql.ts <file> --confirm`). Don't run DDL from ad-hoc scripts, and never put database passwords in the repo.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATABASE.md](docs/DATABASE.md) · [scripts/README.md](scripts/README.md)
