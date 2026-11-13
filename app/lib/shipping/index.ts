/**
 * Courier boundary. Everything that asks a courier for a price goes through
 * this module so a real courier API (Flash, Kerry, Thailand Post) can replace
 * the mock later, the same way app/lib/payments wraps the payment provider.
 *
 * The mock prices one parcel by its total weight and the buyer's region.
 * The buyer pays this fee on top of the product price; the platform takes no
 * commission on it. Amounts are satang.
 */

/** The rate buyers are quoted; the seller then picks one of the partner couriers for the label. */
export const CARRIER = "Standard parcel (simulated)";

export type CourierId = "flash" | "kex" | "jt";

/** Partner couriers from the report; label creation is simulated. */
export const COURIERS: Record<CourierId, { name: string; prefix: string }> = {
  flash: { name: "Flash Express", prefix: "TH" },
  kex: { name: "KEX Express", prefix: "KEX" },
  jt: { name: "J&T Express", prefix: "JT" },
};

/** A simulated shipping label: returns a tracking number in the courier's style. */
export function createLabel(courier: CourierId, orderId: string): string {
  let hash = 0;
  for (const char of `${orderId}-${Date.now()}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `${COURIERS[courier].prefix}${String(hash).padStart(10, "0").slice(0, 10)}`;
}

export type ShippingZone = "bangkok" | "upcountry";

export const ZONE_LABELS: Record<ShippingZone, string> = {
  bangkok: "Bangkok and nearby",
  upcountry: "Other provinces",
};

/** Bangkok and its neighbouring provinces get the cheaper rate. */
const BANGKOK_ZONE = new Set(
  ["bangkok", "nonthaburi", "pathum thani", "samut prakan", "samut sakhon", "nakhon pathom"].map(normalize)
);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function zoneFor(province: string): ShippingZone {
  const name = normalize(province);
  // "Krung Thep" and "Bangkok Metropolis" also count as Bangkok.
  return BANGKOK_ZONE.has(name) || name.includes("bangkok") || name.includes("krungthep") ? "bangkok" : "upcountry";
}

/** [max grams, Bangkok fee, other provinces fee], in baht */
const RATE_TABLE: [number, number, number][] = [
  [1_000, 35, 45],
  [3_000, 50, 65],
  [5_000, 70, 90],
  [10_000, 110, 140],
  [20_000, 180, 230],
];
/** Per extra kilogram above the table, in baht */
const EXTRA_PER_KG: Record<ShippingZone, number> = { bangkok: 10, upcountry: 15 };

export type ShippingQuote = {
  fee: number;
  carrier: string;
  zone: ShippingZone;
  weightGrams: number;
  /** Delivery estimate in days */
  etaDays: [number, number];
};

/** One parcel for the whole order: weight per unit × quantity. */
export function quoteShipping(input: { weightPerUnitGrams: number; quantity: number; province: string }): ShippingQuote {
  const zone = zoneFor(input.province);
  const weightGrams = Math.max(1, Math.round(input.weightPerUnitGrams)) * Math.max(1, input.quantity);
  const column = zone === "bangkok" ? 1 : 2;
  const row = RATE_TABLE.find(([max]) => weightGrams <= max);
  let baht: number;
  if (row) {
    baht = row[column];
  } else {
    const top = RATE_TABLE[RATE_TABLE.length - 1];
    const extraKg = Math.ceil((weightGrams - top[0]) / 1_000);
    baht = top[column] + extraKg * EXTRA_PER_KG[zone];
  }
  return {
    fee: baht * 100,
    carrier: CARRIER,
    zone,
    weightGrams,
    etaDays: zone === "bangkok" ? [1, 2] : [2, 4],
  };
}

/** The cheapest possible fee for one unit, for the "+ shipping from" note on deal pages. */
export function lowestShippingFee(weightPerUnitGrams: number): number {
  return quoteShipping({ weightPerUnitGrams, quantity: 1, province: "Bangkok" }).fee;
}

export function formatWeight(grams: number) {
  return grams >= 1_000 ? `${(grams / 1_000).toLocaleString("en-US", { maximumFractionDigits: 2 })} kg` : `${grams} g`;
}
