import { COURIERS, CourierId, quoteShipping } from "../shipping";
import { HOUR, now } from "./clock";
import { registerSeeder, TABLE_NAMES } from "./db";
import { hashPassword } from "./hash";
import { baht } from "./money";
import { DEFAULT_SETTINGS } from "./settings";
import { Deal, DealStatus, Order, OrderStatus, SettingKey, Tables, UserRole, Vote } from "./types";

/** Every seeded account uses this password. */
export const DEMO_PASSWORD = "groupbuy123";

export type DemoAccount = { email: string; name: string; role: UserRole; note: string };

const SHOPPER_NAMES = ["Ploy", "Nat", "Mint", "Arm", "Beam", "Fah", "Ton", "Pim", "Kai", "Nok", "June"];

/** Fifty additional synthetic buyers, kept separate from the original eleven. */
const EXTRA_BUYER_NAMES = Array.from({ length: 50 }, (_, i) => `Demo Buyer ${String(i + 1).padStart(2, "0")}`);

/**
 * Approved demo shops besides Win Gadgets (seller@), each owning the deals
 * in its category. Win Gadgets keeps electronics plus the deals that demo
 * later stages (decision, payment, shipping, review, draft).
 */
const SHOPS: {
  email: string;
  owner: string;
  shopName: string;
  description: string;
  deals: string[];
  /** Basis points; omit for the platform default */
  commissionRate?: number;
  joinedDaysAgo: number;
}[] = [
  {
    email: "seller-home@groupbuy.test",
    owner: "Nok",
    shopName: "Baan Living",
    description: "Small appliances and lighting for Thai homes and condos.",
    deals: ["coffee", "desklamp"],
    joinedDaysAgo: 120,
  },
  {
    email: "seller-beauty@groupbuy.test",
    owner: "Fon",
    shopName: "Glow Lab Beauty",
    description: "Skincare and sun care made for hot, humid weather.",
    deals: ["skincare", "sunscreen"],
    joinedDaysAgo: 95,
  },
  {
    email: "seller-fashion@groupbuy.test",
    owner: "Tee",
    shopName: "Urban Thread",
    description: "Everyday basics and bags from Bangkok.",
    deals: ["tshirt", "backpack"],
    joinedDaysAgo: 70,
  },
  {
    email: "seller-food@groupbuy.test",
    owner: "Somchai",
    shopName: "Farm Fresh Thai",
    description: "Rice and coffee straight from farmers in Isan and Chiang Rai.",
    deals: ["rice", "coffeebeans"],
    commissionRate: 25,
    joinedDaysAgo: 60,
  },
  {
    email: "seller-sports@groupbuy.test",
    owner: "Ice",
    shopName: "FitLife Sports",
    description: "Home workout gear and hydration.",
    deals: ["dumbbells", "bottle"],
    joinedDaysAgo: 45,
  },
  {
    email: "seller-gaming@groupbuy.test",
    owner: "Bank",
    shopName: "Level Up Gaming",
    description: "Controllers, keyboards and gear for PC and console players.",
    deals: ["controller", "keyboard"],
    joinedDaysAgo: 30,
  },
  // Twenty new approved sellers, each with their own product.
  { email: "seller-extra01@groupbuy.test", owner: "Demo Seller 01", shopName: "Metro Audio", description: "Independent GroupBuy demo store offering portable bluetooth earbuds.", deals: ["newproduct01"], joinedDaysAgo: 21 },
  { email: "seller-extra02@groupbuy.test", owner: "Demo Seller 02", shopName: "Pulse Wear", description: "Independent GroupBuy demo store offering fitness smartwatch.", deals: ["newproduct02"], joinedDaysAgo: 22 },
  { email: "seller-extra03@groupbuy.test", owner: "Demo Seller 03", shopName: "Charge Hub", description: "Independent GroupBuy demo store offering compact power bank.", deals: ["newproduct03"], joinedDaysAgo: 23 },
  { email: "seller-extra04@groupbuy.test", owner: "Demo Seller 04", shopName: "Sound Avenue", description: "Independent GroupBuy demo store offering mini bluetooth speaker.", deals: ["newproduct04"], joinedDaysAgo: 24 },
  { email: "seller-extra05@groupbuy.test", owner: "Demo Seller 05", shopName: "Cozy Corner", description: "Independent GroupBuy demo store offering minimalist desk lamp.", deals: ["newproduct05"], joinedDaysAgo: 25 },
  { email: "seller-extra06@groupbuy.test", owner: "Demo Seller 06", shopName: "Brew Daily", description: "Independent GroupBuy demo store offering home coffee brewer.", deals: ["newproduct06"], joinedDaysAgo: 26 },
  { email: "seller-extra07@groupbuy.test", owner: "Demo Seller 07", shopName: "Quick Kitchen", description: "Independent GroupBuy demo store offering digital air fryer.", deals: ["newproduct07"], joinedDaysAgo: 27 },
  { email: "seller-extra08@groupbuy.test", owner: "Demo Seller 08", shopName: "Smoothie Spot", description: "Independent GroupBuy demo store offering travel blender.", deals: ["newproduct08"], joinedDaysAgo: 28 },
  { email: "seller-extra09@groupbuy.test", owner: "Demo Seller 09", shopName: "Pure Glow", description: "Independent GroupBuy demo store offering daily skincare kit.", deals: ["newproduct09"], joinedDaysAgo: 29 },
  { email: "seller-extra10@groupbuy.test", owner: "Demo Seller 10", shopName: "Sun Shield", description: "Independent GroupBuy demo store offering spf50 sunscreen bundle.", deals: ["newproduct10"], joinedDaysAgo: 30 },
  { email: "seller-extra11@groupbuy.test", owner: "Demo Seller 11", shopName: "Basic Studio", description: "Independent GroupBuy demo store offering essential cotton tees.", deals: ["newproduct11"], joinedDaysAgo: 31 },
  { email: "seller-extra12@groupbuy.test", owner: "Demo Seller 12", shopName: "Carry Club", description: "Independent GroupBuy demo store offering commuter laptop backpack.", deals: ["newproduct12"], joinedDaysAgo: 32 },
  { email: "seller-extra13@groupbuy.test", owner: "Demo Seller 13", shopName: "Rice Roots", description: "Independent GroupBuy demo store offering premium jasmine rice 5kg.", deals: ["newproduct13"], joinedDaysAgo: 33 },
  { email: "seller-extra14@groupbuy.test", owner: "Demo Seller 14", shopName: "Bean District", description: "Independent GroupBuy demo store offering northern thai coffee beans.", deals: ["newproduct14"], joinedDaysAgo: 34 },
  { email: "seller-extra15@groupbuy.test", owner: "Demo Seller 15", shopName: "Lift Lab", description: "Independent GroupBuy demo store offering home dumbbell set.", deals: ["newproduct15"], joinedDaysAgo: 35 },
  { email: "seller-extra16@groupbuy.test", owner: "Demo Seller 16", shopName: "Hydro Trail", description: "Independent GroupBuy demo store offering steel insulated bottle.", deals: ["newproduct16"], joinedDaysAgo: 36 },
  { email: "seller-extra17@groupbuy.test", owner: "Demo Seller 17", shopName: "Yoga Flow", description: "Independent GroupBuy demo store offering yoga starter kit.", deals: ["newproduct17"], joinedDaysAgo: 37 },
  { email: "seller-extra18@groupbuy.test", owner: "Demo Seller 18", shopName: "Active Pulse", description: "Independent GroupBuy demo store offering fitness tracker band.", deals: ["newproduct18"], joinedDaysAgo: 38 },
  { email: "seller-extra19@groupbuy.test", owner: "Demo Seller 19", shopName: "Game Orbit", description: "Independent GroupBuy demo store offering wireless gaming controller.", deals: ["newproduct19"], joinedDaysAgo: 39 },
  { email: "seller-extra20@groupbuy.test", owner: "Demo Seller 20", shopName: "Key Craft", description: "Independent GroupBuy demo store offering mechanical gaming keyboard.", deals: ["newproduct20"], joinedDaysAgo: 40 },
];

