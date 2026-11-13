import { COURIERS, CourierId, createLabel } from "../shipping";
import { act } from "./act";
import { auth } from "./auth-guard";
import { DAY, now, nowIso } from "./clock";
import { Db, mutate, newId, requireDb } from "./db";
import { ActionResult, fail } from "./errors";
import { disputeIsOpen, escalateDispute, refundableAmount, sellerNet, settleDispute } from "./dispute-core";
import { markDelivered, notifyUser } from "./jobs";
import { formatTHB } from "./money";
import { DEFAULT_SETTINGS, getSetting } from "./settings";
import { BasisPoints, Dispute, Order, Satang, SettingKey } from "./types";

/**
 * Fulfilment and money (CLAUDE.md Phase 4): shipping, delivery, disputes,
 * refunds, payouts, commission and admin settings.
 */

export { sellerNet };

function findOrder(db: Db, orderId: string): Order {
  const order = db.orders.find((row) => row.id === orderId);
  if (!order) {
    fail("Order not found.");
  }
  return order;
}

function openDisputeFor(db: Db, orderId: string): Dispute | undefined {
  return db.disputes.find((dispute) => dispute.orderId === orderId && disputeIsOpen(dispute));
}

// ---------------------------------------------------------------------------
// Seller: shipping
// ---------------------------------------------------------------------------

/**
 * Marks the order shipped. With a courier, a shipping label is created
 * (simulated) and its tracking number used; otherwise the seller's own
 * tracking number, if any.
 */
