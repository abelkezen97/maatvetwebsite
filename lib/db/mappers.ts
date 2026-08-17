import {
  Customer,
  Product,
  ProductCategory,
  Quote,
  QuoteItem,
  QuoteStatus,
  Invoice,
  Receipt,
  Expense,
  ExpenseCategory,
  ExpensePaymentMethod,
  ApprovalStatus,
  CashHandover,
  SalespersonOpeningBalance,
  InventoryMovement,
  InventoryMovementType,
  Settings,
  DocumentSettings,
  UserCountry,
} from "@/types";

/**
 * CUSTOMER MAPPERS
 * Database columns: id, customer_code, company_name, doctor_name, email, phone, address, city, country, credit_limit, pending_balance, assigned_salesman_id, is_active, notes, created_at, updated_at
 */
export function mapCustomerFromDb(row: any, salesmanMap?: Map<string, string>): Customer {
  const doctorName = row.doctor_name || "";
  const companyName = row.company_name || "";
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";
  const rawProfiles = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const salesmanName =
    rawProfiles?.full_name ||
    row.assigned_salesman?.full_name ||
    (row.assigned_salesman_id && salesmanMap?.get(row.assigned_salesman_id)) ||
    undefined;

  const numOpening = row.opening_balance !== undefined && row.opening_balance !== null ? Number(row.opening_balance) : 0;
  const numPending = row.pending_balance !== undefined && row.pending_balance !== null ? Number(row.pending_balance) : 0;
  const openingBalance = numOpening > 0 ? numOpening : (numPending > 0 ? numPending : numOpening);

  return {
    id: row.id ? String(row.id) : `cust-${Date.now()}`,
    customerCode: row.customer_code || "",
    name: doctorName,
    doctorName: doctorName,
    company: companyName,
    companyName: companyName,
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    city: row.city || "",
    country: countryVal,
    assignedSalesmanId: row.assigned_salesman_id || undefined,
    assignedSalesmanName: salesmanName,
    creditLimit:
      typeof row.credit_limit === "number"
        ? row.credit_limit
        : parseFloat(row.credit_limit) || 0,
    openingBalance: openingBalance,
    pendingBillwiseAmount:
      typeof row.pending_balance === "number"
        ? row.pending_balance
        : parseFloat(row.pending_balance) || 0,
    notes: row.notes || "",
    is_active: row.is_active !== false,
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || undefined,
  };
}

export function mapCustomerToDb(customer: Partial<Customer>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (customer.company || customer.companyName) {
    payload.company_name = customer.company || customer.companyName;
  }
  if (customer.doctorName !== undefined || customer.name !== undefined) {
    payload.doctor_name = customer.doctorName || customer.name || "";
  }
  if (customer.customerCode !== undefined) {
    payload.customer_code = customer.customerCode;
  }
  if (customer.country !== undefined) {
    payload.country = customer.country === "Oman" ? "Oman" : "UAE";
  }
  if (customer.assignedSalesmanId !== undefined) {
    payload.assigned_salesman_id = customer.assignedSalesmanId || null;
  }

  if (customer.email !== undefined) payload.email = customer.email;
  if (customer.phone !== undefined) payload.phone = customer.phone;
  if (customer.address !== undefined) payload.address = customer.address;
  if (customer.city !== undefined) payload.city = customer.city;
  if (customer.openingBalance !== undefined) {
    payload.opening_balance = Number(customer.openingBalance) || 0;
  }
  if (customer.pendingBillwiseAmount !== undefined) {
    payload.pending_balance = Number(customer.pendingBillwiseAmount) || 0;
  }
  if (customer.creditLimit !== undefined) {
    payload.credit_limit = Number(customer.creditLimit) || 0;
  }
  if (customer.notes !== undefined) payload.notes = customer.notes;
  if (customer.is_active !== undefined) payload.is_active = customer.is_active;

  return payload;
}

/**
 * PRODUCT MAPPERS
 * Database columns: id, sku, barcode, name, category_id, selling_price, cost_price, price_10, price_50, price_100, unit, brand, manufacturer, description, is_active, created_at, updated_at
 * Relational joins: product_categories(id, name)
 */