/** Shown on the login page and in the dev panel's account switcher. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "buyer@groupbuy.test", name: "Buyer", role: "buyer", note: "Has votes on 2 deals" },
  { email: "seller@groupbuy.test", name: "Seller", role: "seller", note: "Win Gadgets: decisions, payments and shipping" },
  { email: "pending-seller@groupbuy.test", name: "New Seller", role: "seller", note: "Application pending" },
  { email: "admin@groupbuy.test", name: "Admin", role: "admin", note: "Platform admin" },
  ...SHOPS.map((shop) => ({ email: shop.email, name: shop.owner, role: "seller" as const, note: `Demo shop: ${shop.shopName}` })),
  ...SHOPPER_NAMES.map((name, index) => ({
    email: `shopper${index + 1}@groupbuy.test`,
    name,
    role: "buyer" as const,
    note: "Demo shopper",
  })),
  ...EXTRA_BUYER_NAMES.map((name, index) => ({
    email: `buyer-extra${String(index + 1).padStart(2, "0")}@groupbuy.test`,
    name,
    role: "buyer" as const,
    note: "Additional demo buyer",
  })),
];

/** [icon, name, slug]. The report's launch categories (Section 3.5); slugs stay stable for the seed deals. */
const CATEGORIES = [
  ["smartphone", "Electronics", "electronics"],
  ["sofa", "Home & Living", "home-living"],
  ["beauty", "Beauty & Health", "beauty"],
  ["shirt", "Fashion", "fashion"],
  ["food", "Food & Beverages", "food"],
  ["sports", "Sports & Outdoors", "sports"],
  ["gaming", "Toys & Games", "gaming"],
  ["pet", "Pet Supplies", "pet-supplies"],
] as const;

/** Seller stock caps on some deals: a number, or "full" to cap at the units already voted. */
const STOCK_CAPS: Record<string, number | "full"> = { earbuds: 50, watch: "full", newproduct05: 40 };

const COURIER_ROTATION: CourierId[] = ["flash", "kex", "jt"];

type SeedDeal = {
  key: string;
  title: string;
  description: string;
  category: string;
  image: string;
  status: DealStatus;
  /** Hours from now; negative is in the past. Only for live deals. */
  startsInHours: number;
  endsInHours: number;
  votingDays: number;
  maxUnitsPerBuyer: number | null;
  /** [minUnits, priceInBaht] from the lowest tier up */
  tiers: [number, number][];
  /** Units voted by the demo shoppers, spread across them */
  shopperUnits: number;
  /** payment_window deals: how many shoppers already paid / declined */
  paidShoppers?: number;
  declinedShoppers?: number;
  /** fulfilling deals: every voter paid; these are the shoppers' order states */
  orderStates?: OrderStatus[];
  reviewNote?: string;
  /** Packed weight of one unit; defaults by category */
  parcelWeightGrams?: number;
};