export function shipOrder(orderId: string, trackingNumber: string, courier: CourierId | null = null): ActionResult {
  return act(() => {
    const db = requireDb();
    const seller = auth(db).seller();
    const order = findOrder(db, orderId);
    if (order.sellerId !== seller.id) {
      fail("Order not found.");
    }
    if (order.status !== "paid") {
      fail(order.status === "disputed" ? "This order has an open dispute." : "This order has already been shipped.");
    }
    if (courier !== null && !COURIERS[courier]) {
      fail("Choose a courier.");
    }
    const tracking = courier ? createLabel(courier, orderId) : trackingNumber.trim() || null;
    const at = nowIso();
    mutate((tx) => {
      tx.update("orders", orderId, { status: "shipped", shippedAt: at, trackingNumber: tracking, courier });
      notifyUser(tx, order.buyerId, "order_shipped", {
        orderId,
        trackingNumber: tracking,
        courier: courier ? COURIERS[courier].name : null,
      });
    });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Buyer: delivery and disputes
// ---------------------------------------------------------------------------

function ownOrder(db: Db, buyerId: string, orderId: string): Order {
  const order = findOrder(db, orderId);
  if (order.buyerId !== buyerId) {
    fail("Order not found.");
  }
  return order;
}

export function confirmDelivery(orderId: string): ActionResult {
  return act(() => {
    const db = requireDb();
    const buyer = auth(db).buyer();
    const order = ownOrder(db, buyer.id, orderId);
    if (order.status !== "shipped") {
      fail(order.status === "delivered" ? "Delivery is already confirmed." : "This order hasn't been shipped yet.");
    }
    mutate((tx) => markDelivered(tx, order, now()));
    return undefined;
  });
}

export const DISPUTE_REASONS: Record<Dispute["reason"], string> = {
  not_delivered: "Not delivered",
  damaged: "Arrived damaged",
  wrong_item: "Wrong item",
  other: "Something else",
};

/** Buyers can raise a problem until the order is paid out to the seller. */
export function canDispute(db: Db, order: Order): boolean {
  return (
    ["paid", "shipped", "delivered"].includes(order.status) && order.payoutId === null && !openDisputeFor(db, order.id)
  );
}

export function openDispute(orderId: string, reason: Dispute["reason"], details: string): ActionResult<string> {
  return act(() => {
    const db = requireDb();
    const buyer = auth(db).buyer();
    const order = ownOrder(db, buyer.id, orderId);
    if (!canDispute(db, order)) {
      fail(
        order.payoutId
          ? "This order has already been paid out. Contact GroupBuy support."
          : "You can't open a dispute on this order right now."
      );
    }
    if (details.trim().length < 10) {
      fail("Describe the problem in at least 10 characters.");
    }
    const id = newId("dispute");
    const at = now();
    const respondBy = new Date(at + getSetting(db, "disputeResponseDays") * DAY).toISOString();
    mutate((tx) => {
      tx.insert("disputes", {
        id,
        orderId,
        openedBy: buyer.id,
        reason,
        details: details.trim(),
        status: "seller_review",
        respondBy,
        sellerOfferAmount: null,
        sellerMessage: null,
        sellerRespondedAt: null,
        escalatedAt: null,
        escalationReason: null,
        buyerNote: null,
        resolvedBy: null,
        orderStatusBefore: order.status,
        resolution: null,
        resolvedAt: null,
        refundAmount: null,
        createdAt: new Date(at).toISOString(),
      });
      // Not payable while a dispute is open.
      tx.update("orders", orderId, { status: "disputed", payableAt: null });
      // The seller answers first; admins only see it if it's escalated.
      notifyUser(tx, order.sellerId, "dispute_opened", { orderId, reason, respondBy });
    });
    return id;
  });
}

// ---------------------------------------------------------------------------
// Seller: answer a problem report
// ---------------------------------------------------------------------------

function findDispute(db: Db, disputeId: string): Dispute {
  const dispute = db.disputes.find((row) => row.id === disputeId);
  if (!dispute) {
    fail("Report not found.");
  }
  return dispute;
}

/**
 * The seller offers a refund (full or partial) or replies without one
 * (`refundAmount` 0). A full refund closes the report straight away; anything
 * else goes to the buyer, who accepts it or sends the case to an admin.
 */
export function respondToDispute(disputeId: string, refundAmount: Satang, message: string): ActionResult {
  return act(() => {
    const db = requireDb();
    const seller = auth(db).seller();
    const dispute = findDispute(db, disputeId);
    const order = findOrder(db, dispute.orderId);
    if (order.sellerId !== seller.id) {
      fail("Report not found.");
    }
    if (dispute.status !== "seller_review") {
      fail("You've already answered this report.");
    }
    const refundable = refundableAmount(order);
    if (!Number.isInteger(refundAmount) || refundAmount < 0 || refundAmount > refundable) {
      fail(`Offer a refund between ฿0 and ${formatTHB(refundable)}.`);
    }
    if (message.trim().length < 5) {
      fail("Write a short message to the buyer.");
    }
    const at = now();
    const atIso = new Date(at).toISOString();
    mutate((tx) => {
      tx.update("disputes", disputeId, {
        sellerOfferAmount: refundAmount,
        sellerMessage: message.trim(),
        sellerRespondedAt: atIso,
      });
      const updated = tx.find("disputes", disputeId)!;
      if (refundAmount === refundable) {
        settleDispute(tx, updated, refundAmount, message.trim(), "buyer_accepted", at);
        return;
      }
      const respondBy = new Date(at + getSetting(db, "disputeResponseDays") * DAY).toISOString();
      tx.update("disputes", disputeId, { status: "awaiting_buyer", respondBy });
      notifyUser(tx, order.buyerId, "dispute_offer", { orderId: order.id, refundAmount, respondBy }, at);
    });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Buyer: accept the seller's offer or ask an admin
// ---------------------------------------------------------------------------

function buyerDisputeAwaitingAnswer(db: Db, buyerId: string, disputeId: string): Dispute {
  const dispute = findDispute(db, disputeId);
  if (dispute.openedBy !== buyerId) {
    fail("Report not found.");
  }
  if (dispute.status !== "awaiting_buyer") {
    fail("There's no seller offer waiting for your answer.");
  }
  return dispute;
}

export function acceptDisputeOffer(disputeId: string): ActionResult {
  return act(() => {
    const db = requireDb();
    const buyer = auth(db).buyer();
    const dispute = buyerDisputeAwaitingAnswer(db, buyer.id, disputeId);
    mutate((tx) =>
      settleDispute(
        tx,
        dispute,
        dispute.sellerOfferAmount ?? 0,
        dispute.sellerMessage ?? "Accepted by the buyer.",
        "buyer_accepted",
        now()
      )
    );
    return undefined;
  });
}

/** Rejects the seller's offer; an admin then decides. */
export function escalateDisputeToAdmin(disputeId: string, note: string): ActionResult {
  return act(() => {
    const db = requireDb();
    const buyer = auth(db).buyer();
    const dispute = buyerDisputeAwaitingAnswer(db, buyer.id, disputeId);
    if (note.trim().length < 5) {
      fail("Tell the admin why the offer isn't enough.");
    }
    mutate((tx) => escalateDispute(tx, dispute, "buyer_rejected", now(), note.trim()));
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Admin: escalated reports
// ---------------------------------------------------------------------------

/** Final decision on an escalated report, with an optional refund (products and shipping). */
export function resolveDispute(disputeId: string, refundAmount: Satang, resolution: string): ActionResult {
  return act(() => {
    const db = requireDb();
    auth(db).admin();
    const dispute = findDispute(db, disputeId);
    if (dispute.status === "resolved") {
      fail("This report is already resolved.");
    }
    if (dispute.status !== "escalated") {
      fail("The seller and buyer are still working this out. It comes to you if they can't agree.");
    }
    const order = findOrder(db, dispute.orderId);
    const refundable = refundableAmount(order);
    if (!Number.isInteger(refundAmount) || refundAmount < 0 || refundAmount > refundable) {
      fail(`Refund between ฿0 and ${formatTHB(refundable)}.`);
    }
    if (!resolution.trim()) {
      fail("Write a short resolution for the buyer and seller.");
    }
    mutate((tx) => settleDispute(tx, dispute, refundAmount, resolution.trim(), "admin", now()));
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Admin: payouts, commission and settings
// ---------------------------------------------------------------------------

/** Delivered, undisputed orders not yet paid out: waiting for release, a hold or a bank account. */
export function payableOrders(db: Db, sellerId: string): Order[] {
  return db.orders.filter(
    (order) =>
      order.sellerId === sellerId && order.status === "delivered" && order.payableAt !== null && order.payoutId === null
  );
}

/** Admin: stop automatic payouts to a seller (e.g. fraud suspicion or many complaints). */
export function holdPayouts(sellerId: string, reason: string): ActionResult {
  return act(() => {
    const db = requireDb();
    auth(db).admin();
    const seller = db.sellerProfiles.find((row) => row.id === sellerId);
    if (!seller) {
      fail("Seller not found.");
    }
    if (seller.payoutHoldAt) {
      fail("Payouts to this seller are already on hold.");
    }
    if (reason.trim().length < 3) {
      fail("Give a reason for the hold.");
    }
    mutate((tx) => {
      tx.update("sellerProfiles", sellerId, { payoutHoldAt: nowIso(), payoutHoldReason: reason.trim() });
      notifyUser(tx, sellerId, "payouts_held", { reason: reason.trim() });
    });
    return undefined;
  });
}

/** Admin: lift a hold; everything that became payable meanwhile is released on the next run. */
export function releasePayouts(sellerId: string): ActionResult {
  return act(() => {
    const db = requireDb();
    auth(db).admin();
    const seller = db.sellerProfiles.find((row) => row.id === sellerId);
    if (!seller?.payoutHoldAt) {
      fail("Payouts to this seller aren't on hold.");
    }
    mutate((tx) => {
      tx.update("sellerProfiles", sellerId, { payoutHoldAt: null, payoutHoldReason: null });
      notifyUser(tx, sellerId, "payouts_released", {});
    });
    return undefined;
  });
}

/** Seller: the bank account 2C2P pays out to. Stored masked; failed payouts retry automatically. */
export function setBankAccount(bank: string, accountNumber: string): ActionResult {
  return act(() => {
    const db = requireDb();
    const seller = auth(db).seller();
    const digits = accountNumber.replace(/\D/g, "");
    if (!bank.trim()) {
      fail("Choose your bank.");
    }
    if (digits.length < 10 || digits.length > 12) {
      fail("Enter a 10–12 digit account number.");
    }
    mutate((tx) => {
      tx.update("sellerProfiles", seller.id, { bankAccount: `${bank.trim()} •••• ${digits.slice(-4)}` });
    });
    return undefined;
  });
}

/** null returns the seller to the platform default. Past orders keep their rate. */
export function setSellerCommission(sellerId: string, rate: BasisPoints | null): ActionResult {
  return act(() => {
    const db = requireDb();
    auth(db).admin();
    if (rate !== null && (!Number.isInteger(rate) || rate < 0 || rate > 5000)) {
      fail("Commission must be between 0% and 50%.");
    }
    if (!db.sellerProfiles.some((row) => row.id === sellerId)) {
      fail("Seller not found.");
    }
    mutate((tx) => {
      tx.update("sellerProfiles", sellerId, { commissionRate: rate });
    });
    return undefined;
  });
}

/** `kind` says how the admin edits it: a percentage (stored in basis points) or baht (stored in satang). */
export const SETTING_LIMITS: Record<
  SettingKey,
  { label: string; unit: string; min: number; max: number; kind?: "percent" | "baht" }
> = {
  votingPeriodMinDays: { label: "Shortest voting period", unit: "days", min: 1, max: 30 },
  votingPeriodMaxDays: { label: "Longest voting period", unit: "days", min: 1, max: 60 },
  votingPeriodDefaultDays: { label: "Default voting period", unit: "days", min: 1, max: 60 },
  sellerDecisionHours: { label: "Seller decision window", unit: "hours", min: 1, max: 168 },
  paymentWindowHours: { label: "Buyer payment window", unit: "hours", min: 1, max: 336 },
  noShowLimit: { label: "No-shows before a restriction", unit: "no-shows", min: 1, max: 20 },
  noShowLookbackDays: { label: "No-show lookback", unit: "days", min: 1, max: 365 },
  noShowRestrictionDays: { label: "Voting restriction", unit: "days", min: 1, max: 365 },
  autoConfirmDeliveryDays: { label: "Auto-confirm delivery after", unit: "days", min: 1, max: 60 },
  disputeResponseDays: { label: "Time to answer a problem report", unit: "days", min: 1, max: 14 },
  defaultCommissionRate: { label: "Default commission", unit: "%", min: 0, max: 5000, kind: "percent" },
  paymentFeeRate: { label: "2C2P payment fee (passed to seller)", unit: "%", min: 0, max: 1000, kind: "percent" },
  referralCredit: { label: "Referral credit, each person", unit: "฿", min: 0, max: 100000, kind: "baht" },
  boostPrice: { label: "Product Boost price", unit: "฿", min: 0, max: 10000000, kind: "baht" },
  boostDays: { label: "Product Boost length", unit: "days", min: 1, max: 30 },
  bannerWeeklyPrice: { label: "Sponsored banner, per week", unit: "฿", min: 0, max: 10000000, kind: "baht" },
  proMonthlyPrice: { label: "Pro plan, per month", unit: "฿", min: 0, max: 10000000, kind: "baht" },
  basicActiveDeals: { label: "Basic plan: deals at once", unit: "deals", min: 1, max: 100 },
  proActiveDeals: { label: "Pro plan: deals at once", unit: "deals", min: 1, max: 500 },
};

export function updateSettings(values: Partial<Record<SettingKey, number>>): ActionResult {
  return act(() => {
    const db = requireDb();
    auth(db).admin();
    const current = Object.fromEntries(
      (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).map((key) => [
        key,
        db.settings.find((row) => row.id === key)?.value ?? DEFAULT_SETTINGS[key],
      ])
    ) as Record<SettingKey, number>;
    const next = { ...current, ...values };

    for (const [key, value] of Object.entries(next) as [SettingKey, number][]) {
      const limit = SETTING_LIMITS[key];
      if (!Number.isInteger(value) || value < limit.min || value > limit.max) {
        fail(`${limit.label} must be a whole number from ${limit.min} to ${limit.max}.`);
      }
    }
    if (next.votingPeriodMinDays > next.votingPeriodMaxDays) {
      fail("The shortest voting period can't be longer than the longest.");
    }
    if (next.votingPeriodDefaultDays < next.votingPeriodMinDays || next.votingPeriodDefaultDays > next.votingPeriodMaxDays) {
      fail("The default voting period must be between the shortest and longest.");
    }

    mutate((tx) => {
      for (const [key, value] of Object.entries(next) as [SettingKey, number][]) {
        if (tx.find("settings", key)) {
          tx.update("settings", key, { value });
        } else {
          tx.insert("settings", { id: key, value });
        }
      }
    });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export type Earnings = {
  /** Paid or shipped, not yet delivered (or disputed) */
  inProgress: Satang;
  payable: Satang;
  paidOut: Satang;
  commission: Satang;
  /** 2C2P fees passed through on this seller's orders */
  paymentFees: Satang;
};

export function sellerEarnings(db: Db, sellerId: string): Earnings {
  const result: Earnings = { inProgress: 0, payable: 0, paidOut: 0, commission: 0, paymentFees: 0 };
  for (const order of db.orders) {
    if (order.sellerId !== sellerId || order.status === "refunded") {
      continue;
    }
    const net = sellerNet(order);
    result.commission += order.commissionAmount;
    result.paymentFees += order.paymentFee;
    if (order.payoutId) {
      result.paidOut += net;
    } else if (order.status === "delivered" && order.payableAt) {
      result.payable += net;
    } else {
      result.inProgress += net;
    }
  }
  return result;
}

export function disputeForOrder(db: Db, orderId: string): Dispute | undefined {
  return [...db.disputes]
    .filter((dispute) => dispute.orderId === orderId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}
