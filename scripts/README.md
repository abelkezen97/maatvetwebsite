# Scripts

Operational and verification scripts, run from the repo root with [`tsx`](https://tsx.is):

```bash
npx tsx scripts/audits/check_profiles.ts
npx tsx scripts/tests/test_inventory_suite.ts --confirm
```

They read `.env.local` and connect to whatever project `NEXT_PUBLIC_SUPABASE_URL` points at — **there is no separate test database, so that is normally production.** Most use the service-role key and bypass RLS.

| Folder | What's inside | Writes data? |
| --- | --- | --- |
| `audits/` | Read-only reports: balances, profiles, stock, invoice checks | No |
| `db/` | Schema and policy inspection, PostgREST reload, `apply-sql.ts` | Some |
| `tests/` | End-to-end checks of business rules (numbering, inventory, ledger, RLS). They create records and clean up after themselves | Yes |
| `maintenance/` | Destructive one-offs: data reset, deleting test invoices/products, restoring balances | **Yes** |
| `_lib/` | Shared helpers | — |

Every script that writes starts with `import "../_lib/require-confirm";`. It prints the target project and refuses to run without `--confirm`. Add that line to any new script that changes data.

## Rules

- Never hardcode passwords, keys or connection strings. Use `.env.local` (see `.env.example`).
- Schema changes go in `supabase/migrations/`, not in scripts.
- Prefer a test that cleans up after itself over a manual fix-up script.
