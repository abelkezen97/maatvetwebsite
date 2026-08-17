import { SupabaseClient } from "@supabase/supabase-js";
import { UserCountry, InventoryMovementType, ProductStockSummary, InventoryDashboardMetrics } from "@/types";
import { mapInventoryMovementFromDb, mapInventoryMovementToDb } from "./mappers";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Get available stock for a specific product and country.
 */
export async function getProductStock(
  supabase: SupabaseClient,
  productId: string,
  country: UserCountry
): Promise<number> {
  const client = createAdminClient() || supabase;
  const { data, error } = await client
    .from("inventory_movements")
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
    .select("id, sku, name, selling_price, stock_quantity, unit, product_categories(name)")
    .order("name", { ascending: true });

  if (prodErr) {
    console.error("Error fetching products for inventory summary:", prodErr);
    throw prodErr;
  }

  // Fetch all inventory movements
  const { data: movementsData, error: movErr } = await client
    .from("inventory_movements")
    .select("product_id, country, quantity");

  if (movErr && !movErr.message.includes("does not exist")) {
    console.error("Error fetching inventory movements:", movErr);
  }

  // Group movements by product_id and country
  const stockMap = new Map<string, { uae: number; oman: number }>();

  (movementsData || []).forEach((row: any) => {
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

    let uaeStock = stocks ? stocks.uae : 0;
    let omanStock = stocks ? stocks.oman : 0;

    if ((!movementsData || movementsData.length === 0 || !stocks) && p.stock_quantity !== undefined && p.stock_quantity !== null) {
      const fallbackQty = Number(p.stock_quantity) || 0;
      if (userCountry === "Oman") {
        omanStock = fallbackQty;
      } else {
        uaeStock = fallbackQty;
      }
    }

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
 * Record a manual or automated inventory movement.
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
    .from("inventory_movements")
    .insert([dbPayload])
    .select()
    .single();

  if (error) {
    console.error("Failed to record inventory movement:", error);
    throw new Error(`Inventory movement error: ${error.message}`);
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

  // 2. Process SALE movements
  const movements = validItems.map((item) => ({
    product_id: item.productId,
    country,
    movement_type: "SALE",
    quantity: -Math.abs(Number(item.quantity)), // SALE is deduction (-qty)
    reference_type: "INVOICE",
    reference_id: invoiceId,
    reason: `Confirmed Invoice ${invoiceNumber}`,
    notes: `Automated inventory deduction for Invoice ${invoiceNumber}`,
    created_by: userId,
  }));

  const { error: insErr } = await client.from("inventory_movements").insert(movements);
  if (insErr) {
    console.error("Error inserting invoice inventory movements:", insErr);
    throw new Error(`Failed to deduct inventory: ${insErr.message}`);
  }
}

/**
 * Reconcile inventory movements on Invoice editing.
 * Calculates net delta per product between previously posted SALE/SALE_RETURN movements for this invoice and the updated quantities.
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

  // Fetch previous inventory movements for this invoice
  const { data: prevMovements, error: prevErr } = await client
    .from("inventory_movements")
    .select("product_id, quantity")
    .eq("reference_id", invoiceId);

  if (prevErr) {
    console.error("Error fetching existing invoice movements for edit reconciliation:", prevErr);
  }

  // Calculate previously net deducted quantity per product for this invoice
  const previousNetMap = new Map<string, number>();
  (prevMovements || []).forEach((m: any) => {
    const pid = String(m.product_id);
    const current = previousNetMap.get(pid) || 0;
    // Note: quantity is negative for SALE, positive for SALE_RETURN
    // Net deducted qty = -1 * sum(quantity)
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
  const newMovementsToInsert: any[] = [];

  for (const pid of Array.from(allProductIds)) {
    // previousSum is negative (e.g. -5 for SALE of 5 units)
    const previousSum = previousNetMap.get(pid) || 0;
    // previousQty is positive (e.g. 5)
    const previousQty = Math.abs(previousSum);
    const newQty = newNetMap.get(pid)?.qty || 0;
    const prodName = newNetMap.get(pid)?.name || "Product";

    const diff = newQty - previousQty; // e.g. 8 - 5 = +3 (additional 3 units needed)

    if (diff > 0) {
      // Need additional stock: check available stock first
      const currentAvailable = await getProductStock(client, pid, country);
      if (currentAvailable < diff) {
        throw new Error(`Insufficient stock for ${prodName}. Additional quantity required: ${diff}, Available: ${currentAvailable}.`);
      }
      newMovementsToInsert.push({
        product_id: pid,
        country,
        movement_type: "SALE",
        quantity: -diff, // negative deduction
        reference_type: "INVOICE",
        reference_id: invoiceId,
        reason: `Invoice ${invoiceNumber} quantity increase (+${diff})`,
        notes: `Automated inventory adjustment on invoice edit`,
        created_by: userId,
      });
    } else if (diff < 0) {
      // Quantity decreased: return stock via SALE_RETURN (+abs(diff))
      const returnQty = Math.abs(diff);
      newMovementsToInsert.push({
        product_id: pid,
        country,
        movement_type: "SALE_RETURN",
        quantity: returnQty, // positive addition
        reference_type: "INVOICE",
        reference_id: invoiceId,
        reason: `Invoice ${invoiceNumber} quantity reduction (-${returnQty})`,
        notes: `Automated inventory return on invoice edit`,
        created_by: userId,
      });
    }
  }

  if (newMovementsToInsert.length > 0) {
    const { error: insErr } = await client.from("inventory_movements").insert(newMovementsToInsert);
    if (insErr) {
      console.error("Error inserting edit reconciliation movements:", insErr);
      throw new Error(`Failed to reconcile invoice inventory: ${insErr.message}`);
    }
  }
}

/**
 * Reverse all inventory deductions when an invoice is cancelled or soft-deleted.
 * Creates SALE_RETURN (+quantity) movements so original SALE history is never erased.
 */
export async function reverseInvoiceInventoryOnCancel(
  supabase: SupabaseClient,
  invoiceId: string,
  invoiceNumber: string,
  country: UserCountry,
  userId: string
) {
  const client = createAdminClient() || supabase;

  // Fetch all existing movements for this invoice
  const { data: existingMovements, error: fetchErr } = await client
    .from("inventory_movements")
    .select("product_id, quantity")
    .eq("reference_id", invoiceId);

  if (fetchErr || !existingMovements || existingMovements.length === 0) {
    return;
  }

  // Calculate net remaining balance per product for this invoice
  const netMap = new Map<string, number>();
  existingMovements.forEach((m: any) => {
    const pid = String(m.product_id);
    const current = netMap.get(pid) || 0;
    netMap.set(pid, current + (Number(m.quantity) || 0));
  });

  const reversalMovements: any[] = [];
  netMap.forEach((netQuantity, pid) => {
    // If netQuantity is negative (e.g. -5), we reverse with +5
    if (netQuantity < 0) {
      const returnQty = Math.abs(netQuantity);
      reversalMovements.push({
        product_id: pid,
        country,
        movement_type: "SALE_RETURN",
        quantity: returnQty,
        reference_type: "INVOICE",
        reference_id: invoiceId,
        reason: `Cancelled Invoice ${invoiceNumber}`,
        notes: `Automated inventory reversal for cancelled/deleted invoice ${invoiceNumber}`,
        created_by: userId,
      });
    }
  });

  if (reversalMovements.length > 0) {
    const { error: revErr } = await client.from("inventory_movements").insert(reversalMovements);
    if (revErr) {
      console.error("Error reversing inventory on invoice cancellation:", revErr);
      throw new Error(`Failed to reverse inventory for cancelled invoice: ${revErr.message}`);
    }
  }
}