export function mapProductFromDb(row: any, categoryMap?: Map<string, string>): Product {
  const prodCatRaw = row.product_categories;
  const prodCatObj = Array.isArray(prodCatRaw) ? prodCatRaw[0] : prodCatRaw;

  let categoryName = prodCatObj?.name || row.category_name || row.category;
  if (!categoryName && row.category_id && categoryMap) {
    categoryName = categoryMap.get(row.category_id);
  }
  if (!categoryName) {
    categoryName = "General";
  }

  const sellingPrice =
    typeof row.selling_price === "number"
      ? row.selling_price
      : parseFloat(row.selling_price) || 0;

  return {
    id: row.id ? String(row.id) : `prod-${Date.now()}`,
    productCode: row.sku || row.product_code || undefined,
    sku: row.sku || "",
    barcode: row.barcode || "",
    name: row.name || "",
    categoryId: row.category_id || undefined,
    category_id: row.category_id || undefined,
    category: categoryName,
    categoryObj: prodCatObj ? { id: prodCatObj.id || row.category_id, name: prodCatObj.name } : undefined,
    price: sellingPrice,
    sellingPrice: sellingPrice,
    costPrice: row.cost_price !== null && row.cost_price !== undefined ? Number(row.cost_price) : undefined,
    price10: row.price_10 !== null && row.price_10 !== undefined ? Number(row.price_10) : undefined,
    price50: row.price_50 !== null && row.price_50 !== undefined ? Number(row.price_50) : undefined,
    price100: row.price_100 !== null && row.price_100 !== undefined ? Number(row.price_100) : undefined,
    unit: row.unit || "Item",
    brand: row.brand || row.manufacturer || "",
    manufacturer: row.manufacturer || row.brand || "",
    description: row.description || "",
    isAvailable: row.is_active !== false,
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

export function mapProductToDb(product: Partial<Product>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (product.sku !== undefined || product.productCode !== undefined) {
    const rawSku = (product.sku ?? product.productCode);
    payload.sku = (rawSku && String(rawSku).trim()) ? String(rawSku).trim() : null;
  }
  if (product.barcode !== undefined) {
    const rawBarcode = product.barcode;
    payload.barcode = (rawBarcode && String(rawBarcode).trim()) ? String(rawBarcode).trim() : null;
  }
  if (product.name !== undefined) payload.name = product.name;
  if (product.categoryId !== undefined) payload.category_id = product.categoryId;
  if (product.price !== undefined || product.sellingPrice !== undefined) {
    payload.selling_price = Number(product.price ?? product.sellingPrice) || 0;
  }
  if (product.costPrice !== undefined) payload.cost_price = Number(product.costPrice);
  if (product.price10 !== undefined) payload.price_10 = product.price10;
  if (product.price50 !== undefined) payload.price_50 = product.price50;
  if (product.price100 !== undefined) payload.price_100 = product.price100;
  if (product.unit !== undefined) payload.unit = product.unit;
  if (product.packSize !== undefined || product.unit !== undefined) {
    payload.pack_size = product.packSize ?? product.unit ?? "1";
  }
  if (product.brand !== undefined) payload.brand = product.brand;
  if (product.manufacturer !== undefined) payload.manufacturer = product.manufacturer;
  if (product.description !== undefined) payload.description = product.description;
  if (product.isAvailable !== undefined) payload.is_active = product.isAvailable;
  return payload;
}

/**
 * QUOTATION & QUOTATION ITEM MAPPERS
 * Database columns:
 *   quotations: id, quotation_number, customer_id, quotation_date, subtotal, discount_total, vat_total, grand_total, status, notes, salesman_id, country, is_deleted, deleted_at, deleted_by, created_by, updated_by, created_at, updated_at
 *   quotation_items: id, quotation_id, product_id, quantity, unit_price, discount, line_total, created_at
 */
export function mapQuoteItemFromDb(row: any): QuoteItem {
  const unitPrice = Number(row.unit_price) || 0;
  const discountAmount = Number(row.discount) || 0;
  const qty = Number(row.quantity) || 0;
  const effectiveUnitPrice = Math.max(0, unitPrice - discountAmount);
  const lineTotal = row.line_total !== undefined && row.line_total !== null
    ? Number(row.line_total)
    : qty * effectiveUnitPrice;

  return {
    id: row.id ? String(row.id) : undefined,
    quotationId: row.quotation_id ? String(row.quotation_id) : undefined,
    productId: row.product_id ? String(row.product_id) : "",
    productName: row.products?.name || row.product_name || row.description || "Product",
    quantity: qty,
    price: unitPrice,
    discount: discountAmount,
    discountPrice: discountAmount > 0 ? effectiveUnitPrice : undefined,
    manualDiscount: discountAmount > 0 ? effectiveUnitPrice : undefined,
    total: lineTotal,
  };
}

export function mapQuoteFromDb(row: any, salesmanMap?: Map<string, string>): Quote {
  const items: QuoteItem[] = (row.quotation_items || []).map(mapQuoteItemFromDb);
  const subtotal = Number(row.subtotal) || 0;
  const grandTotal = Number(row.grand_total) || Number(row.total_amount) || subtotal;

  const doctorName = row.customers?.doctor_name || row.customer_name || "";
  const companyName = row.customers?.company_name || row.company_name || "";
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";

  let mappedStatus: QuoteStatus = "Draft";
  if (row.status === "Sent") mappedStatus = "Sent";
  else if (row.status === "Approved") mappedStatus = "Approved";
  else if (row.status === "Rejected") mappedStatus = "Rejected";
  else mappedStatus = "Draft";

  const rawSalesman = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const salesmanName =
    rawSalesman?.full_name ||
    row.salesman_name ||
    (row.salesman_id && salesmanMap?.get(row.salesman_id)) ||
    "Salesperson";

  return {
    id: row.id ? String(row.id) : `q-${Date.now()}`,
    quoteNumber: row.quotation_number || "",
    customerId: row.customer_id || "",
    customerName: doctorName || companyName || "Customer",
    companyName: companyName || doctorName || "Clinic",
    salesmanId: row.salesman_id || "",
    salesmanName: salesmanName,
    country: countryVal,
    date: row.quotation_date
      ? String(row.quotation_date).split("T")[0]
      : row.created_at
      ? String(row.created_at).split("T")[0]
      : new Date().toISOString().split("T")[0],
    items,
    subtotal: subtotal,
    discountTotal: Number(row.discount_total) || 0,
    taxTotal: Number(row.vat_total) || Number(row.vat_amount) || 0,
    grandTotal: grandTotal,
    status: mappedStatus,
    notes: row.notes || "",
    showBasePrice: true,
    footerText: "This is a computer generated quote. Pricing valid for 30 days.",
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
    createdBy: row.created_by || undefined,
    createdByName: (row.created_by && salesmanMap?.get(row.created_by)) || row.created_by_name || undefined,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at || "",
  };
}

export function mapQuoteToDb(quote: Partial<Quote>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (quote.quoteNumber !== undefined) payload.quotation_number = quote.quoteNumber;
  if (quote.customerId !== undefined) payload.customer_id = quote.customerId || null;
  if (quote.date !== undefined) payload.quotation_date = quote.date;
  if (quote.subtotal !== undefined) payload.subtotal = Number(quote.subtotal);
  if (quote.discountTotal !== undefined) payload.discount_total = Number(quote.discountTotal);
  if (quote.taxTotal !== undefined) payload.vat_total = Number(quote.taxTotal);
  if (quote.grandTotal !== undefined) payload.grand_total = Number(quote.grandTotal);
  if (quote.status !== undefined) payload.status = quote.status;
  if (quote.notes !== undefined) payload.notes = quote.notes;
  if (quote.salesmanId !== undefined) payload.salesman_id = quote.salesmanId;
  if (quote.country !== undefined) payload.country = quote.country === "Oman" ? "Oman" : "UAE";
  payload.updated_at = new Date().toISOString();
  return payload;
}

export function mapQuoteItemToDb(item: Partial<QuoteItem>, quotationId?: string): Record<string, any> {
  const payload: Record<string, any> = {};
  if (quotationId) payload.quotation_id = quotationId;
  else if (item.quotationId) payload.quotation_id = item.quotationId;
  if (item.productId) payload.product_id = item.productId;
  if (item.quantity !== undefined) payload.quantity = Number(item.quantity);
  if (item.price !== undefined) payload.unit_price = Number(item.price);
  if (item.discount !== undefined) payload.discount = Number(item.discount);
  if (item.total !== undefined) payload.line_total = Number(item.total);
  return payload;
}

/**
 * INVOICE & INVOICE ITEM MAPPERS
 * Database columns:
 *   invoices: id, invoice_number, quote_number, customer_id, customer_name, company_name, salesman_name, issue_date, total_amount, subtotal, discount_total, vat_amount, status, credit_days, notes, country, is_deleted, deleted_at, deleted_by, created_by, updated_by, created_at, updated_at
 *   invoice_items: id, invoice_id, product_id, description, quantity, unit_price, total_price
 */
export function mapInvoiceFromDb(row: any, salesmanMap?: Map<string, string>): Invoice {
  const items: QuoteItem[] = (row.invoice_items || []).map((ii: any) => {
    const prodObj = Array.isArray(ii.products) ? ii.products[0] : ii.products;
    const productName = prodObj?.name || ii.description || (ii.product_id ? "Product" : "Product unavailable");
    const unitPrice = Number(ii.unit_price) || 0;
    const discountAmount = Number(ii.discount) || 0;
    const qty = Number(ii.quantity) || 0;
    const effectiveUnitPrice = Math.max(0, unitPrice - discountAmount);
    const lineTotal = ii.line_total !== undefined && ii.line_total !== null
      ? Number(ii.line_total)
      : qty * effectiveUnitPrice;

    return {
      id: ii.id ? String(ii.id) : undefined,
      productId: ii.product_id ? String(ii.product_id) : "",
      productName,
      quantity: qty,
      price: unitPrice,
      discount: discountAmount,
      discountPrice: discountAmount > 0 ? effectiveUnitPrice : undefined,
      manualDiscount: discountAmount > 0 ? effectiveUnitPrice : undefined,
      total: lineTotal,
    };
  });

  const grandTotal = Number(row.grand_total) || 0;
  const doctorName = row.customers?.doctor_name || "";
  const companyName = row.customers?.company_name || "";
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";

  const rawSalesman = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const salesmanName =
    rawSalesman?.full_name ||
    row.salesman_name ||
    row.salesmanName ||
    (row.salesman_id && salesmanMap?.get(row.salesman_id)) ||
    (row.customers?.assigned_salesman_id && salesmanMap?.get(row.customers.assigned_salesman_id)) ||
    "Salesperson";

  return {
    id: row.id ? String(row.id) : `inv-${Date.now()}`,
    invoiceNumber: row.invoice_number || "",
    quoteNumber: row.quotations?.quotation_number || undefined,
    customerId: row.customer_id || "",
    customerName: doctorName || "Customer",
    companyName: companyName || "Clinic",
    salesmanId: row.salesman_id || "",
    salesmanName: salesmanName,
    country: countryVal,
    date: row.created_at ? String(row.created_at).split("T")[0] : new Date().toISOString().split("T")[0],
    items,
    subtotal: Number(row.subtotal) || grandTotal,
    discountTotal: Number(row.discount_total) || 0,
    taxTotal: Number(row.vat_total) || 0,
    grandTotal: grandTotal,
    status: (row.status as any) || (row.credit_days && Number(row.credit_days) > 0 ? "Credit" : "Paid"),
    paymentMethod: row.payment_method || row.paymentMethod || undefined,
    creditDays: row.credit_days !== null && row.credit_days !== undefined ? Number(row.credit_days) : undefined,
    notes: row.notes || "",
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
    createdBy: row.created_by || undefined,
    createdByName: (row.created_by && salesmanMap?.get(row.created_by)) || row.created_by_name || undefined,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at || "",
  };
}

export function mapInvoiceToDb(invoice: Partial<Invoice>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (invoice.invoiceNumber !== undefined) payload.invoice_number = invoice.invoiceNumber;
  if (invoice.customerId !== undefined) payload.customer_id = invoice.customerId || null;
  if (invoice.salesmanId !== undefined) payload.salesman_id = invoice.salesmanId;
  if (invoice.subtotal !== undefined) payload.subtotal = Number(invoice.subtotal);
  if (invoice.discountTotal !== undefined) payload.discount_total = Number(invoice.discountTotal);
  if (invoice.taxTotal !== undefined) payload.vat_total = Number(invoice.taxTotal);
  if (invoice.grandTotal !== undefined) payload.grand_total = Number(invoice.grandTotal);
  if (invoice.status !== undefined) payload.status = invoice.status;
  if (invoice.creditDays !== undefined) payload.credit_days = Number(invoice.creditDays);
  if (invoice.notes !== undefined) payload.notes = invoice.notes;
  if (invoice.country !== undefined) payload.country = invoice.country === "Oman" ? "Oman" : "UAE";
  payload.updated_at = new Date().toISOString();
  return payload;
}

/**
 * RECEIPT MAPPERS
 * Database columns: id, receipt_number, customer_id, customer_name, company_name, invoice_id, amount_paid, remaining_balance, payment_date, payment_method, reference_no, reference_number, notes, country, is_deleted, deleted_at, deleted_by, created_by, updated_at, created_at
 */
export function mapReceiptFromDb(row: any, salesmanMap?: Map<string, string>): Receipt {
  const doctorName = row.customers?.doctor_name || row.customer_name || "";
  const companyName = row.customers?.company_name || row.company_name || "";
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";

  return {
    id: row.id ? String(row.id) : `rec-${Date.now()}`,
    receiptNumber: row.receipt_number || "",
    customerId: row.customer_id || "",
    customerName: doctorName || "Customer",
    companyName: companyName || "Clinic",
    invoiceId: row.invoice_id || undefined,
    amountPaid: typeof row.amount_paid === "number" ? row.amount_paid : parseFloat(row.amount_paid) || 0,
    remainingPendingAmount: row.customers?.pending_balance !== undefined ? Number(row.customers.pending_balance) : undefined,
    paymentDate: row.payment_date ? String(row.payment_date).split("T")[0] : (row.created_at ? row.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
    paymentMethod: (row.payment_method || "Cash") as any,
    referenceNo: row.reference_number || row.reference_no || "",
    notes: row.notes || "",
    country: countryVal,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
    createdBy: row.created_by || "",
    createdByName: (row.created_by && salesmanMap?.get(row.created_by)) || row.created_by_name || undefined,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at || "",
  };
}

export function mapReceiptToDb(receipt: Partial<Receipt>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (receipt.receiptNumber !== undefined) payload.receipt_number = receipt.receiptNumber;
  if (receipt.customerId !== undefined) payload.customer_id = receipt.customerId || null;
  if (receipt.invoiceId !== undefined) payload.invoice_id = receipt.invoiceId || null;
  if (receipt.amountPaid !== undefined) payload.amount_paid = Number(receipt.amountPaid);
  if (receipt.paymentDate !== undefined) payload.payment_date = receipt.paymentDate;
  if (receipt.paymentMethod !== undefined) payload.payment_method = receipt.paymentMethod;
  if (receipt.referenceNo !== undefined) payload.reference_number = receipt.referenceNo;
  if (receipt.notes !== undefined) payload.notes = receipt.notes;
  if (receipt.createdBy !== undefined) payload.created_by = receipt.createdBy || null;
  if (receipt.country !== undefined) payload.country = receipt.country === "Oman" ? "Oman" : "UAE";
  payload.updated_at = new Date().toISOString();
  return payload;
}

/**
 * EXPENSE MAPPERS
 * Database columns: id, expense_number, expense_date, salesperson_id, employee_id, category, amount, payment_method, description, attachment_url, receipt_url, country, status, rejection_reason, created_by, approved_by, approved_at, rejected_by, rejected_at, is_deleted, deleted_at, deleted_by, created_at, updated_at
 */
export function mapExpenseFromDb(row: any, userMap?: Map<string, string>): Expense {
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";
  const salespersonId = row.salesperson_id || row.employee_id || row.created_by || "";
  const rawSalesperson = Array.isArray(row.salesperson) ? row.salesperson[0] : row.salesperson;
  const salespersonName =
    rawSalesperson?.full_name ||
    (salespersonId && userMap?.get(salespersonId)) ||
    "Salesperson";

  const rawCreator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
  const creatorName =
    rawCreator?.full_name ||
    (row.created_by && userMap?.get(row.created_by)) ||
    undefined;

  const rawApprover = Array.isArray(row.approver) ? row.approver[0] : row.approver;
  const approverName =
    rawApprover?.full_name ||
    (row.approved_by && userMap?.get(row.approved_by)) ||
    undefined;

  const rawRejector = Array.isArray(row.rejector) ? row.rejector[0] : row.rejector;
  const rejectorName =
    rawRejector?.full_name ||
    (row.rejected_by && userMap?.get(row.rejected_by)) ||
    undefined;

  let mappedMethod = row.payment_method;
  if (!mappedMethod && row.description && row.description.includes("[Payment Method: ")) {
    const match = row.description.match(/\[Payment Method: ([^\]]+)\]/);
    if (match) mappedMethod = match[1];
  }

  return {
    id: row.id ? String(row.id) : `exp-${Date.now()}`,
    expenseNumber: row.expense_number || row.reference_no || `EXP-${row.id ? String(row.id).slice(0, 8) : Date.now()}`,
    expenseDate: row.expense_date || (row.created_at ? row.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
    salespersonId,
    salespersonName,
    category: (row.category || "Miscellaneous") as ExpenseCategory,
    amount: typeof row.amount === "number" ? row.amount : parseFloat(row.amount) || 0,
    paymentMethod: (mappedMethod || "Cash") as ExpensePaymentMethod,
    description: row.description || "",
    attachmentUrl: row.attachment_url || row.receipt_url || "",
    country: countryVal,
    status: (row.status || "Pending") as ApprovalStatus,
    rejectionReason: row.rejection_reason || "",
    approvedBy: row.approved_by || undefined,
    approvedByName: approverName,
    approvedAt: row.approved_at || undefined,
    rejectedBy: row.rejected_by || undefined,
    rejectedByName: rejectorName,
    rejectedAt: row.rejected_at || undefined,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
    createdBy: row.created_by || undefined,
    createdByName: creatorName,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || undefined,
  };
}

export function mapExpenseToDb(expense: Partial<Expense>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (expense.expenseNumber !== undefined) payload.expense_number = expense.expenseNumber;
  if (expense.expenseDate !== undefined) payload.expense_date = expense.expenseDate;
  if (expense.salespersonId !== undefined) {
    payload.salesperson_id = expense.salespersonId;
    payload.employee_id = expense.salespersonId; // legacy compatibility fallback
  }
  if (expense.category !== undefined) payload.category = expense.category;
  if (expense.amount !== undefined) payload.amount = Number(expense.amount);
  if (expense.paymentMethod !== undefined) payload.payment_method = expense.paymentMethod;
  if (expense.description !== undefined) payload.description = expense.description;
  if (expense.attachmentUrl !== undefined) {
    payload.receipt_url = expense.attachmentUrl;
  }
  if (expense.country !== undefined) payload.country = expense.country === "Oman" ? "Oman" : "UAE";
  if (expense.status !== undefined) payload.status = expense.status;
  if (expense.rejectionReason !== undefined) payload.rejection_reason = expense.rejectionReason;
  if (expense.approvedBy !== undefined) payload.approved_by = expense.approvedBy;
  if (expense.approvedAt !== undefined) payload.approved_at = expense.approvedAt;
  if (expense.rejectedBy !== undefined) payload.rejected_by = expense.rejectedBy;
  if (expense.rejectedAt !== undefined) payload.rejected_at = expense.rejectedAt;
  if (expense.createdBy !== undefined) payload.created_by = expense.createdBy;
  if (expense.updatedBy !== undefined) payload.updated_by = expense.updatedBy;
  payload.updated_at = new Date().toISOString();
  return payload;
}

/**
 * CASH HANDOVER MAPPERS
 * Database columns: id, handover_number, handover_date, salesperson_id, received_by, amount, reference_number, notes, country, status, rejection_reason, created_by, approved_by, approved_at, rejected_by, rejected_at, is_deleted, deleted_at, deleted_by, created_at, updated_at
 */
export function mapHandoverFromDb(row: any, userMap?: Map<string, string>): CashHandover {
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";
  const salespersonId = row.salesperson_id || row.created_by || "";
  const rawSalesperson = Array.isArray(row.salesperson) ? row.salesperson[0] : row.salesperson;
  const salespersonName =
    rawSalesperson?.full_name ||
    (salespersonId && userMap?.get(salespersonId)) ||
    "Salesperson";

  const rawRecipient = Array.isArray(row.recipient) ? row.recipient[0] : row.recipient;
  const recipientName =
    rawRecipient?.full_name ||
    (row.received_by && userMap?.get(row.received_by)) ||
    "Accountant / Admin";

  const rawCreator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
  const creatorName =
    rawCreator?.full_name ||
    (row.created_by && userMap?.get(row.created_by)) ||
    undefined;

  const rawApprover = Array.isArray(row.approver) ? row.approver[0] : row.approver;
  const approverName =
    rawApprover?.full_name ||
    (row.approved_by && userMap?.get(row.approved_by)) ||
    undefined;

  return {
    id: row.id ? String(row.id) : `ch-${Date.now()}`,
    handoverNumber: row.handover_number || `CH-${row.id ? String(row.id).slice(0, 8) : Date.now()}`,
    handoverDate: row.handover_date || (row.created_at ? row.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
    salespersonId,
    salespersonName,
    receivedBy: row.received_by || "",
    receivedByName: recipientName,
    amount: typeof row.amount === "number" ? row.amount : parseFloat(row.amount) || 0,
    referenceNumber: row.reference_number || "",
    notes: row.notes || "",
    country: countryVal,
    status: (row.status || "Pending") as ApprovalStatus,
    rejectionReason: row.rejection_reason || "",
    approvedBy: row.approved_by || undefined,
    approvedByName: approverName,
    approvedAt: row.approved_at || undefined,
    rejectedBy: row.rejected_by || undefined,
    rejectedAt: row.rejected_at || undefined,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
    createdBy: row.created_by || undefined,
    createdByName: creatorName,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || undefined,
  };
}

export function mapHandoverToDb(handover: Partial<CashHandover>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (handover.handoverNumber !== undefined) payload.handover_number = handover.handoverNumber;
  if (handover.handoverDate !== undefined) payload.handover_date = handover.handoverDate;
  if (handover.salespersonId !== undefined) payload.salesperson_id = handover.salespersonId;
  if (handover.receivedBy !== undefined) payload.received_by = handover.receivedBy;
  if (handover.amount !== undefined) payload.amount = Number(handover.amount);
  if (handover.referenceNumber !== undefined) payload.reference_number = handover.referenceNumber;
  if (handover.notes !== undefined) payload.notes = handover.notes;
  if (handover.country !== undefined) payload.country = handover.country === "Oman" ? "Oman" : "UAE";
  if (handover.status !== undefined) payload.status = handover.status;
  if (handover.rejectionReason !== undefined) payload.rejection_reason = handover.rejectionReason;
  if (handover.approvedBy !== undefined) payload.approved_by = handover.approvedBy;
  if (handover.approvedAt !== undefined) payload.approved_at = handover.approvedAt;
  if (handover.rejectedBy !== undefined) payload.rejected_by = handover.rejectedBy;
  if (handover.rejectedAt !== undefined) payload.rejected_at = handover.rejectedAt;
  if (handover.createdBy !== undefined) payload.created_by = handover.createdBy;
  if (handover.updatedBy !== undefined) payload.updated_by = handover.updatedBy;
  payload.updated_at = new Date().toISOString();
  return payload;
}

/**
 * SALESPERSON OPENING BALANCE MAPPERS
 */
export function mapOpeningBalanceFromDb(row: any, userMap?: Map<string, string>): SalespersonOpeningBalance {
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";
  const salespersonId = row.salesperson_id || "";
  const rawSalesperson = Array.isArray(row.salesperson) ? row.salesperson[0] : row.salesperson;
  const salespersonName =
    rawSalesperson?.full_name ||
    (salespersonId && userMap?.get(salespersonId)) ||
    "Salesperson";

  return {
    id: row.id ? String(row.id) : `ob-${Date.now()}`,
    salespersonId,
    salespersonName,
    effectiveDate: row.effective_date || (row.created_at ? row.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
    openingCash: typeof row.opening_cash === "number" ? row.opening_cash : parseFloat(row.opening_cash) || 0,
    notes: row.notes || "",
    country: countryVal,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || undefined,
  };
}

export function mapOpeningBalanceToDb(ob: Partial<SalespersonOpeningBalance>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (ob.salespersonId !== undefined) payload.salesperson_id = ob.salespersonId;
  if (ob.effectiveDate !== undefined) payload.effective_date = ob.effectiveDate;
  if (ob.openingCash !== undefined) payload.opening_cash = Number(ob.openingCash);
  if (ob.notes !== undefined) payload.notes = ob.notes;
  if (ob.country !== undefined) payload.country = ob.country === "Oman" ? "Oman" : "UAE";
  if (ob.createdBy !== undefined) payload.created_by = ob.createdBy;
  payload.updated_at = new Date().toISOString();
  return payload;
}

/**
 * INVENTORY MOVEMENT MAPPERS
 * Database columns: id, product_id, country, movement_type, quantity, reference_type, reference_id, reason, notes, created_by, created_at
 * Relational joins: products(name, product_code), profiles(full_name)
 */
export function mapInventoryMovementFromDb(row: any, userMap?: Map<string, string>): InventoryMovement {
  const countryVal: UserCountry = row.country === "Oman" ? "Oman" : "UAE";
  const rawProd = Array.isArray(row.products) ? row.products[0] : row.products;
  const rawCreator = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const createdByName =
    rawCreator?.full_name ||
    (row.created_by && userMap?.get(row.created_by)) ||
    undefined;

  return {
    id: row.id ? String(row.id) : `im-${Date.now()}`,
    productId: row.product_id ? String(row.product_id) : "",
    productName: rawProd?.name || row.product_name || "",
    productCode: rawProd?.sku || rawProd?.product_code || row.product_code || undefined,
    country: countryVal,
    movementType: (row.movement_type || "ADJUSTMENT_IN") as InventoryMovementType,
    quantity: Number(row.quantity) || 0,
    referenceType: row.reference_type || undefined,
    referenceId: row.reference_id || undefined,
    reason: row.reason || undefined,
    notes: row.notes || undefined,
    createdBy: row.created_by || undefined,
    createdByName,
    createdAt: row.created_at || "",
  };
}

export function mapInventoryMovementToDb(mv: Partial<InventoryMovement>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (mv.productId !== undefined) payload.product_id = mv.productId;
  if (mv.country !== undefined) payload.country = mv.country === "Oman" ? "Oman" : "UAE";
  if (mv.movementType !== undefined) payload.movement_type = mv.movementType;
  if (mv.quantity !== undefined) payload.quantity = Number(mv.quantity);
  if (mv.referenceType !== undefined) payload.reference_type = mv.referenceType;
  if (mv.referenceId !== undefined) payload.reference_id = mv.referenceId;
  if (mv.reason !== undefined) payload.reason = mv.reason;
  if (mv.notes !== undefined) payload.notes = mv.notes;
  if (mv.createdBy !== undefined) payload.created_by = mv.createdBy;
  return payload;
}