const SEED_DEALS: SeedDeal[] = [
  {
    key: "earbuds",
    title: "Wireless Earbuds Pro",
    description:
      "Premium wireless earbuds with active noise cancellation, 30-hour battery life with the case, and fast USB-C charging.",
    category: "electronics",
    image: "/assets/earphone.jpeg",
    status: "live",
    startsInHours: -5 * 24,
    endsInHours: 2 * 24,
    votingDays: 7,
    maxUnitsPerBuyer: 5,
    tiers: [
      [1, 500],
      [20, 450],
      [50, 390],
    ],
    shopperUnits: 40,
  },
  {
    key: "watch",
    title: "Smart Watch Series 5",
    description:
      "Fitness-tracking smartwatch with heart-rate and sleep monitoring, GPS and a 7-day battery.",
    category: "electronics",
    image: "/assets/watch.jpeg",
    status: "live",
    startsInHours: -4 * 24,
    endsInHours: 3 * 24,
    votingDays: 7,
    maxUnitsPerBuyer: 3,
    tiers: [
      [1, 1990],
      [20, 1690],
      [50, 1490],
    ],
    shopperUnits: 23,
  },
  {
    key: "coffee",
    title: "Coffee Maker",
    description: "Drip coffee maker for home brewing, with a 1.2 L glass jug and keep-warm plate.",
    category: "home-living",
    image: "/assets/Boncafe-Drip-Coffee-Maker-1.jpg",
    status: "live",
    startsInHours: -2 * 24,
    endsInHours: 5 * 24,
    votingDays: 7,
    maxUnitsPerBuyer: null,
    tiers: [
      [1, 1290],
      [15, 1090],
      [30, 890],
    ],
    shopperUnits: 12,
  },
  {
    key: "skincare",
    title: "Skincare Set",
    description: "Cleanser, toner, serum and moisturiser for a complete daily routine.",
    category: "beauty",
    image: "/assets/skincareset.jpeg",
    status: "live",
    startsInHours: -6 * 24,
    endsInHours: 20,
    votingDays: 7,
    maxUnitsPerBuyer: 4,
    tiers: [
      [1, 990],
      [10, 850],
      [25, 690],
    ],
    shopperUnits: 27,
  },
  {
    key: "powerbank",
    title: "Power Bank 20,000mAh",
    description: "Fast-charging 20,000mAh power bank with USB-C in/out and two USB-A ports. Charges a phone about four times.",
    category: "electronics",
    image: "/assets/products/power-bank.jpg",
    status: "live",
    startsInHours: -3 * 24,
    endsInHours: 96,
    votingDays: 7,
    maxUnitsPerBuyer: 3,
    tiers: [
      [1, 890],
      [15, 750],
      [40, 650],
    ],
    shopperUnits: 18,
  },
  {
    key: "desklamp",
    title: "LED Desk Lamp",
    description: "Dimmable LED desk lamp with three colour temperatures, a USB charging port and a foldable arm.",
    category: "home-living",
    image: "/assets/products/desk-lamp.jpg",
    status: "live",
    startsInHours: -1 * 24,
    endsInHours: 144,
    votingDays: 7,
    maxUnitsPerBuyer: null,
    tiers: [
      [1, 690],
      [10, 590],
      [25, 490],
    ],
    shopperUnits: 8,
  },
  {
    key: "sunscreen",
    title: "Sunscreen SPF50+ (3-Pack)",
    description: "Lightweight, non-greasy SPF50+ PA++++ sunscreen for daily use. Three 50 ml tubes.",
    category: "beauty",
    image: "/assets/products/sunscreen.jpg",
    status: "live",
    startsInHours: -4 * 24,
    endsInHours: 72,
    votingDays: 7,
    maxUnitsPerBuyer: 4,
    tiers: [
      [1, 590],
      [20, 490],
      [40, 420],
    ],
    shopperUnits: 26,
  },
  {
    key: "tshirt",
    title: "Cotton T-Shirt 3-Pack",
    description: "Soft 100% cotton crew-neck tees in black, white and grey. Sizes S to XXL.",
    category: "fashion",
    image: "/assets/products/tshirt-pack.jpg",
    status: "live",
    startsInHours: -2 * 24,
    endsInHours: 120,
    votingDays: 7,
    maxUnitsPerBuyer: 4,
    tiers: [
      [1, 790],
      [12, 650],
      [30, 550],
    ],
    shopperUnits: 15,
  },
  {
    key: "backpack",
    title: "Everyday Backpack 22L",
    description: "Water-resistant 22-litre backpack with a padded 15-inch laptop sleeve and hidden back pocket.",
    category: "fashion",
    image: "/assets/products/backpack.jpg",
    status: "live",
    startsInHours: -5 * 24,
    endsInHours: 48,
    votingDays: 7,
    maxUnitsPerBuyer: 2,
    tiers: [
      [1, 1290],
      [10, 1090],
      [25, 950],
    ],
    shopperUnits: 11,
  },
  {
    key: "rice",
    title: "Thai Hom Mali Rice 5kg",
    description: "New-crop Thai jasmine rice from Thung Kula Ronghai, vacuum-packed in a 5 kg bag.",
    category: "food",
    image: "/assets/products/jasmine-rice.jpg",
    status: "live",
    startsInHours: -3 * 24,
    endsInHours: 96,
    votingDays: 7,
    maxUnitsPerBuyer: 5,
    tiers: [
      [1, 320],
      [30, 280],
      [60, 250],
    ],
    shopperUnits: 37,
  },
  {
    key: "coffeebeans",
    title: "Roasted Coffee Beans 1kg",
    description: "Medium-roast arabica from Doi Chang, with chocolate and caramel notes. Whole beans, 1 kg.",
    category: "food",
    image: "/assets/products/coffee-beans.jpg",
    status: "live",
    startsInHours: -1 * 24,
    endsInHours: 144,
    votingDays: 7,
    maxUnitsPerBuyer: 3,
    tiers: [
      [1, 650],
      [15, 560],
      [30, 490],
    ],
    shopperUnits: 9,
  },
  {
    key: "dumbbells",
    title: "Adjustable Dumbbells 2 × 10kg",
    description: "A pair of adjustable dumbbells from 2 to 10 kg each, with a quick-lock collar and storage case.",
    category: "sports",
    image: "/assets/products/dumbbells.jpg",
    status: "live",
    startsInHours: -6 * 24,
    endsInHours: 30,
    votingDays: 7,
    maxUnitsPerBuyer: 2,
    tiers: [
      [1, 2990],
      [8, 2590],
      [20, 2290],
    ],
    shopperUnits: 14,
  },
  {
    key: "bottle",
    title: "Insulated Water Bottle 1L",
    description: "Double-wall stainless steel bottle that keeps drinks cold for 24 hours. Leak-proof lid.",
    category: "sports",
    image: "/assets/products/water-bottle.jpg",
    status: "live",
    startsInHours: -2 * 24,
    endsInHours: 120,
    votingDays: 7,
    maxUnitsPerBuyer: 4,
    tiers: [
      [1, 490],
      [20, 390],
      [50, 330],
    ],
    shopperUnits: 22,
  },
  {
    key: "controller",
    title: "Wireless Game Controller",
    description: "Bluetooth controller for PC, Android and Switch with hall-effect sticks and 30-hour battery.",
    category: "gaming",
    image: "/assets/products/game-controller.jpg",
    status: "live",
    startsInHours: -3 * 24,
    endsInHours: 96,
    votingDays: 7,
    maxUnitsPerBuyer: 2,
    tiers: [
      [1, 1590],
      [10, 1390],
      [25, 1190],
    ],
    shopperUnits: 13,
  },
  {
    key: "keyboard",
    title: "Mechanical Keyboard",
    description: "75% hot-swappable mechanical keyboard with tactile switches, RGB backlight and USB-C.",
    category: "gaming",
    image: "/assets/products/mechanical-keyboard.jpg",
    status: "live",
    startsInHours: -4 * 24,
    endsInHours: 72,
    votingDays: 7,
    maxUnitsPerBuyer: 2,
    tiers: [
      [1, 2490],
      [10, 2190],
      [20, 1890],
    ],
    shopperUnits: 7,
  },
  {
    key: "speaker",
    title: "Bluetooth Speaker",
    description: "Waterproof portable speaker with 20-hour battery and deep bass.",
    category: "electronics",
    image: "/assets/products/bluetooth-speaker.jpg",
    status: "seller_decision",
    startsInHours: -7 * 24 - 2,
    endsInHours: -2,
    votingDays: 7,
    maxUnitsPerBuyer: 3,
    tiers: [
      [1, 1490],
      [15, 1290],
      [30, 1090],
    ],
    shopperUnits: 18,
  },
  {
    key: "airfryer",
    title: "Air Fryer 5L",
    description: "5-litre air fryer with 8 presets and a dishwasher-safe basket.",
    category: "home-living",
    image: "/assets/products/air-fryer.jpg",
    status: "payment_window",
    startsInHours: -8 * 24,
    endsInHours: -24,
    votingDays: 7,
    maxUnitsPerBuyer: 3,
    tiers: [
      [1, 2490],
      [10, 2190],
      [20, 1890],
    ],
    shopperUnits: 21,
    paidShoppers: 4,
    declinedShoppers: 2,
  },
  {
    key: "band",
    title: "Fitness Band",
    description: "Slim fitness band with step, sleep and heart-rate tracking and a 14-day battery.",
    category: "sports",
    image: "/assets/products/fitness-band.jpg",
    status: "fulfilling",
    startsInHours: -13 * 24,
    endsInHours: -6 * 24,
    votingDays: 7,
    maxUnitsPerBuyer: 2,
    tiers: [
      [1, 1190],
      [8, 990],
      [15, 890],
    ],
    shopperUnits: 9,
    // One state per paying shopper, in order; the demo buyer's order is shipped.
    // The first report was escalated to the admin; the second waits for the seller.
    orderStates: ["delivered", "delivered", "paid", "paid", "shipped", "disputed", "disputed"],
  },
  {
    key: "blender",
    title: "Portable Blender",
    description: "Rechargeable personal blender for smoothies on the go.",
    category: "home-living",
    image: "/assets/products/portable-blender.jpg",
    status: "pending_review",
    startsInHours: 24,
    endsInHours: 8 * 24,
    votingDays: 7,
    maxUnitsPerBuyer: 2,
    tiers: [
      [1, 790],
      [20, 690],
    ],
    shopperUnits: 0,
  },
  {
    key: "yoga",
    title: "Yoga Mat Bundle",
    description: "Non-slip yoga mat with a carry strap and two foam blocks.",
    category: "sports",
    image: "/assets/products/yoga-mat.jpg",
    status: "draft",
    startsInHours: 2 * 24,
    endsInHours: 9 * 24,
    votingDays: 7,
    maxUnitsPerBuyer: null,
    tiers: [
      [1, 690],
      [10, 590],
    ],
    shopperUnits: 0,
  },
  // Twenty additional live products owned by the new sellers.
  {
    key: "newproduct01", title: "Portable Bluetooth Earbuds",
    description: "Portable Bluetooth Earbuds offered by Metro Audio with lower prices when more buyers join the group.",
    category: "electronics", image: "/assets/earphone.jpeg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 790], [10, 710], [25, 630]],
    shopperUnits: 17,
  },
  {
    key: "newproduct02", title: "Fitness Smartwatch",
    description: "Fitness Smartwatch offered by Pulse Wear with lower prices when more buyers join the group.",
    category: "electronics", image: "/assets/watch.jpeg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 1890], [10, 1700], [25, 1510]],
    shopperUnits: 24,
  },
  {
    key: "newproduct03", title: "Compact Power Bank",
    description: "Compact Power Bank offered by Charge Hub with lower prices when more buyers join the group.",
    category: "electronics", image: "/assets/products/power-bank.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 990], [10, 890], [25, 790]],
    shopperUnits: 31,
  },
  {
    key: "newproduct04", title: "Mini Bluetooth Speaker",
    description: "Mini Bluetooth Speaker offered by Sound Avenue with lower prices when more buyers join the group.",
    category: "electronics", image: "/assets/products/bluetooth-speaker.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 1290], [10, 1160], [25, 1030]],
    shopperUnits: 38,
  },
  {
    key: "newproduct05", title: "Minimalist Desk Lamp",
    description: "Minimalist Desk Lamp offered by Cozy Corner with lower prices when more buyers join the group.",
    category: "home-living", image: "/assets/products/desk-lamp.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 890], [10, 800], [25, 710]],
    shopperUnits: 11,
  },
  {
    key: "newproduct06", title: "Home Coffee Brewer",
    description: "Home Coffee Brewer offered by Brew Daily with lower prices when more buyers join the group.",
    category: "home-living", image: "/assets/Boncafe-Drip-Coffee-Maker-1.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 1590], [10, 1430], [25, 1270]],
    shopperUnits: 18,
  },
  {
    key: "newproduct07", title: "Digital Air Fryer",
    description: "Digital Air Fryer offered by Quick Kitchen with lower prices when more buyers join the group.",
    category: "home-living", image: "/assets/products/air-fryer.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 2790], [10, 2510], [25, 2230]],
    shopperUnits: 25,
  },
  {
    key: "newproduct08", title: "Travel Blender",
    description: "Travel Blender offered by Smoothie Spot with lower prices when more buyers join the group.",
    category: "home-living", image: "/assets/products/portable-blender.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 990], [10, 890], [25, 790]],
    shopperUnits: 32,
  },
  {
    key: "newproduct09", title: "Daily Skincare Kit",
    description: "Daily Skincare Kit offered by Pure Glow with lower prices when more buyers join the group.",
    category: "beauty", image: "/assets/skincareset.jpeg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 1190], [10, 1070], [25, 950]],
    shopperUnits: 39,
  },
  {
    key: "newproduct10", title: "SPF50 Sunscreen Bundle",
    description: "SPF50 Sunscreen Bundle offered by Sun Shield with lower prices when more buyers join the group.",
    category: "beauty", image: "/assets/products/sunscreen.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 690], [10, 620], [25, 550]],
    shopperUnits: 12,
  },
  {
    key: "newproduct11", title: "Essential Cotton Tees",
    description: "Essential Cotton Tees offered by Basic Studio with lower prices when more buyers join the group.",
    category: "fashion", image: "/assets/products/tshirt-pack.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 890], [10, 800], [25, 710]],
    shopperUnits: 19,
  },
  {
    key: "newproduct12", title: "Commuter Laptop Backpack",
    description: "Commuter Laptop Backpack offered by Carry Club with lower prices when more buyers join the group.",
    category: "fashion", image: "/assets/products/backpack.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 1490], [10, 1340], [25, 1190]],
    shopperUnits: 26,
  },
  {
    key: "newproduct13", title: "Premium Jasmine Rice 5kg",
    description: "Premium Jasmine Rice 5kg offered by Rice Roots with lower prices when more buyers join the group.",
    category: "food", image: "/assets/products/jasmine-rice.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 390], [10, 350], [25, 310]],
    shopperUnits: 33,
  },
  {
    key: "newproduct14", title: "Northern Thai Coffee Beans",
    description: "Northern Thai Coffee Beans offered by Bean District with lower prices when more buyers join the group.",
    category: "food", image: "/assets/products/coffee-beans.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 790], [10, 710], [25, 630]],
    shopperUnits: 40,
  },
  {
    key: "newproduct15", title: "Home Dumbbell Set",
    description: "Home Dumbbell Set offered by Lift Lab with lower prices when more buyers join the group.",
    category: "sports", image: "/assets/products/dumbbells.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 3290], [10, 2960], [25, 2630]],
    shopperUnits: 13,
  },
  {
    key: "newproduct16", title: "Steel Insulated Bottle",
    description: "Steel Insulated Bottle offered by Hydro Trail with lower prices when more buyers join the group.",
    category: "sports", image: "/assets/products/water-bottle.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 590], [10, 530], [25, 470]],
    shopperUnits: 20,
  },
  {
    key: "newproduct17", title: "Yoga Starter Kit",
    description: "Yoga Starter Kit offered by Yoga Flow with lower prices when more buyers join the group.",
    category: "sports", image: "/assets/products/yoga-mat.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 890], [10, 800], [25, 710]],
    shopperUnits: 27,
  },
  {
    key: "newproduct18", title: "Fitness Tracker Band",
    description: "Fitness Tracker Band offered by Active Pulse with lower prices when more buyers join the group.",
    category: "sports", image: "/assets/products/fitness-band.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 1390], [10, 1250], [25, 1110]],
    shopperUnits: 34,
  },
  {
    key: "newproduct19", title: "Wireless Gaming Controller",
    description: "Wireless Gaming Controller offered by Game Orbit with lower prices when more buyers join the group.",
    category: "gaming", image: "/assets/products/game-controller.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 1790], [10, 1610], [25, 1430]],
    shopperUnits: 41,
  },
  {
    key: "newproduct20", title: "Mechanical Gaming Keyboard",
    description: "Mechanical Gaming Keyboard offered by Key Craft with lower prices when more buyers join the group.",
    category: "gaming", image: "/assets/products/mechanical-keyboard.jpg", status: "live",
    startsInHours: -24, endsInHours: 120, votingDays: 7, maxUnitsPerBuyer: 3,
    tiers: [[1, 2690], [10, 2420], [25, 2150]],
    shopperUnits: 14,
  },
];

