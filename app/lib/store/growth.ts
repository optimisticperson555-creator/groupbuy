import { act } from "./act";
import { auth } from "./auth-guard";
import { DAY, now } from "./clock";
import { Db, mutate, newId, readPendingReferral, requireDb, Tx, writePendingReferral } from "./db";
import { ActionResult, fail } from "./errors";
import { formatTHB } from "./money";
import { notifyUser } from "./notify";
import { getSetting } from "./settings";
import { Deal, Order, Satang, SellerPurchase, Setting } from "./types";

/**
 * Growth features from the report, simulated for the prototype:
 * referral credits (Section 3.3), reviews (3.3), Product Boost, sponsored
 * banners and the Pro plan (5.3). Seller purchases succeed instantly; no real
 * money moves.
 */

type Rows = { settings: readonly Setting[] };

function settingsOf(tx: Tx): Rows {
  return { settings: tx.all("settings") };
}

// ---------------------------------------------------------------------------
// Referral credits
// ---------------------------------------------------------------------------

export function creditBalance(db: Pick<Db, "credits">, userId: string): Satang {
  return db.credits.filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.amount, 0);
}

/** Called when a page opens from an invite link (`?ref=`). Kept until the buyer's first vote. */
export function rememberReferral(inviterId: string) {
  if (typeof window !== "undefined" && inviterId) {
    writePendingReferral(inviterId);
  }
}

/**
 * On a buyer's vote: links them to the inviter from the pending invite link,
 * once, if they're new (no paid orders yet) and the inviter is another buyer.
 */
export function linkReferral(tx: Tx, buyerId: string) {
  const inviterId = readPendingReferral();
  if (!inviterId) {
    return;
  }
  writePendingReferral(null);
  const buyer = tx.find("profiles", buyerId);
  const inviter = tx.find("profiles", inviterId);
  const hasPaid = tx.all("orders").some((order) => order.buyerId === buyerId);
  if (!buyer || buyer.referredBy || hasPaid || !inviter || inviter.role !== "buyer" || inviterId === buyerId) {
    return;
  }
  tx.update("profiles", buyerId, { referredBy: inviterId });
}

/** After a referred buyer's first paid order: ฿10 credit for them and for the inviter. */
export function rewardReferral(tx: Tx, buyerId: string, at: number) {
  const buyer = tx.find("profiles", buyerId);
  if (!buyer?.referredBy) {
    return;
  }
  if (tx.all("credits").some((entry) => entry.userId === buyerId && entry.reason === "referral_friend")) {
    return;
  }
  const amount = getSetting(settingsOf(tx), "referralCredit");
  const createdAt = new Date(at).toISOString();
  tx.insert("credits", { id: newId("credit"), userId: buyerId, amount, reason: "referral_friend", relatedId: buyer.referredBy, createdAt });
  tx.insert("credits", { id: newId("credit"), userId: buyer.referredBy, amount, reason: "referral_inviter", relatedId: buyerId, createdAt });
  notifyUser(tx, buyerId, "referral_reward", { amount, friend: false }, at);
  notifyUser(tx, buyer.referredBy, "referral_reward", { amount, friend: true, friendName: buyer.fullName }, at);
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export function canReview(db: Db, order: Order): boolean {
  return order.status === "delivered" && !db.reviews.some((review) => review.orderId === order.id);
}

export function submitReview(orderId: string, rating: number, comment: string): ActionResult {
  return act(() => {
    const db = requireDb();
    const buyer = auth(db).buyer();
    const order = db.orders.find((row) => row.id === orderId && row.buyerId === buyer.id);
    if (!order) {
      fail("Order not found.");
    }
    if (!canReview(db, order)) {
      fail(order.status === "delivered" ? "You've already reviewed this order." : "You can review once the order is delivered.");
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      fail("Choose 1 to 5 stars.");
    }
    if (comment.trim().length > 500) {
      fail("Keep the review under 500 characters.");
    }
    const at = now();
    mutate((tx) => {
      tx.insert("reviews", {
        id: newId("review"),
        orderId,
        dealId: order.dealId,
        sellerId: order.sellerId,
        buyerId: buyer.id,
        rating,
        comment: comment.trim(),
        createdAt: new Date(at).toISOString(),
      });
      notifyUser(tx, order.sellerId, "review_received", { orderId, rating }, at);
    });
    return undefined;
  });
}

export type Rating = { average: number; count: number };

export function sellerRating(db: Pick<Db, "reviews">, sellerId: string): Rating {
  const rows = db.reviews.filter((review) => review.sellerId === sellerId);
  return {
    count: rows.length,
    average: rows.length ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 10) / 10 : 0,
  };
}

// ---------------------------------------------------------------------------
// Seller purchases: Product Boost, sponsored banner, Pro plan
// ---------------------------------------------------------------------------

