import { Product, Customer } from "@/types";

let cachedProducts: Product[] | null = null;
let lastProductsFetchTime = 0;

let cachedCustomers: Customer[] | null = null;
let lastCustomersFetchTime = 0;

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache TTL

export function clearCustomersCache() {
  cachedCustomers = null;
  lastCustomersFetchTime = 0;
}

export async function fetchProductsFromGoogleSheet(): Promise<Product[]> {
  const now = Date.now();
  if (cachedProducts && (now - lastProductsFetchTime < CACHE_TTL)) {
    return cachedProducts;
  }

  const spreadsheetId = process.env.NEXT_PUBLIC_SPREADSHEET_ID;
  
  if (!spreadsheetId) {
    console.warn("NEXT_PUBLIC_SPREADSHEET_ID is not configured in env. Returning fallback mock inventory.");
    return [];
  }

  try {
    // Export standard sheet as CSV (avoids needing authentication keys/Google Console config)
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    const response = await fetch(url, { cache: "no-store" }); // cache list for 15s

    if (!response.ok) {
      throw new Error(`Google Sheets responded with status ${response.status}`);
    }

    const csvText = await response.text();
    const rows = csvText.split("\n").map(row => {
      // Basic CSV parser accounting for quotes
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });

    let currentCategory = "General";
    const products: Product[] = [];

    rows.forEach((row, idx) => {
      if (idx === 0) return; // Skip main header row

      const sNo = row[0]?.trim() || "";
      const name = row[1]?.trim() || "";

      // If S.No has a value, but Name and Prices are blank, it is a Company/Brand title row!
      // Example: "Nicosia International,,,,,"
      if (sNo && !name && !row[2] && !row[3]) {
        currentCategory = sNo.replace(/^"|"$/g, "");
        return;
      }

      // If it is a product row (has name)
      if (name) {
        const perPc = parseFloat(row[2]) || 0.0;
        const tenPc = parseFloat(row[3]) || perPc;
        const fiftyPc = parseFloat(row[4]) || tenPc;
        const hundredPc = parseFloat(row[5]) || fiftyPc;
        const availability = row[6]?.trim().toUpperCase();
        const isAvailable = availability !== "N"; // default to true unless explicitly 'N'

        products.push({
          id: `sheet-${idx}`,
          sku: `VET-${currentCategory.substring(0, 3).toUpperCase()}-${sNo || idx}`,
          name: name.replace(/^"|"$/g, ""),
          category: currentCategory,
          price: perPc,
          price10: tenPc,
          price50: fiftyPc,
          price100: hundredPc,
          unit: "Item",
          description: `Synced from Google Sheet. Bulk prices - 10pcs: AED ${tenPc}, 50pcs: AED ${fiftyPc}, 100pcs: AED ${hundredPc}`,
          isAvailable,
        });
      }
    });

    cachedProducts = products;
    lastProductsFetchTime = now;
    return products;
  } catch (error) {
    console.error("Failed to fetch products from Google Sheet:", error);
    return [];
  }
}

export async function fetchCustomersFromGoogleSheet(): Promise<Customer[]> {
  const now = Date.now();
  if (cachedCustomers && (now - lastCustomersFetchTime < CACHE_TTL)) {
    return cachedCustomers;
  }

  const spreadsheetId = process.env.NEXT_PUBLIC_CUSTOMERS_SPREADSHEET_ID;
  
  if (!spreadsheetId) {
    console.warn("NEXT_PUBLIC_CUSTOMERS_SPREADSHEET_ID is not configured in env. Returning fallback mock customers.");
    return [];
  }

  try {
    const url = spreadsheetId.startsWith("http")
      ? spreadsheetId
      : spreadsheetId.startsWith("2PACX-")
        ? `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?output=csv`
        : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Google Sheets responded with status ${response.status}`);
    }

    const csvText = await response.text();
    const rows = csvText.split("\n").map(row => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });

    const customers: Customer[] = [];

    rows.forEach((row, idx) => {
      if (idx === 0) return; // Skip headers

      const company = row[0]?.trim() || "";
      const contactPerson = row[1]?.trim() || "";
      const location = row[2]?.trim() || "";
      const pendingAmountRaw = row[3]?.trim() || "0";
      const pendingBillwiseAmount = parseFloat(pendingAmountRaw.replace(/[^0-9.-]+/g, "")) || 0;

      if (company) {
        customers.push({
          id: `cust-sheet-${idx}`,
          company: company.replace(/^"|"$/g, ""),
          name: contactPerson.replace(/^"|"$/g, ""),
          address: location.replace(/^"|"$/g, ""),
          phone: "", // phone number keep blank
          email: "",
          pendingBillwiseAmount,
        });
      }

    });

    cachedCustomers = customers;
    lastCustomersFetchTime = now;
    return customers;
  } catch (error) {
    console.error("Failed to fetch customers from Google Sheet:", error);
    return [];
  }
}