/** The demo buyer's own votes, so My Groups has something to show. */
const BUYER_VOTES: Record<string, number> = { earbuds: 2, watch: 1, speaker: 1, airfryer: 2, band: 1 };


/**
 * Ids of the seeded deals that start out live. The deadline jobs keep these
 * open in real time (see keepDemoDealsLive in jobs.ts) so the marketplace is
 * never empty just because the demo data was created days ago.
 */
export const DEMO_LIVE_DEAL_IDS: ReadonlySet<string> = new Set(
  SEED_DEALS.filter((seed) => seed.status === "live").map((seed) => `deal_${seed.key}`)
);

/** Typical packed weight of one unit per category, in grams. */
const CATEGORY_WEIGHT_GRAMS: Record<string, number> = {
  electronics: 400,
  "home-living": 2_500,
  beauty: 300,
  fashion: 600,
  food: 1_000,
  sports: 1_200,
  gaming: 900,
};

function accountId(email: string) {
  return `user_${email.split("@")[0].replace(/[^a-z0-9]/g, "")}`;
}

export function buildSeed(): Tables {
  const t = now();
  const iso = (offsetHours: number) => new Date(t + offsetHours * HOUR).toISOString();
  const createdAt = iso(-30 * 24);
  const tables = Object.fromEntries(TABLE_NAMES.map((name) => [name, []])) as unknown as Tables;

  for (const account of DEMO_ACCOUNTS) {
    const id = accountId(account.email);
    tables.accounts.push({
      id,
      email: account.email,
      passwordHash: hashPassword(account.email, DEMO_PASSWORD),
      createdAt,
    });
    tables.profiles.push({
      id,
      role: account.role,
      fullName: account.name,
      phone: "",
      status: "active",
      votingRestrictedUntil: null,
      referredBy: null,
      createdAt,
    });
  }

  tables.sellerProfiles.push(
    {
      id: accountId("seller@groupbuy.test"),
      shopName: "Win Gadgets",
      description: "Gadgets and home goods at group prices.",
      applicationStatus: "approved",
      commissionRate: null,
      // On the Pro plan, so the demo seller can run many deals and see analytics.
      proUntil: iso(20 * 24),
      bankAccount: "KBank •••• 4821",
      payoutHoldAt: null,
      payoutHoldReason: null,
      rejectionReason: null,
      createdAt,
    },
    {
      id: accountId("pending-seller@groupbuy.test"),
      shopName: "Ploy Crafts",
      description: "Handmade home decor.",
      applicationStatus: "pending",
      commissionRate: null,
      proUntil: null,
      bankAccount: null,
      payoutHoldAt: null,
      payoutHoldReason: null,
      rejectionReason: null,
      createdAt: iso(-2),
    },
    ...SHOPS.map((shop, index) => ({
      id: accountId(shop.email),
      shopName: shop.shopName,
      description: shop.description,
      applicationStatus: "approved" as const,
      commissionRate: shop.commissionRate ?? null,
      proUntil: null,
      bankAccount: `SCB •••• ${String(1000 + index * 37).slice(-4)}`,
      // One seller under review, to show the admin's payout hold.
      payoutHoldAt: shop.email === "seller-extra20@groupbuy.test" ? iso(-30) : null,
      payoutHoldReason: shop.email === "seller-extra20@groupbuy.test" ? "Checking several buyer complaints about delivery." : null,
      rejectionReason: null,
      createdAt: iso(-shop.joinedDaysAgo * 24),
    }))
  );

  tables.addresses.push({
    id: "addr_buyer",
    userId: accountId("buyer@groupbuy.test"),
    recipient: "Buyer",
    phone: "081-234-5678",
    line1: "99/1 Sukhumvit Road",
    line2: "",
    district: "Khlong Toei",
    province: "Bangkok",
    postalCode: "10110",
    isDefault: true,
    createdAt,
  });

  CATEGORIES.forEach(([icon, name, slug], index) => {
    tables.categories.push({ id: `cat_${slug}`, name, slug, icon, sortOrder: index });
  });

  const defaultSellerId = accountId("seller@groupbuy.test");
  const sellerByDeal = new Map(SHOPS.flatMap((shop) => shop.deals.map((key) => [key, accountId(shop.email)] as const)));
  const buyerId = accountId("buyer@groupbuy.test");
  const shopperIds = DEMO_ACCOUNTS.filter((account) => (account.note === "Demo shopper" || account.note === "Additional demo buyer")).map(
    (account) => accountId(account.email)
  );

  for (const seed of SEED_DEALS) {
    const dealId = `deal_${seed.key}`;
    const hasVoting = !["draft", "pending_review"].includes(seed.status);
    const sellerId = sellerByDeal.get(seed.key) ?? defaultSellerId;
    const sellerRate =
      tables.sellerProfiles.find((row) => row.id === sellerId)?.commissionRate ?? DEFAULT_SETTINGS.defaultCommissionRate;
    const deal: Deal = {
      id: dealId,
      sellerId,
      categoryId: `cat_${seed.category}`,
      title: seed.title,
      description: seed.description,
      status: seed.status,
      votingDays: seed.votingDays,
      votingStartsAt: hasVoting ? iso(seed.startsInHours) : null,
      votingEndsAt: hasVoting ? iso(seed.endsInHours) : null,
      maxUnitsPerBuyer: seed.maxUnitsPerBuyer,
      maxTotalUnits: null,
      parcelWeightGrams: seed.parcelWeightGrams ?? CATEGORY_WEIGHT_GRAMS[seed.category] ?? 500,
      // Approved deals have their commission locked, as approveDeal does.
      commissionRate: hasVoting ? sellerRate : null,
      unitsVotedAtClose: null,
      lockedTierId: null,
      lockedUnitPrice: null,
      decisionDeadline: null,
      paymentDeadline: null,
      decidedAt: null,
      cancelReason: null,
      reviewNote: seed.reviewNote ?? null,
      createdAt: iso(Math.min(seed.startsInHours, 0) - 24),
    };
    tables.deals.push(deal);
    tables.dealImages.push({ id: `img_${seed.key}`, dealId, src: seed.image, sortOrder: 0 });

    seed.tiers.forEach(([minUnits, price], index) => {
      const next = seed.tiers[index + 1];
      tables.dealTiers.push({
        id: `tier_${seed.key}_${index + 1}`,
        dealId,
        minUnits,
        maxUnits: next ? next[0] - 1 : null,
        unitPrice: baht(price),
      });
    });

    // Spread shopper units round-robin, respecting the per-buyer cap.
    const cap = seed.maxUnitsPerBuyer ?? 10;
    const perShopper = new Map<string, number>();
    let remaining = seed.shopperUnits;
    for (let i = 0; remaining > 0 && i < shopperIds.length * cap; i++) {
      const shopper = shopperIds[i % shopperIds.length];
      const current = perShopper.get(shopper) ?? 0;
      if (current < cap) {
        perShopper.set(shopper, current + 1);
        remaining--;
      }
    }

    const votes = [...perShopper];
    if (BUYER_VOTES[seed.key]) {
      votes.push([buyerId, BUYER_VOTES[seed.key]]);
    }
    votes.forEach(([voterId, quantity], index) => {
      const votedAt = iso(seed.startsInHours + 1 + index * 3);
      tables.votes.push({
        id: `vote_${seed.key}_${voterId}`,
        dealId,
        buyerId: voterId,
        quantity,
        status: "active",
        reminders: 0,
        respondedAt: null,
        createdAt: votedAt,
        updatedAt: votedAt,
      });
    });

    const stockCap = STOCK_CAPS[seed.key];
    if (stockCap !== undefined) {
      const voted = votes.reduce((sum, [, quantity]) => sum + quantity, 0);
      deal.maxTotalUnits = stockCap === "full" ? voted : Math.max(stockCap, voted);
    }

    if (["seller_decision", "payment_window", "fulfilling"].includes(seed.status)) {
      lockSeedDeal(tables, deal, seed, t);
    }
  }

  seedGrowth(tables, t);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    tables.settings.push({ id: key as SettingKey, value });
  }

  seedNotifications(tables, t);

  return tables;
}

