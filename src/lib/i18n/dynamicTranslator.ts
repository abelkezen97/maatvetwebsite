/**
 * Presentation-layer dynamic business data translator for MAATWEB.
 * Translates product names, customer/clinic names, doctor names, and operational text.
 * DOES NOT modify database records. Purely presentation layer.
 */

// In-memory translation cache for ultra-fast performance
const translationCache = new Map<string, string>();

// Dynamic translation map for business text
const businessDictionary: Record<string, string> = {
  // Pharmaceutical Products & Brands (Transliterated / Natural Arabic)
  "Aminovital Injection": "حقن أمينوفيتال",
  "Vetbiolyte": "فيتبيولايت",
  "Biolax": "بيولاكس",
  "Penicillin G Procaine Injection 300,000 IU/ml": "حقن بنسيلين جي بروكائين 300,000 وحدة دولية/مل",
  "Oxytetracycline 20% LA Long Acting": "أوكسي تيتراسيكلين 20% طويل المفعول",
  "Ivermectin 1% Sterile Injection": "حقن إيفر مكتين 1% المعقمة",
  "Multivitamin Injection (A, D3, E, B-Complex)": "حقن متعدد الفيتامينات (أ، د3، هـ، ب-المركب)",
  "Foot and Mouth Disease (FMD) Vaccine": "لقاح الحمى القلاعية",
  "Calcium Borogluconate 40% Injection": "حقن كالسيوم بوروغلوكونات 40%",
  "Meloxicam 20mg/ml Anti-inflammatory": "حقن ميلوكسيكام 20 مجم/مل المضاد للالتهاب",
  "Dexa-Phenylarthrite": "ديكسا-فينيل أثرَيت",
  "Vetoquinol Calphone C": "فيتوكينول كالفوين سي",
  "Tylan 200 Injection": "تايلان 200 حقن",
  "Dexamethasone 0.2% Injection": "حقن ديكساميثازون 0.2%",
  "B-Complex Super Injection": "حقن ب-المركب السوبر",
  "Iron Dextran 20% Injection": "حقن ديكستران الحديد 20%",
  "Enrofloxacin 10% Solution": "محلول إنروفلوكساسين 10%",
  "Phenylbutazone 20% Injection": "حقن فينيل بوتازون 20%",

  // Customer / Clinic / Company Names
  "Aadiyat Vet Pharmacy Ajman": "صيدلية أدياد البيطرية عجمان",
  "Green Valley Veterinary Clinic": "عيادة وادي الخضراء البيطرية",
  "Al-Mansoori Dairy & Livestock Farm": "مزرعة المنصوري للألبان والمواشي",
  "Desert Breeze Equine Center": "مركز نسيم الصحراء للفروسية",
  "RAK Camel Veterinary Care": "رعاية الهجن البيطرية برأس الخيمة",
  "Royal Stables Abu Dhabi": "الإسطبلات الملكية أبوظبي",
  "Al Khawaneej Veterinary Hospital": "مستشفى الخوانيج البيطري",
  "Dubai Equine Hospital": "مستشفى دبي للفروسية",
  "Al Ain Camel Clinic": "عيادة العین للهجن",
  "Sharjah Livestock Care": "رعاية الشارقة للمواشي",

  // Doctors & Contacts
  "Dr. Hamid": "د. حامد",
  "Dr. Fatima Al-Harbi": "د. فاطمة الحربي",
  "Saeed Al-Mansoori": "سعيد المنصوري",
  "Dr. John Davies": "د. جون ديفيز",
  "Ahmed Al-Shehhi": "أحمد الشحي",
  "Dr. Kaleem": "د. كليم",
  "Kaleemullah": "كليم الله",
  "Dr. Tariq": "د. طارق",
  "Dr. Rashid": "د. راشد",
  "Dr. Sultan": "د. سلطان",
  "Abel Kezen": "أبيل كيزين",

  // Product Categories
  "Antibiotics": "مضادات حيوية",
  "Parasiticides": "مضادات الطفيليات",
  "Vitamins & Supplements": "فيتامينات ومكملات",
  "Supplements": "مكملات غذائية",
  "Vaccines": "لقاحات",
  "Analgesics/NSAID": "مسكنات ومضادات التهاب",
  "Hormones": "هرمونات",
  "Disinfectants": "مطهرات",

  // Product Units
  "Vial (100ml)": "قارورة (100 مل)",
  "Vial (50ml)": "قارورة (50 مل)",
  "Vial (400ml)": "قارورة (400 مل)",
  "Pack (50 doses)": "عبوة (50 جرعة)",
  "Box": "صندوق",
  "Bottle": "زجاجة",
  "Piece": "قطعة",

  // Expense Categories & Payment Modes
  "Fuel & Transportation": "الوقود والمواصلات",
  "Meals & Client Entertainment": "الوجبات وضيافة العملاء",
  "Office Supplies": "المستلزمات المكتبية",
  "Vehicle Maintenance": "صيانة المركبات",
  "Miscellaneous": "مصروفات متنوعة",
  "Cash": "نقداً",
  "Bank Transfer": "تحويل بنكي",
  "Cheque": "شيك",
  "Card": "بطاقة أئتمان",
};

