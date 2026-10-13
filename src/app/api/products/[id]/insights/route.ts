import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/guard";
import { Permissions, isCountryStaff } from "@/lib/auth/permissions";
import { todayInDubai } from "@/lib/db/commission";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/:id/insights
 * How one product is selling in the user's active country: 12 months by
 * month, who buys it, who sells it (office only), the price actually charged
 * against the list price, stock on hand and how long it lasts at the current
 * pace. Salesmen see only their own invoices. Uses invoice dates.
 */

const num = (v: any) => Number(v) || 0;
const round = (n: number) => Math.round(n * 1000) / 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKeys(today: string, count: number): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { profile, supabase } = await requireAuth();
    if (!Permissions.canViewProducts(profile)) {
      return NextResponse.json({ error: "Forbidden: Cannot view products" }, { status: 403 });
    }
    const { id } = await params;
    const country = profile.country;
    const office = isCountryStaff(profile);
    const omr = country === "Oman";
    const today = todayInDubai();

    const { data: product } = await supabase
      .from("products")
      .select("id, name, cost_price, selling_price, cost_price_omr, selling_price_omr, registered_in")
      .eq("id", id)
      .maybeSingle();
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    // All sales lines of this product in this country (salesman: his own invoices).
    const lines: any[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase
        .from("invoice_items")
        .select(
          "quantity, line_total, unit_price, invoices!inner(id, invoice_number, invoice_date, customer_id, company_name, salesman_id, country, is_deleted, status)"
        )
        .eq("product_id", id)
        .eq("invoices.country", country)
        .range(from, from + 999);
      if (!office) q = q.eq("invoices.salesman_id", profile.id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      lines.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const sales = lines
      .filter((l) => l.invoices && l.invoices.is_deleted !== true && l.invoices.status !== "Cancelled")
      .map((l) => ({
        invoiceId: l.invoices.id,
        invoiceNumber: l.invoices.invoice_number,
        date: String(l.invoices.invoice_date || "").slice(0, 10),
        customerId: l.invoices.customer_id,
        companyName: l.invoices.company_name || "",
        salesmanId: l.invoices.salesman_id,
        qty: num(l.quantity),
        value: num(l.line_total),
        unitPrice: num(l.unit_price),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    // Current names for customers and salesmen.
    const customerIds = Array.from(new Set(sales.map((s) => s.customerId).filter(Boolean)));
    const customerNames = new Map<string, string>();
    for (let i = 0; i < customerIds.length; i += 200) {
      const { data } = await supabase.from("customers").select("id, company_name").in("id", customerIds.slice(i, i + 200));
      (data || []).forEach((c: any) => customerNames.set(c.id, c.company_name));
    }
    const { data: people } = await supabase.from("profiles").select("id, full_name");
    const peopleNames = new Map<string, string>((people || []).map((p: any) => [p.id, String(p.full_name || "—")]));
    const customerName = (s: { customerId: string; companyName: string }) =>
      customerNames.get(s.customerId) || s.companyName || "Customer";

    // Months (last 12, oldest first).
    const keys = monthKeys(today, 12);
    const start12 = `${keys[0]}-01`;
    const byMonth = new Map(keys.map((k) => [k, { units: 0, free: 0, value: 0, invoices: new Set<string>() }]));
    const last12 = sales.filter((s) => s.date >= start12);
    last12.forEach((s) => {
      const m = byMonth.get(s.date.slice(0, 7));
      if (!m) return;
      m.units += s.qty;
      m.value += s.value;
      if (s.value === 0) m.free += s.qty;
      m.invoices.add(s.invoiceId);
    });
    const months = keys.map((k) => {
      const m = byMonth.get(k)!;
      const paid = m.units - m.free;
      return {
        month: k,
        label: `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`,
        units: m.units,
        free: m.free,
        value: round(m.value),
        invoices: m.invoices.size,
        avgPrice: paid > 0 ? round(m.value / paid) : null,
      };
    });

    // Previous 12 months, for comparison.
    const startPrev = `${monthKeys(addDays(start12, -1), 12)[0]}-01`;
    const prev12 = sales.filter((s) => s.date >= startPrev && s.date < start12);

    const sum = (list: typeof sales, f: (s: (typeof sales)[number]) => number) => list.reduce((t, s) => t + f(s), 0);
    const units12 = sum(last12, (s) => s.qty);
    const free12 = sum(last12, (s) => (s.value === 0 ? s.qty : 0));
    const value12 = sum(last12, (s) => s.value);
    const valuePrev = sum(prev12, (s) => s.value);

    // Who buys it (12 months).
    const custAgg = new Map<string, { id: string; name: string; units: number; value: number; invoices: Set<string>; last: string }>();
    last12.forEach((s) => {
      const key = s.customerId || s.companyName;
      const c = custAgg.get(key) || { id: s.customerId, name: customerName(s), units: 0, value: 0, invoices: new Set<string>(), last: "" };
      c.units += s.qty;
      c.value += s.value;
      c.invoices.add(s.invoiceId);
      if (s.date > c.last) c.last = s.date;
      custAgg.set(key, c);
    });
    const customers = Array.from(custAgg.values())
      .map((c) => ({ id: c.id, name: c.name, units: c.units, value: round(c.value), invoices: c.invoices.size, lastDate: c.last }))
      .sort((a, b) => b.value - a.value || b.units - a.units);
    const repeatCustomers = customers.filter((c) => c.invoices > 1).length;

    // Who sells it (office only).
    let salesmen: { name: string; units: number; value: number }[] | null = null;
    if (office) {
      const sm = new Map<string, { name: string; units: number; value: number }>();
      last12.forEach((s) => {
        const row = sm.get(s.salesmanId) || { name: peopleNames.get(s.salesmanId) || "—", units: 0, value: 0 };
        row.units += s.qty;
        row.value += s.value;
        sm.set(s.salesmanId, row);
      });
      salesmen = Array.from(sm.values())
        .map((r) => ({ ...r, value: round(r.value) }))
        .sort((a, b) => b.value - a.value);
    }

    // Stock and how long it lasts at the pace of the last 90 days.
    const { data: moves } = await supabase.from("inventory_transactions").select("quantity").eq("product_id", id).eq("country", country);
    const stock = (moves || []).reduce((t: number, m: any) => t + num(m.quantity), 0);
    const since90 = addDays(today, -89);
    const units90 = sum(
      sales.filter((s) => s.date >= since90),
      (s) => s.qty
    );
    const perDay = units90 / 90;
    const daysOfStock = perDay > 0 ? Math.floor(stock / perDay) : null;

    const listPrice = num(omr ? product.selling_price_omr : product.selling_price);
    const cost = num(omr ? product.cost_price_omr : product.cost_price);
    const paidUnits12 = units12 - free12;
    const avgPrice12 = paidUnits12 > 0 ? value12 / paidUnits12 : null;

    return NextResponse.json({
      country,
      office,
      today,
      price: {
        list: round(listPrice),
        cost: office ? round(cost) : null,
        average: avgPrice12 !== null ? round(avgPrice12) : null,
        marginPct: office && cost > 0 && avgPrice12 ? round(((avgPrice12 - cost) / avgPrice12) * 100) : null,
      },
      totals: {
        value12: round(value12),
        valuePrev12: round(valuePrev),
        units12,
        free12,
        invoices12: new Set(last12.map((s) => s.invoiceId)).size,
        customers12: customers.length,
        repeatCustomers,
        lastSale: sales[0]?.date || null,
        lifetimeUnits: sum(sales, (s) => s.qty),
      },
      stock: { onHand: stock, unitsLast90: units90, daysOfStock },
      months,
      customers,
      salesmen,
      recent: sales.slice(0, 15).map((s) => ({
        date: s.date,
        invoiceNumber: s.invoiceNumber,
        customer: customerName(s),
        qty: s.qty,
        unitPrice: round(s.unitPrice),
        value: round(s.value),
      })),
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error building product insights:", error);
    return NextResponse.json({ error: error.message || "Could not load product insights" }, { status: 500 });
  }
}
