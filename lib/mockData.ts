import { Product, Customer, Quote, User, Invoice } from "../types";

export const demoUsers: User[] = [
  {
    id: "user-admin",
    email: "admin@maatvet.com",
    name: "Dr. Salem Al-Mansouri",
    role: "Admin",
    avatarUrl: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=150&q=80"
  },
  {
    id: "user-salesman",
    email: "kaleem@maatvet.com",
    name: "Dr. Kaleemullah M.",
    role: "Salesman",
    avatarUrl: "/kaleem.png"
  }
];

export const mockProducts: Product[] = [
  {
    id: "prod-1",
    sku: "VET-PEN-001",
    name: "Penicillin G Procaine Injection 300,000 IU/ml",
    category: "Antibiotics",
    price: 45.0,
    unit: "Vial (100ml)",
    description: "Broad-spectrum penicillin antibiotic injection for cattle, sheep, and swine."
  },
  {
    id: "prod-2",
    sku: "VET-OXY-002",
    name: "Oxytetracycline 20% LA Long Acting",
    category: "Antibiotics",
    price: 65.5,
    unit: "Vial (100ml)",
    description: "Long-acting injectable antibiotic for the treatment of tick-borne fever and pneumonia."
  },
  {
    id: "prod-3",
    sku: "VET-IVM-003",
    name: "Ivermectin 1% Sterile Injection",
    category: "Parasiticides",
    price: 38.0,
    unit: "Vial (50ml)",
    description: "Injectable parasiticide for control of mature and immature stages of internal and external parasites."
  },
  {
    id: "prod-4",
    sku: "VET-VIT-004",
    name: "Multivitamin Injection (A, D3, E, B-Complex)",
    category: "Vitamins & Supplements",
    price: 22.0,
    unit: "Vial (100ml)",
    description: "Sterile aqueous solution of vitamins for prevention and treatment of vitamin deficiencies."
  },
  {
    id: "prod-5",
    sku: "VET-VAC-005",
    name: "Foot and Mouth Disease (FMD) Vaccine",
    category: "Vaccines",
    price: 180.0,
    unit: "Pack (50 doses)",
    description: "Inactivated vaccine for immunizing cattle and sheep against FMD."
  },
  {
    id: "prod-6",
    sku: "VET-CAL-006",
    name: "Calcium Borogluconate 40% Injection",
    category: "Supplements",
    price: 15.0,
    unit: "Vial (400ml)",
    description: "Treatment for milk fever and calcium deficiencies in dairy cows."
  },
  {
    id: "prod-7",
    sku: "VET-MEL-007",
    name: "Meloxicam 20mg/ml Anti-inflammatory",
    category: "Analgesics/NSAID",
    price: 52.0,
    unit: "Vial (50ml)",
    description: "Non-steroidal anti-inflammatory injection for cattle, pigs, and horses."
  }
];

export const mockCustomers: Customer[] = [
  {
    id: "cust-1",
    name: "Dr. Fatima Al-Harbi",
    company: "Green Valley Veterinary Clinic",
    email: "fatima@greenvalleyvet.com",
    phone: "+971 50 123 4567",
    address: "Al Khawaneej, Sector 3, Dubai, UAE"
  },
  {
    id: "cust-2",
    name: "Saeed Al-Mansoori",
    company: "Al-Mansoori Dairy & Livestock Farm",
    email: "saeed@mansooridairy.ae",
    phone: "+971 52 987 6543",
    address: "Al Ain Highway, Abu Dhabi, UAE"
  },
  {
    id: "cust-3",
    name: "Dr. John Davies",
    company: "Desert Breeze Equine Center",
    email: "jdavies@desertbreeze.ae",
    phone: "+971 55 555 1234",
    address: "Meydan Road, Nad Al Sheba, Dubai, UAE"
  },
  {
    id: "cust-4",
    name: "Ahmed Al-Shehhi",
    company: "RAK Camel Veterinary Care",
    email: "ahmed@rakcamels.com",
    phone: "+971 7 244 5566",
    address: "Al Diqdaqah, Ras Al Khaimah, UAE"
  }
];

export const mockQuotes: Quote[] = [];

export const mockInvoices: Invoice[] = [];

export const mockActivity: { id: string; user: string; action: string; target: string; time: string; }[] = [];

