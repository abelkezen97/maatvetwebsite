"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "ar";

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation & Layout
    dashboard: "Dashboard",
    products: "Products",
    newQuote: "New Quote",
    quotes: "Quotes",
    invoices: "Invoices",
    newInvoice: "New Invoice",
    customers: "Customers",
    settings: "Settings",
    logout: "Logout",
    salesPortal: "Sales Portal",
    maatGroup: "MAAT GROUP",
    vetMedicine: "Veterinary Medicine",
    
    // Dashboard KPIs & Sections
    dashboardTitle: "Sales Dashboard",
    dashboardDesc: "Real-time veterinary inventory levels, client quotes, and salesmen stats.",
    totalProducts: "TOTAL PRODUCTS",
    totalStockValue: "TOTAL STOCK VALUE",
    lowStockWarnings: "LOW STOCK WARNINGS",
    todaysQuotes: "TODAY'S QUOTES",
    recentQuotations: "Recent Quotations",
    stockAlerts: "Stock Alerts",
    portalActivity: "Portal Activity",
    viewAllQuotes: "View All Quotes",
    manageInventory: "Manage Inventory",
    createQuote: "Create Quote",
    activeClients: "ACTIVE CLIENTS",
    totalQuotes: "TOTAL QUOTES",
    cataloguedMedicines: "catalogued medicines",
    veterinaryClinicsFarms: "veterinary clinics & farms",
    quotationsIssuedTotal: "quotations issued total",
    quotationsCreatedToday: "quotations created today",
    bdmRole: "Business Development Manager (UAE)",
    adminRole: "Admin",
    
    // Products
    productsTitle: "Products Catalog",
    productsDesc: "Live inventory records synced from central databases and clinic sheets.",
    syncCatalog: "Sync Catalog",
    addMedicine: "Add Medicine",
    searchPlaceholder: "Search by SKU, product name, or category...",
    itemCount: "Items",
    medName: "Medicine Name",
    initialStock: "Initial Stock Level",
    unitPrice: "Unit Price (AED)",
    productDetails: "Product Details",
    priceCol: "Unit Price",
    stockCol: "Stock Level",
    statusCol: "Status",
    googleSheetsConnected: "Google Sheet Connected",
    staticFallback: "Static Catalog Fallback",
    
    // Quotes
    quotesTitle: "Quotations Manager",
    quotesDesc: "Review quotation lists, search clients, or export print-ready PDF catalogs.",
    quoteNo: "Quote Number",
    clientCompany: "Client / Company",
    dateCol: "Date",
    grandTotalCol: "Grand Total",
    actionsCol: "Actions",
    newQuoteTitle: "New Quotation",
    newQuoteDesc: "Select a clinic/client, add medications from inventory, and set custom discounts.",
    backToQuotes: "Back to Quotations",
    chooseCustomer: "-- Choose Customer --",
    custDetailsHeader: "1. Customer Details",
    itemsHeader: "2. Items Configuration",
    searchProductsToAdd: "Search Products to Add",
    qtyHeader: "Qty",
    discHeader: "Discount %",
    subtotalHeader: "Subtotal",
    summaryHeader: "Quotation Summary",
    itemsCountLabel: "Items Count",
    discountTotalLabel: "Discount Total",
    vatLabel: "VAT (5%)",
    remarksLabel: "Special Remarks / Delivery Notes",
    submitQuoteBtn: "Submit Quotation",
    
    // Customers
    customersTitle: "Customers & Accounts",
    customersDesc: "Manage veterinary clinics, equestrian centers, livestock farms, and key contact details.",
    companyHeader: "Clinic / Farm Company",
    doctorHeader: "Primary Contact Doctor",
    emailHeader: "Email Address",
    phoneHeader: "Phone Number",
    
    // Settings
    settingsTitle: "Settings & Config",
    settingsDesc: "Review active user credentials, system configs, and synchronization logs.",
    activeUserHeader: "Active User Account",
    roleLabel: "Role",
    businessParams: "Business Parameters (Phase 1 Mock)",
    regionLabel: "Country / Region",
    taxRateLabel: "Sales Tax / VAT Rate",
    pdfTermsLabel: "Standard PDF Quotation Terms & Footer",
    dbSyncHeader: "Database Sync",
    syncStatusMsg: "Connected",
    lastSyncLabel: "Last Local Compilation",
    
    // Login
    loginTitle: "MAAT Sales Portal",
    loginSubtitle: "Veterinary Medicine Trading LLC",
    selectRole: "Select Role",
    emailAddress: "Email Address",
    password: "Password",
    signIn: "Sign In",
    quickFillTitle: "Quick Fill Demo Accounts",
    salesAccountBtn: "Sales Account",
    adminAccountBtn: "Admin Account",
    
    // Actions & Statuses
    submit: "Submit",
    cancel: "Cancel",
    close: "Close",
    loadingSession: "Loading session...",
    redirecting: "Redirecting to MAAT Portal...",
  },
  ar: {
    // Navigation & Layout
    dashboard: "لوحة التحكم",
    products: "المنتجات",
    newQuote: "عرض سعر جديد",
    quotes: "عروض الأسعار",
    invoices: "الفواتير",
    newInvoice: "فاتورة جديدة",
    customers: "العملاء",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    salesPortal: "بوابة المبيعات",
    maatGroup: "مجموعة معات",
    vetMedicine: "الأدوية البيطرية",
    
    // Dashboard KPIs & Sections
    dashboardTitle: "لوحة تحكم المبيعات",
    dashboardDesc: "مستويات المخزون البيطري الفعلي، عروض أسعار العملاء، وإحصائيات المبيعات.",
    totalProducts: "إجمالي المنتجات",
    totalStockValue: "إجمالي قيمة المخزون",
    lowStockWarnings: "تحذيرات نقص المخزون",
    todaysQuotes: "عروض اليوم",
    recentQuotations: "عروض الأسعار الأخيرة",
    stockAlerts: "تنبيهات المخزون",
    portalActivity: "نشاط البوابة",
    viewAllQuotes: "عرض جميع العروض",
    manageInventory: "إدارة المخزون",
    createQuote: "إنشاء عرض سعر",
    activeClients: "العملاء النشطون",
    totalQuotes: "إجمالي العروض",
    cataloguedMedicines: "الأدوية المسجلة بالكتالوج",
    veterinaryClinicsFarms: "العيادات والمزارع البيطرية",
    quotationsIssuedTotal: "إجمالي العروض الصادرة",
    quotationsCreatedToday: "العروض التي تم إنشاؤها اليوم",
    bdmRole: "مدير تطوير الأعمال (الإمارات)",
    adminRole: "المسؤول",
    
    // Products
    productsTitle: "كتالوج المنتجات",
    productsDesc: "سجلات المخزون الحي المتزامنة من قواعد البيانات المركزية وأوراق العيادات.",
    syncCatalog: "مزامنة الكتالوج",
    addMedicine: "إضافة دواء",
    searchPlaceholder: "البحث عن طريق SKU، اسم المنتج، أو الفئة...",
    itemCount: "العناصر",
    medName: "اسم الدواء",
    initialStock: "مستوى المخزون الأولي",
    unitPrice: "سعر الوحدة (درهم)",
    productDetails: "تفاصيل المنتج",
    priceCol: "سعر الوحدة",
    stockCol: "مستوى المخزون",
    statusCol: "الحالة",
    googleSheetsConnected: "جداول بيانات جوجل متصلة",
    staticFallback: "النسخة الاحتياطية الثابتة",
    
    // Quotes
    quotesTitle: "إدارة العروض",
    quotesDesc: "مراجعة قوائم العروض، البحث عن العملاء، أو تصدير كتالوج PDF جاهز للطباعة.",
    quoteNo: "رقم العرض",
    clientCompany: "العميل / الشركة",
    dateCol: "التاريخ",
    grandTotalCol: "المبلغ الإجمالي",
    actionsCol: "الإجراءات",
    newQuoteTitle: "عرض سعر جديد",
    newQuoteDesc: "اختر عيادة/عميلاً، أضف الأدوية من المخزون، وحدد الخصومات المخصصة.",
    backToQuotes: "العودة إلى العروض",
    chooseCustomer: "-- اختر العميل --",
    custDetailsHeader: "١. تفاصيل العميل",
    itemsHeader: "٢. تكوين العناصر",
    searchProductsToAdd: "ابحث عن المنتجات لإضافتها",
    qtyHeader: "الكمية",
    discHeader: "الخصم %",
    subtotalHeader: "المجموع الفرعي",
    summaryHeader: "ملخص عرض السعر",
    itemsCountLabel: "عدد العناصر",
    discountTotalLabel: "إجمالي الخصم",
    vatLabel: "ضريبة القيمة المضافة (٥٪)",
    remarksLabel: "ملاحظات خاصة / تفاصيل التسليم",
    submitQuoteBtn: "تقديم عرض السعر",
    
    // Customers
    customersTitle: "العملاء والحسابات",
    customersDesc: "إدارة العيادات البيطرية ومراكز الفروسية ومزارع الماشية وتفاصيل الاتصال الرئيسية.",
    companyHeader: "العيادة / شركة المزرعة",
    doctorHeader: "الطبيب المسؤول للاتصال",
    emailHeader: "البريد الإلكتروني",
    phoneHeader: "رقم الهاتف",
    
    // Settings
    settingsTitle: "الإعدادات والتكوين",
    settingsDesc: "مراجعة بيانات المستخدم النشط وتكوينات النظام وسجلات المزامنة.",
    activeUserHeader: "حساب المستخدم النشط",
    roleLabel: "الدور",
    businessParams: "مؤشرات العمل (موك المرحلة الأولى)",
    regionLabel: "الدولة / المنطقة",
    taxRateLabel: "معدل الضريبة / ضريبة القيمة المضافة",
    pdfTermsLabel: "شروط وذيل عرض أسعار PDF القياسي",
    dbSyncHeader: "مزامنة قاعدة البيانات",
    syncStatusMsg: "متصل",
    lastSyncLabel: "آخر تجميع محلي",
    
    // Login
    loginTitle: "بوابة مبيعات معات",
    loginSubtitle: "شركة تجارة الأدوية البيطرية ذ.م.م",
    selectRole: "اختر الدور",
    emailAddress: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    quickFillTitle: "تعبئة سريعة لحسابات الديمو",
    salesAccountBtn: "حساب المبيعات",
    adminAccountBtn: "حساب المسؤول",
    
    // Actions & Statuses
    submit: "تقديم",
    cancel: "إلغاء",
    close: "إغلاق",
    loadingSession: "تحميل الجلسة...",
    redirecting: "جاري التحويل لبوابة معات...",
  }
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    // Read saved language preference if any
    const savedLang = localStorage.getItem("maat_lang") as Language;
    if (savedLang && (savedLang === "en" || savedLang === "ar")) {
      setLanguageState(savedLang);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("maat_lang", lang);
  };

  useEffect(() => {
    // Dynamically adjust layout direction
    const root = window.document.documentElement;
    if (language === "ar") {
      root.setAttribute("dir", "rtl");
      root.setAttribute("lang", "ar");
    } else {
      root.setAttribute("dir", "ltr");
      root.setAttribute("lang", "en");
    }
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key] || translations["en"][key] || key;
  };

  const isRtl = language === "ar";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