/** Puts a seeded deal past its voting deadline, as the deadline jobs would. */
function lockSeedDeal(tables: Tables, deal: Deal, seed: SeedDeal, t: number) {
  const iso = (offsetHours: number) => new Date(t + offsetHours * HOUR).toISOString();
  const votes = tables.votes.filter((vote) => vote.dealId === deal.id);
  const units = votes.reduce((sum, vote) => sum + vote.quantity, 0);
  const tiers = tables.dealTiers.filter((tier) => tier.dealId === deal.id).sort((a, b) => a.minUnits - b.minUnits);
  const tier = [...tiers].reverse().find((row) => units >= row.minUnits) ?? tiers[0];

  deal.unitsVotedAtClose = units;
  deal.lockedTierId = tier.id;
  deal.lockedUnitPrice = tier.unitPrice;
  deal.decisionDeadline = iso(seed.endsInHours + DEFAULT_SETTINGS.sellerDecisionHours);

  if (seed.status === "seller_decision") {
    return;
  }
  const decidedHours = seed.endsInHours + 2;
  deal.decidedAt = iso(decidedHours);
  deal.paymentDeadline = iso(decidedHours + DEFAULT_SETTINGS.paymentWindowHours);

  const makeOrder = (vote: Vote, index: number, status: OrderStatus): Order => {
    const respondedAt = iso(decidedHours + 1 + index);
    const total = tier.unitPrice * vote.quantity;
    const orderId = `order_${seed.key}_${index + 1}`;
    const shipping = quoteShipping({ weightPerUnitGrams: deal.parcelWeightGrams, quantity: vote.quantity, province: "Bangkok" });
    const rate = deal.commissionRate ?? DEFAULT_SETTINGS.defaultCommissionRate;
    const paymentFee = Math.round(((total + shipping.fee) * DEFAULT_SETTINGS.paymentFeeRate) / 10_000);
    const courier = COURIER_ROTATION[index % COURIER_ROTATION.length];
    Object.assign(vote, { status: "paid", respondedAt, updatedAt: respondedAt });
    tables.payments.push({
      id: `pay_${seed.key}_${index + 1}`,
      orderId,
      provider: "2c2p",
      providerRef: `2c2p_seed_${seed.key}_${index + 1}`,
      method: index % 2 ? "card" : "promptpay",
      amount: total + shipping.fee,
      status: "succeeded",
      createdAt: respondedAt,
    });
    const shipped = status !== "paid";
    const shippedAt = iso(decidedHours + 60 + index * 4);
    const deliveredAt = iso(decidedHours + 100 + index * 4);
    const isBuyer = vote.buyerId === "user_buyer";
    return {
      id: orderId,
      voteId: vote.id,
      dealId: deal.id,
      buyerId: vote.buyerId,
      sellerId: deal.sellerId,
      quantity: vote.quantity,
      unitPrice: tier.unitPrice,
      total,
      shippingFee: shipping.fee,
      shippingCarrier: shipping.carrier,
      paymentFee,
      creditUsed: 0,
      courier: status !== "paid" ? courier : null,
      commissionRate: rate,
      commissionAmount: Math.round((total * rate) / 10_000),
      refundedAmount: 0,
      shippingAddress: isBuyer
        ? {
            recipient: "Buyer",
            phone: "081-234-5678",
            line1: "99/1 Sukhumvit Road",
            line2: "",
            district: "Khlong Toei",
            province: "Bangkok",
            postalCode: "10110",
          }
        : {
            recipient: vote.buyerId.replace("user_shopper", "Shopper "),
            phone: "080-000-0000",
            line1: `${index + 10} Rama IV Road`,
            line2: "",
            district: "Pathum Wan",
            province: "Bangkok",
            postalCode: "10330",
          },
      status,
      trackingNumber: shipped ? `${COURIERS[courier].prefix}${String(4_810_000 + index * 137).padStart(10, "0")}` : null,
      shippedAt: shipped ? shippedAt : null,
      deliveredAt: status === "delivered" ? deliveredAt : null,
      payableAt: status === "delivered" ? deliveredAt : null,
      payoutId: null,
      createdAt: respondedAt,
    };
  };

  const shopperVotes = votes.filter((vote) => vote.buyerId.startsWith("user_shopper"));

  if (seed.status === "fulfilling") {
    const states = seed.orderStates ?? [];
    shopperVotes.forEach((vote, index) => {
      const order = makeOrder(vote, index, states[index] ?? "paid");
      tables.orders.push(order);
      if (order.status === "disputed") {
        Object.assign(order, { deliveredAt: order.shippedAt, payableAt: null });
        const first = !tables.disputes.some((row) => row.orderId.startsWith(`order_${seed.key}_`));
        const base = {
          id: `dispute_${seed.key}_${index + 1}`,
          orderId: order.id,
          openedBy: vote.buyerId,
          orderStatusBefore: "delivered" as const,
          resolution: null,
          resolvedAt: null,
          refundAmount: null,
          resolvedBy: null,
        };
        if (first) {
          // Escalated: the buyer turned down the seller's partial refund, so it's in the admin queue.
          tables.disputes.push({
            ...base,
            reason: "damaged",
            details: "The strap arrived snapped and the screen has a crack.",
            status: "escalated",
            respondBy: null,
            sellerOfferAmount: Math.round(order.total * 0.2),
            sellerMessage: "Sorry about that. We can refund 20% for the strap; the screen crack looks like wear.",
            sellerRespondedAt: new Date(t - 40 * HOUR).toISOString(),
            escalatedAt: new Date(t - 30 * HOUR).toISOString(),
            escalationReason: "buyer_rejected",
            buyerNote: "The band arrived broken in the box. I want a full refund.",
            createdAt: new Date(t - 60 * HOUR).toISOString(),
          });
        } else {
          // Waiting for the seller, who has 3 days to answer (2 left).
          tables.disputes.push({
            ...base,
            reason: "wrong_item",
            details: "I received the black band but ordered the blue one.",
            status: "seller_review",
            respondBy: new Date(t + 2 * 24 * HOUR).toISOString(),
            sellerOfferAmount: null,
            sellerMessage: null,
            sellerRespondedAt: null,
            escalatedAt: null,
            escalationReason: null,
            buyerNote: null,
            createdAt: new Date(t - 24 * HOUR).toISOString(),
          });
        }
      }
    });
    const buyerVote = votes.find((vote) => vote.buyerId === "user_buyer");
    if (buyerVote) {
      const order = makeOrder(buyerVote, shopperVotes.length, "shipped");
      // Shipped two days ago, so it auto-confirms in five.
      order.shippedAt = new Date(t - 2 * 24 * HOUR).toISOString();
      tables.orders.push(order);
    }
    return;
  }

  shopperVotes.forEach((vote, index) => {
    if (index < (seed.paidShoppers ?? 0)) {
      tables.orders.push(makeOrder(vote, index, "paid"));
    } else if (index < (seed.paidShoppers ?? 0) + (seed.declinedShoppers ?? 0)) {
      const respondedAt = iso(decidedHours + 1 + index);
      Object.assign(vote, { status: "declined", respondedAt, updatedAt: respondedAt });
    }
  });
}

