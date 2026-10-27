// The categories a new household starts with. People rename, add, and delete them on /settings/categories.
// `match` seeds rules: a description containing any of these words gets the category on sync.
export type CategoryKind = "expense" | "income" | "transfer"

export interface DefaultCategory {
  name: string
  kind: CategoryKind
  icon: string
  color: string
  match?: string[]
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    name: "Groceries",
    kind: "expense",
    icon: "i-lucide-shopping-cart",
    color: "emerald",
    match: ["mercadona", "carrefour", "lidl", "aldi", "supermercados dia", "eroski", "consum", "alcampo", "supermarket", "netto", "føtex", "rema 1000", "coop", "meny", "ica ", "willys", "hemköp"],
  },
  {
    name: "Eating out",
    kind: "expense",
    icon: "i-lucide-utensils",
    color: "orange",
    match: ["restaurant", "glovo", "just eat", "uber eats", "deliveroo", "cafe", "bar ", "wolt", "foodora", "espresso house", "starbucks"],
  },
  { name: "Housing", kind: "expense", icon: "i-lucide-house", color: "sky", match: ["rent", "alquiler", "hipoteca", "mortgage", "comunidad"] },
  {
    name: "Utilities",
    kind: "expense",
    icon: "i-lucide-zap",
    color: "amber",
    match: ["iberdrola", "endesa", "naturgy", "repsol luz", "holaluz", "canal de isabel", "aguas", "movistar", "vodafone", "orange", "digi", "ørsted", "telia", "telenor"],
  },
  {
    name: "Transport",
    kind: "expense",
    icon: "i-lucide-car",
    color: "blue",
    match: ["uber", "cabify", "bolt", "renfe", "metro", "emt", "repsol", "cepsa", "bp ", "shell", "galp", "parking", "dsb", "rejsekort", "skånetrafiken", "tfl travel", "circle k"],
  },
  { name: "Health", kind: "expense", icon: "i-lucide-heart-pulse", color: "rose", match: ["farmacia", "pharmacy", "sanitas", "adeslas", "dentist", "clinica"] },
  { name: "Travel", kind: "expense", icon: "i-lucide-plane", color: "cyan", match: ["ryanair", "vueling", "iberia", "booking.com", "airbnb", "hotel", "flysas", "norwegian air", "easyjet", "united air", "lufthansa"] },
  {
    name: "Subscriptions",
    kind: "expense",
    icon: "i-lucide-repeat",
    color: "violet",
    match: ["netflix", "spotify", "hbo", "disney", "apple.com", "icloud", "google", "youtube", "amazon prime", "chatgpt", "openai", "anthropic", "github", "paddle.net", "deepl", "notion", "dropbox", "adobe"],
  },
  { name: "Shopping", kind: "expense", icon: "i-lucide-shirt", color: "pink", match: ["amazon", "zara", "decathlon", "ikea", "el corte ingles", "aliexpress"] },
  { name: "Entertainment", kind: "expense", icon: "i-lucide-film", color: "fuchsia", match: ["cinema", "cine", "steam", "playstation", "ticketmaster"] },
  { name: "Fitness", kind: "expense", icon: "i-lucide-dumbbell", color: "lime", match: ["gym", "gimnasio", "basic-fit", "holmes place", "padel", "playtomic", "fitness world", "puregym"] },
  { name: "Kids", kind: "expense", icon: "i-lucide-baby", color: "yellow" },
  { name: "Pets", kind: "expense", icon: "i-lucide-dog", color: "stone" },
  { name: "Gifts", kind: "expense", icon: "i-lucide-gift", color: "red" },
  { name: "Education", kind: "expense", icon: "i-lucide-graduation-cap", color: "indigo" },
  { name: "Fees", kind: "expense", icon: "i-lucide-receipt", color: "zinc", match: ["comision", "commission", "fee"] },
  { name: "Salary", kind: "income", icon: "i-lucide-briefcase", color: "green", match: ["nomina", "nómina", "salary", "payroll", "lønoverførsel", "løn ", "lön "] },
  { name: "Other income", kind: "income", icon: "i-lucide-banknote", color: "teal", match: ["interest", "intereses", "dividend", "refund", "reembolso"] },
  { name: "Transfers", kind: "transfer", icon: "i-lucide-arrow-left-right", color: "neutral", match: ["traspaso", "internal transfer", "transfer between", "transfer to own"] },
]

/** Tailwind palette names a category may use, so the UI can map them to classes it knows at build time. */
export const CATEGORY_COLORS = [
  "neutral",
  "zinc",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "fuchsia",
  "pink",
  "rose",
] as const