function activePurchase(db: Pick<Db, "sellerPurchases">, kind: SellerPurchase["kind"], match: (row: SellerPurchase) => boolean, at: number) {
  return db.sellerPurchases.find(
    (row) => row.kind === kind && match(row) && Date.parse(row.startsAt) <= at && Date.parse(row.endsAt) > at
  );
}

export function activeBoost(db: Pick<Db, "sellerPurchases">, dealId: string, at = now()) {
  return activePurchase(db, "boost", (row) => row.dealId === dealId, at);
}

export function activeBanner(db: Pick<Db, "sellerPurchases">, dealId: string, at = now()) {
  return activePurchase(db, "banner", (row) => row.dealId === dealId, at);
}

export function isPro(db: Pick<Db, "sellerProfiles">, sellerId: string, at = now()): boolean {
  const until = db.sellerProfiles.find((row) => row.id === sellerId)?.proUntil;
  return Boolean(until && Date.parse(until) > at);
}

/** How many deals a seller may have in review or live at once: Basic 3, Pro 10. */
export function activeDealLimit(db: Pick<Db, "sellerProfiles" | "settings">, sellerId: string, at = now()) {
  return getSetting(db, isPro(db, sellerId, at) ? "proActiveDeals" : "basicActiveDeals");
}

export function activeDealCount(db: Pick<Db, "deals">, sellerId: string) {
  return db.deals.filter((deal) => deal.sellerId === sellerId && (deal.status === "pending_review" || deal.status === "live")).length;
}

function promotableDeal(db: Db, sellerId: string, dealId: string): Deal {
  const deal = db.deals.find((row) => row.id === dealId && row.sellerId === sellerId);
  if (!deal) {
    fail("Deal not found.");
  }
  if (deal.status !== "live" || !deal.votingEndsAt || Date.parse(deal.votingEndsAt) <= now()) {
    fail("Only live deals can be promoted.");
  }
  return deal;
}

/** Product Boost: the deal shows first in the marketplace for a few days (simulated ฿200 charge). */
export function buyBoost(dealId: string): ActionResult {
  return act(() => {
    const db = requireDb();
    const seller = auth(db).approvedSeller();
    promotableDeal(db, seller.id, dealId);
    if (activeBoost(db, dealId)) {
      fail("This deal is already boosted.");
    }
    const at = now();
    const amount = getSetting(db, "boostPrice");
    mutate((tx) => {
      tx.insert("sellerPurchases", {
        id: newId("buy"),
        sellerId: seller.id,
        kind: "boost",
        dealId,
        amount,
        startsAt: new Date(at).toISOString(),
        endsAt: new Date(at + getSetting(db, "boostDays") * DAY).toISOString(),
        createdAt: new Date(at).toISOString(),
      });
    });
    return undefined;
  });
}

/** Sponsored banner on the home page for 1–4 weeks (simulated charge per week). */
export function bookBanner(dealId: string, weeks: number): ActionResult {
  return act(() => {
    const db = requireDb();
    const seller = auth(db).approvedSeller();
    promotableDeal(db, seller.id, dealId);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 4) {
      fail("Book 1 to 4 weeks.");
    }
    if (activeBanner(db, dealId)) {
      fail("This deal already has a banner running.");
    }
    const at = now();
    mutate((tx) => {
      tx.insert("sellerPurchases", {
        id: newId("buy"),
        sellerId: seller.id,
        kind: "banner",
        dealId,
        amount: weeks * getSetting(db, "bannerWeeklyPrice"),
        startsAt: new Date(at).toISOString(),
        endsAt: new Date(at + weeks * 7 * DAY).toISOString(),
        createdAt: new Date(at).toISOString(),
      });
    });
    return undefined;
  });
}

/** Pro plan for 30 days (simulated ฿590 charge). Extends an active plan. */
export function subscribePro(): ActionResult {
  return act(() => {
    const db = requireDb();
    const seller = auth(db).approvedSeller();
    const at = now();
    const current = db.sellerProfiles.find((row) => row.id === seller.id)?.proUntil;
    const start = current && Date.parse(current) > at ? Date.parse(current) : at;
    const end = start + 30 * DAY;
    mutate((tx) => {
      tx.insert("sellerPurchases", {
        id: newId("buy"),
        sellerId: seller.id,
        kind: "pro",
        dealId: null,
        amount: getSetting(db, "proMonthlyPrice"),
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        createdAt: new Date(at).toISOString(),
      });
      tx.update("sellerProfiles", seller.id, { proUntil: new Date(end).toISOString() });
    });
    return undefined;
  });
}

export function purchaseLabel(row: SellerPurchase) {
  return row.kind === "boost" ? "Product Boost" : row.kind === "banner" ? "Sponsored banner" : "Pro plan";
}

export function formatPurchase(row: SellerPurchase) {
  return `${purchaseLabel(row)} · ${formatTHB(row.amount)}`;
}