/**
 * Simulated growth features: reviews on delivered orders, a referral credit
 * for the demo buyer, Product Boosts, a sponsored banner and Pro plans.
 */
function seedGrowth(tables: Tables, t: number) {
  const iso = (offsetHours: number) => new Date(t + offsetHours * HOUR).toISOString();
  const comments = [
    [5, "Arrived in two days and works perfectly. Great price for the group."],
    [4, "Good quality. Packaging could be better, but happy overall."],
    [5, "Second time buying from this shop. Recommended!"],
    [3, "Okay for the price. Strap feels a bit cheap."],
  ] as const;
  tables.orders
    .filter((order) => order.status === "delivered")
    .forEach((order, index) => {
      const [rating, comment] = comments[index % comments.length];
      tables.reviews.push({
        id: `review_seed_${index + 1}`,
        orderId: order.id,
        dealId: order.dealId,
        sellerId: order.sellerId,
        buyerId: order.buyerId,
        rating,
        comment,
        createdAt: iso(-20 - index * 5),
      });
    });
  // A few older reviews so more shops show a rating.
  const extra: [string, number, string][] = [
    ["user_sellerhome", 5, "Air fryer from Baan Living is excellent. Fast delivery."],
    ["user_sellerbeauty", 4, "Genuine products, well packed."],
    ["user_sellersports", 5, "Dumbbells arrived safely, great group price."],
  ];
  extra.forEach(([sellerId, rating, comment], index) => {
    if (tables.sellerProfiles.some((row) => row.id === sellerId)) {
      tables.reviews.push({
        id: `review_seed_extra_${index + 1}`,
        orderId: `order_history_${index + 1}`,
        dealId: "",
        sellerId,
        buyerId: "user_shopper2",
        rating,
        comment,
        createdAt: iso(-24 * (40 + index * 6)),
      });
    }
  });

  // Shopper 2 joined through the demo buyer's invite link and paid a first order: ฿10 each.
  const credit = DEFAULT_SETTINGS.referralCredit;
  const friend = tables.profiles.find((row) => row.id === "user_shopper2");
  if (friend) {
    friend.referredBy = "user_buyer";
    tables.credits.push(
      { id: "credit_seed_1", userId: "user_shopper2", amount: credit, reason: "referral_friend", relatedId: "user_buyer", createdAt: iso(-72) },
      { id: "credit_seed_2", userId: "user_buyer", amount: credit, reason: "referral_inviter", relatedId: "user_shopper2", createdAt: iso(-72) }
    );
  }

  const purchase = (id: string, sellerId: string, kind: "boost" | "banner" | "pro", dealId: string | null, amount: number, startH: number, endH: number) => {
    if (kind !== "pro" && !tables.deals.some((deal) => deal.id === dealId && deal.sellerId === sellerId)) {
      return;
    }
    tables.sellerPurchases.push({ id, sellerId, kind, dealId, amount, startsAt: iso(startH), endsAt: iso(endH), createdAt: iso(startH) });
  };
  purchase("buy_seed_pro", "user_seller", "pro", null, DEFAULT_SETTINGS.proMonthlyPrice, -10 * 24, 20 * 24);
  purchase("buy_seed_boost_1", "user_seller", "boost", "deal_earbuds", DEFAULT_SETTINGS.boostPrice, -24, 2 * 24);
  const homeDeal = tables.deals.find((deal) => deal.sellerId === "user_sellerhome" && deal.status === "live");
  if (homeDeal) {
    purchase("buy_seed_boost_2", "user_sellerhome", "boost", homeDeal.id, DEFAULT_SETTINGS.boostPrice, -12, 60);
    purchase("buy_seed_banner", "user_sellerhome", "banner", homeDeal.id, DEFAULT_SETTINGS.bannerWeeklyPrice, -2 * 24, 5 * 24);
  }
  const beautyPro = tables.sellerProfiles.find((row) => row.id === "user_sellerbeauty");
  if (beautyPro) {
    beautyPro.proUntil = iso(15 * 24);
    purchase("buy_seed_pro_2", "user_sellerbeauty", "pro", null, DEFAULT_SETTINGS.proMonthlyPrice, -15 * 24, 15 * 24);
  }
}