/**
 * Checks if a string is a non-translatable system identifier, code, email, phone, or number.
 */
function isNonTranslatable(val: string): boolean {
  if (!val || typeof val !== "string") return true;
  const trimmed = val.trim();
  if (trimmed === "") return true;

  // Invoice numbers (INV-...), Quote numbers (QT-...), Customer codes (CUST-...), Product codes (VET-..., MED-..., SKU, BAR-)
  if (/^(INV|QT|QUO|CUST|PROD|MED|VET|SKU|BAR|REF|TX|REC)-/i.test(trimmed)) return true;

  // Pure numeric, currency strings or formatted numbers
  if (/^[\d.,\s\+\-\$\€\£\AED]+$/.test(trimmed) && /\d/.test(trimmed)) return true;

  // Emails
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;

  // Phone numbers (e.g. +971 50 123 4567)
  if (/^\+?\d[\d\s\-\(\)]{6,}\d$/.test(trimmed)) return true;

  // URLs
  if (/^(http|https):\/\//i.test(trimmed)) return true;

  return false;
}

/**
 * Translates a dynamic business string to Arabic when locale === "ar".
 * Returns original string if locale === "en" or if no Arabic translation exists.
 */
export function translateBusinessText(value: string | null | undefined, locale: "en" | "ar"): string {
  if (!value || typeof value !== "string") return "";
  if (locale === "en") return value;

  const trimmed = value.trim();
  if (isNonTranslatable(trimmed)) {
    return value;
  }

  // Check cache
  if (translationCache.has(trimmed)) {
    return translationCache.get(trimmed)!;
  }

  // Exact match lookup
  if (businessDictionary[trimmed]) {
    const res = businessDictionary[trimmed];
    translationCache.set(trimmed, res);
    return res;
  }

  // Pattern matching / substring replacements for common veterinary terms
  let translated = trimmed;
  let matchesFound = false;

  if (trimmed.toLowerCase().includes("injection")) {
    translated = translated.replace(/injection/gi, "حقن");
    matchesFound = true;
  }
  if (trimmed.toLowerCase().includes("clinic")) {
    translated = translated.replace(/clinic/gi, "عيادة");
    matchesFound = true;
  }
  if (trimmed.toLowerCase().includes("pharmacy")) {
    translated = translated.replace(/pharmacy/gi, "صيدلية");
    matchesFound = true;
  }
  if (trimmed.toLowerCase().includes("farm")) {
    translated = translated.replace(/farm/gi, "مزرعة");
    matchesFound = true;
  }
  if (trimmed.toLowerCase().includes("dr.")) {
    translated = translated.replace(/dr\./gi, "د.");
    matchesFound = true;
  }

  if (matchesFound && translated !== trimmed) {
    translationCache.set(trimmed, translated);
    return translated;
  }

  // Fallback: return original English string intact (NEVER undefined, null or error)
  return value;
}
