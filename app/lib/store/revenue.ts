import { TIME_ZONE } from "./clock";
import { Db } from "./db";
import { sellerNet } from "./fulfilment";
import { BasisPoints, Order, Satang, SellerPurchase } from "./types";

/**
 * Platform revenue per seller for the admin Revenue page. Orders are counted
 * in the period they were paid. Money:
 * - sales: product totals the buyers paid (no shipping)
 * - refunded: everything returned to buyers (may include shipping)
 * - commission: the platform's earnings, after refunds
 * - shipping: fees buyers paid, passed on to the courier
 * - paymentFees: 2C2P fees, passed through to the seller (not platform revenue)
 * - credits: referral credit buyers spent, paid by the platform (a marketing cost)
 * - sellerPending / sellerPaidOut: what the seller gets, before and after payout
 * - boosts / banners / subscriptions: seller services, counted when bought
 */

export type RevenueTotals = {
  orders: number;
  sales: Satang;
  refunded: Satang;
  commission: Satang;
  shipping: Satang;
  paymentFees: Satang;
  credits: Satang;
  sellerPending: Satang;
  sellerPaidOut: Satang;
  boosts: Satang;
  banners: Satang;
  subscriptions: Satang;
  /** Commission + boosts + banners + subscriptions */
  revenue: Satang;
};

export type DealRevenue = RevenueTotals & { dealId: string; title: string; commissionRate: BasisPoints };

export type SellerRevenue = RevenueTotals & { sellerId: string; shopName: string; deals: DealRevenue[] };

function emptyTotals(): RevenueTotals {
  return {
    orders: 0,
    sales: 0,
    refunded: 0,
    commission: 0,
    shipping: 0,
    paymentFees: 0,
    credits: 0,
    sellerPending: 0,
    sellerPaidOut: 0,
    boosts: 0,
    banners: 0,
    subscriptions: 0,
    revenue: 0,
  };
}

function add(totals: RevenueTotals, order: Order) {
  const net = sellerNet(order);
  totals.orders += 1;
  totals.sales += order.total;
  totals.refunded += order.refundedAmount;
  totals.commission += order.commissionAmount;
  totals.revenue += order.commissionAmount;
  totals.shipping += order.shippingFee;
  totals.paymentFees += order.paymentFee;
  totals.credits += order.creditUsed;
  if (order.payoutId) {
    totals.sellerPaidOut += net;
  } else {
    totals.sellerPending += net;
  }
}

function addPurchase(totals: RevenueTotals, purchase: SellerPurchase) {
  const key = purchase.kind === "boost" ? "boosts" : purchase.kind === "banner" ? "banners" : "subscriptions";
  totals[key] += purchase.amount;
  totals.revenue += purchase.amount;
}

export type RevenuePeriod = "this_month" | "last_month" | "all";

const monthKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" });

/** "2026-11" for a timestamp, in Bangkok time. */
export function bangkokMonth(at: string | number) {
  return monthKey.format(new Date(at)).slice(0, 7);
}

function inPeriod(createdAt: string, period: RevenuePeriod, at: number) {
  if (period === "all") {
    return true;
  }
  const current = bangkokMonth(at);
  if (period === "this_month") {
    return bangkokMonth(createdAt) === current;
  }
  const [year, month] = current.split("-").map(Number);
  const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  return bangkokMonth(createdAt) === previous;
}

/** One row per seller with orders in the period, biggest commission first, plus platform totals. */
export function revenueBySeller(db: Db, period: RevenuePeriod, at: number): { sellers: SellerRevenue[]; totals: RevenueTotals } {
  const sellers = new Map<string, SellerRevenue>();
  const totals = emptyTotals();

  const sellerRow = (sellerId: string) => {
    let row = sellers.get(sellerId);
    if (!row) {
      row = {
        ...emptyTotals(),
        sellerId,
        shopName: db.sellerProfiles.find((profile) => profile.id === sellerId)?.shopName ?? "Unknown shop",
        deals: [],
      };
      sellers.set(sellerId, row);
    }
    return row;
  };

  for (const purchase of db.sellerPurchases) {
    if (inPeriod(purchase.createdAt, period, at)) {
      addPurchase(sellerRow(purchase.sellerId), purchase);
      addPurchase(totals, purchase);
    }
  }

  for (const order of db.orders) {
    if (!inPeriod(order.createdAt, period, at)) {
      continue;
    }
    const seller = sellerRow(order.sellerId);
    let deal = seller.deals.find((row) => row.dealId === order.dealId);
    if (!deal) {
      deal = {
        ...emptyTotals(),
        dealId: order.dealId,
        title: db.deals.find((row) => row.id === order.dealId)?.title ?? "Deleted deal",
        commissionRate: order.commissionRate,
      };
      seller.deals.push(deal);
    }
    add(deal, order);
    add(seller, order);
    add(totals, order);
  }

  const rows = [...sellers.values()].sort((a, b) => b.revenue - a.revenue);
  for (const row of rows) {
    row.deals.sort((a, b) => b.commission - a.commission);
  }
  return { sellers: rows, totals };
}