/** A starting inbox for each demo role, matching the seeded deals. */
function seedNotifications(tables: Tables, t: number) {
  const iso = (offsetHours: number) => new Date(t + offsetHours * HOUR).toISOString();
  const airfryer = tables.deals.find((deal) => deal.id === "deal_airfryer");
  const buyerAirfryer = tables.votes.find((vote) => vote.id === "vote_airfryer_user_buyer");
  const buyerBand = tables.orders.find((order) => order.dealId === "deal_band" && order.buyerId === "user_buyer");
  const escalated = tables.disputes.find((row) => row.status === "escalated");
  const sellerReview = tables.disputes.find((row) => row.status === "seller_review");
  const rows: [string, string, Record<string, unknown>, number, boolean][] = [
    // [userId, type, payload, hours ago, read]
    ["user_buyer", "payment_requested", {
      dealId: "deal_airfryer",
      unitPrice: airfryer?.lockedUnitPrice,
      quantity: buyerAirfryer?.quantity,
      paymentDeadline: airfryer?.paymentDeadline,
    }, 22, false],
    ["user_buyer", "order_shipped", { orderId: buyerBand?.id, trackingNumber: buyerBand?.trackingNumber }, 48, false],
    ["user_buyer", "referral_reward", { amount: DEFAULT_SETTINGS.referralCredit, friend: true, friendName: "Nat" }, 72, false],
    ["user_seller", "decision_needed", { dealId: "deal_speaker", units: 19 }, 2, false],
    ["user_seller", "dispute_opened", { orderId: sellerReview?.orderId, reason: "wrong_item", respondBy: sellerReview?.respondBy }, 24, false],
    ["user_seller", "dispute_escalated", { orderId: escalated?.orderId, reason: "buyer_rejected" }, 30, true],
    ["user_seller", "order_paid", { dealId: "deal_airfryer", orderId: "order_airfryer_1", quantity: 1 }, 21, true],
    ["user_seller", "deal_approved", { dealId: "deal_earbuds" }, 5 * 24, true],
    ["user_admin", "seller_applied", { sellerId: "user_pendingseller", shopName: "Ploy Crafts" }, 2, false],
    ["user_admin", "deal_submitted", { dealId: "deal_blender" }, 20, false],
    ["user_admin", "dispute_escalated", { orderId: escalated?.orderId, reason: "buyer_rejected" }, 30, false],
  ];
  rows.forEach(([userId, type, payload, hoursAgo, read], index) => {
    tables.notifications.push({
      id: `ntf_seed_${index + 1}`,
      userId,
      type,
      payload,
      readAt: read ? iso(-hoursAgo + 1) : null,
      createdAt: iso(-hoursAgo),
    });
  });
}

registerSeeder(buildSeed);
