import { SupabaseClient } from "@supabase/supabase-js";
import { UserCountry, InventoryMovementType, ProductStockSummary, InventoryDashboardMetrics } from "@/types";
import { mapInventoryMovementFromDb, mapInventoryMovementToDb } from "./mappers";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Get available stock for a specific product and country.
 * Authoritative ledger: public.inventory_transactions
 */
export async function getProductStock(
  supabase: SupabaseClient,
  productId: string,
  country: UserCountry
): Promise<number> {
  const client = createAdminClient() || supabase;
  const { data, error } = await client
    .from("inventory_transactions")
    .select("quantity")
    .eq("product_id", productId)
    .eq("country", country);

  if (error) {
    console.error(`Error calculating stock for product ${productId} (${country}):`, error);
    return 0;
  }

  const total = (data || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  return total;
}

/**
 * Get aggregated stock summary for all active products across UAE & Oman.
 */
export async function getAllProductsStockSummary(
  supabase: SupabaseClient,
  profile?: { role: string; country: string }
): Promise<{ summaries: ProductStockSummary[]; metrics: InventoryDashboardMetrics }> {
  const client = createAdminClient() || supabase;

  // Fetch all active products with categories
  const { data: productsData, error: prodErr } = await client
    .from("products")
    .select("id, sku, name, selling_price, unit, product_categories(name)")
    .order("name", { ascending: true });

  if (prodErr) {
    console.error("Error fetching products for inventory summary:", prodErr);
    throw prodErr;
  }

  // Fetch all inventory transactions
  const { data: transactionsData, error: txErr } = await client
    .from("inventory_transactions")
    .select("product_id, country, quantity");

  if (txErr && !txErr.message.includes("does not exist")) {
    console.error("Error fetching inventory transactions:", txErr);
  }

  // Group transactions by product_id and country
  const stockMap = new Map<string, { uae: number; oman: number }>();

  (transactionsData || []).forEach((row: any) => {
    const pid = String(row.product_id);
    const countryStr = String(row.country);
    const qty = Number(row.quantity) || 0;

    if (!stockMap.has(pid)) {
      stockMap.set(pid, { uae: 0, oman: 0 });
    }
    const entry = stockMap.get(pid)!;
    if (countryStr === "Oman") {
      entry.oman += qty;
    } else {
      entry.uae += qty;
    }
  });

  let totalProducts = 0;
  let totalStockUnits = 0;
  let lowStockProducts = 0;
  let outOfStockProducts = 0;

  const isSalesperson = profile?.role === "salesperson";
  const userCountry = profile?.country;

  const summaries: ProductStockSummary[] = (productsData || []).map((p: any) => {
    totalProducts++;
    const pid = String(p.id);
    const stocks = stockMap.get(pid);

    // CRITICAL: Stock is calculated strictly from transaction ledger. No fallbacks to products.stock_quantity!
    const uaeStock = stocks ? stocks.uae : 0;
    const omanStock = stocks ? stocks.oman : 0;

    // Role-based stock visibility masking
    const visibleUaeStock = (isSalesperson && userCountry === "Oman") ? 0 : uaeStock;
    const visibleOmanStock = (isSalesperson && userCountry === "UAE") ? 0 : omanStock;
    const totalStock = isSalesperson
      ? (userCountry === "Oman" ? visibleOmanStock : visibleUaeStock)
      : uaeStock + omanStock;

    totalStockUnits += totalStock;

    let status: "IN STOCK" | "LOW STOCK" | "OUT OF STOCK" = "IN STOCK";
    if (totalStock <= 0) {
      status = "OUT OF STOCK";
      outOfStockProducts++;
    } else if (totalStock <= 10) {
      status = "LOW STOCK";
      lowStockProducts++;
    }

    const categoryObj = Array.isArray(p.product_categories) ? p.product_categories[0] : p.product_categories;
    const categoryName = categoryObj?.name || "General";

    return {
      productId: pid,
      productCode: p.sku || undefined,
      productName: p.name || "",
      category: categoryName,
      uaeStock: visibleUaeStock,
      omanStock: visibleOmanStock,
      totalStock,
      status,
      masterPrice: Number(p.selling_price) || 0,
      unit: p.unit || "Item",
    };
  });

  const metrics: InventoryDashboardMetrics = {
    totalProducts,
    totalStockUnits,
    lowStockProducts,
    outOfStockProducts,
  };

  return { summaries, metrics };
}

/**
 * Record a manual or automated inventory transaction.
 */
export async function recordInventoryMovement(
  supabase: SupabaseClient,
  payload: {
    productId: string;
    country: UserCountry;
    movementType: InventoryMovementType;
    quantity: number;
    referenceType?: string;
    referenceId?: string;
    reason?: string;
    notes?: string;
    createdBy?: string;
  }
) {
  const client = createAdminClient() || supabase;
  const dbPayload = mapInventoryMovementToDb(payload);

  const { data, error } = await client
    .from("inventory_transactions")
    .insert([dbPayload])
    .select()
    .single();

  if (error) {
    console.error("Failed to record inventory transaction:", error);
    throw new Error(`Inventory transaction error: ${error.message}`);
  }

  return mapInventoryMovementFromDb(data);
}

/**
 * Server-side atomic validation and deduction of inventory for a confirmed/posted invoice.
 */
export async function validateAndProcessInvoiceInventory(
  supabase: SupabaseClient,
  items: Array<{ productId: string; quantity: number; productName?: string }>,
  country: UserCountry,
  invoiceId: string,
  invoiceNumber: string,
  userId: string
) {
  const client = createAdminClient() || supabase;

  // Filter out items without a valid product_id or with 0 quantity
  const validItems = items.filter((item) => item.productId && Number(item.quantity) > 0);
  if (validItems.length === 0) return;

  // 1. Atomic Stock Validation (Server is source of truth)
  for (const item of validItems) {
    const currentStock = await getProductStock(client, item.productId, country);
    const requestedQty = Number(item.quantity);

    if (currentStock < requestedQty) {
      const prodName = item.productName || "Selected product";
      throw new Error(`Insufficient stock for ${prodName}. Available quantity: ${currentStock}.`);
    }
  }

  // 2. Process Sale transactions using live DB CHECK constraint value: 'Sale'
  const transactions = validItems.map((item) => ({
    product_id: item.productId,
    country,
    transaction_type: "Sale",
    quantity: -Math.abs(Number(item.quantity)), // Sale is deduction (-qty)
    reference_type: "INVOICE",
    reference_id: invoiceId,
    remarks: `Confirmed Invoice ${invoiceNumber}`,
    created_by: userId || null,
  }));

  const { error: insErr } = await client.from("inventory_transactions").insert(transactions);
  if (insErr) {
    console.error("Error inserting invoice inventory transactions:", insErr);
    throw new Error(`Failed to deduct inventory: ${insErr.message}`);
  }
}

/**
 * Reconcile inventory transactions on Invoice editing.
 * Calculates net delta per product between previously posted Sale/Return transactions for this invoice and the updated quantities.
 */
export async function reconcileInvoiceInventoryOnEdit(
  supabase: SupabaseClient,
  invoiceId: string,
  invoiceNumber: string,
  newItems: Array<{ productId: string; quantity: number; productName?: string }>,
  country: UserCountry,
  userId: string
) {
  const client = createAdminClient() || supabase;

  // Fetch previous inventory transactions for this invoice
  const { data: prevTransactions, error: prevErr } = await client
    .from("inventory_transactions")
    .select("product_id, quantity")
    .eq("reference_id", invoiceId);

  if (prevErr) {
    console.error("Error fetching existing invoice transactions for edit reconciliation:", prevErr);
  }

  // Calculate previously net deducted quantity per product for this invoice
  const previousNetMap = new Map<string, number>();
  (prevTransactions || []).forEach((m: any) => {
    const pid = String(m.product_id);
    const current = previousNetMap.get(pid) || 0;
    // Note: quantity is negative for Sale, positive for Return
    previousNetMap.set(pid, current + (Number(m.quantity) || 0));
  });

  // Calculate new requested net deducted quantity per product
  const newNetMap = new Map<string, { qty: number; name?: string }>();
  newItems.forEach((item) => {
    if (item.productId && Number(item.quantity) > 0) {
      const pid = String(item.productId);
      const existing = newNetMap.get(pid)?.qty || 0;
      newNetMap.set(pid, { qty: existing + Number(item.quantity), name: item.productName });
    }
  });

  // Determine all affected product IDs
  const allProductIds = new Set([...previousNetMap.keys(), ...newNetMap.keys()]);
  const newTransactionsToInsert: any[] = [];

  for (const pid of Array.from(allProductIds)) {
    const previousSum = previousNetMap.get(pid) || 0;
    const previousQty = Math.abs(previousSum);
    const newQty = newNetMap.get(pid)?.qty || 0;
    const prodName = newNetMap.get(pid)?.name || "Product";

    const diff = newQty - previousQty; // e.g. 8 - 5 = +3 (additional 3 units needed)

    if (diff > 0) {
      // Need additional stock: check available stock first in target country
      const currentAvailable = await getProductStock(client, pid, country);
      if (currentAvailable < diff) {
        throw new Error(`Insufficient stock for ${prodName}. Additional quantity required: ${diff}, Available: ${currentAvailable}.`);
      }
      newTransactionsToInsert.push({
        product_id: pid,
        country,
        transaction_type: "Sale",
        quantity: -diff, // negative deduction
        reference_type: "INVOICE",
        reference_id: invoiceId,
        remarks: `Invoice ${invoiceNumber} quantity increase (+${diff})`,
        created_by: userId || null,
      });
    } else if (diff < 0) {
      // Quantity decreased: return stock via Return (+abs(diff))
      const returnQty = Math.abs(diff);
      newTransactionsToInsert.push({
        product_id: pid,
        country,
        transaction_type: "Return",
        quantity: returnQty, // positive addition
        reference_type: "INVOICE",
        reference_id: invoiceId,
        remarks: `Invoice ${invoiceNumber} quantity reduction (-${returnQty})`,
        created_by: userId || null,
      });
    }
  }

  if (newTransactionsToInsert.length > 0) {
    const { error: insErr } = await client.from("inventory_transactions").insert(newTransactionsToInsert);
    if (insErr) {
      console.error("Error inserting edit reconciliation transactions:", insErr);
      throw new Error(`Failed to reconcile invoice inventory: ${insErr.message}`);
    }
  }
}

/**
 * Reverse all inventory deductions when an invoice is cancelled or soft-deleted.
 * Creates Return (+quantity) transactions so original Sale history is never erased.
 */
export async function reverseInvoiceInventoryOnCancel(
  supabase: SupabaseClient,
  invoiceId: string,
  invoiceNumber: string,
  country: UserCountry,
  userId: string
) {
  const client = createAdminClient() || supabase;

  // Fetch all existing transactions for this invoice
  const { data: existingTransactions, error: fetchErr } = await client
    .from("inventory_transactions")
    .select("product_id, quantity")
    .eq("reference_id", invoiceId);

  if (fetchErr || !existingTransactions || existingTransactions.length === 0) {
    return;
  }

  // Calculate net remaining balance per product for this invoice
  const netMap = new Map<string, number>();
  existingTransactions.forEach((m: any) => {
    const pid = String(m.product_id);
    const current = netMap.get(pid) || 0;
    netMap.set(pid, current + (Number(m.quantity) || 0));
  });

  const reversalTransactions: any[] = [];
  netMap.forEach((netQuantity, pid) => {
    // If netQuantity is negative (e.g. -5), we reverse with +5
    if (netQuantity < 0) {
      const returnQty = Math.abs(netQuantity);
      reversalTransactions.push({
        product_id: pid,
        country,
        transaction_type: "Return",
        quantity: returnQty,
        reference_type: "INVOICE",
        reference_id: invoiceId,
        remarks: `Cancelled Invoice ${invoiceNumber}`,
        created_by: userId || null,
      });
    }
  });

  if (reversalTransactions.length > 0) {
    const { error: revErr } = await client.from("inventory_transactions").insert(reversalTransactions);
    if (revErr) {
      console.error("Error reversing inventory on invoice cancellation:", revErr);
      throw new Error(`Failed to reverse inventory for cancelled invoice: ${revErr.message}`);
    }
  }
}
