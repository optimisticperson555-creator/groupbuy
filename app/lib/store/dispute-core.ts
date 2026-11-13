import { refund } from "../payments";
import { newId, Tx } from "./db";
import { fail } from "./errors";
import { commissionOn } from "./money";
import { notifyAdmins, notifyUser } from "./notify";
import { Dispute, Order, Satang } from "./types";

/**
 * Money and state changes for problem reports, shared by the store actions
 * (fulfilment.ts) and the deadline jobs (jobs.ts). Flow (CLAUDE.md, "Problem
 * reports"): seller_review → awaiting_buyer → resolved, or → escalated → resolved.
 */

export function disputeIsOpen(dispute: Dispute) {
  return dispute.status !== "resolved";
}

/** What the buyer paid in total: products plus shipping. */
export function orderCharged(order: Order): Satang {
  return order.total + order.shippingFee;
}

/** What can still be refunded on an order. */
export function refundableAmount(order: Order): Satang {
  return orderCharged(order) - order.refundedAmount;
}

/** The product amount the seller keeps: refunds come out of the product total first, then shipping. */
export function sellerKeeps(order: Order): Satang {
  return order.total - Math.min(order.refundedAmount, order.total);
}

/**
 * What the seller receives for an order: the product amount they keep, minus
 * commission, minus the 2C2P payment fee (passed through). Shipping goes to
 * the courier. Never below ฿0: on a full refund the platform absorbs the fee.
 */
export function sellerNet(order: Order): Satang {
  return Math.max(0, sellerKeeps(order) - order.commissionAmount - order.paymentFee);
}

/**
 * Closes a dispute with an optional refund. A refund of everything paid
 * (products and shipping) refunds the order; anything less returns it to its
 * status before the dispute. Commission is recalculated on what the seller keeps.
 */
export function settleDispute(
  tx: Tx,
  dispute: Dispute,
  refundAmount: Satang,
  resolution: string,
  resolvedBy: NonNullable<Dispute["resolvedBy"]>,
  at: number
) {
  const order = tx.find("orders", dispute.orderId);
  if (!order) {
    fail("Order not found.");
  }
  const refundable = refundableAmount(order);
  if (!Number.isInteger(refundAmount) || refundAmount < 0 || refundAmount > refundable) {
    fail("That refund is more than the buyer paid.");
  }
  const atIso = new Date(at).toISOString();

  if (refundAmount > 0) {
    const payment = tx.all("payments").find((row) => row.orderId === order.id && row.status === "succeeded");
    const result = refund({ providerRef: payment?.providerRef ?? "", amount: refundAmount });
    if (!result.ok) {
      fail(result.error);
    }
    tx.insert("payments", {
      id: newId("pay"),
      orderId: order.id,
      provider: payment?.provider ?? "mock",
      providerRef: result.providerRef,
      method: payment?.method ?? "card",
      amount: refundAmount,
      status: "refund",
      createdAt: atIso,
    });
  }

  tx.update("disputes", dispute.id, {
    status: "resolved",
    resolution,
    refundAmount,
    resolvedAt: atIso,
    resolvedBy,
    respondBy: null,
  });

  const refundedAmount = order.refundedAmount + refundAmount;
  const kept = order.total - Math.min(refundedAmount, order.total);
  const base = { refundedAmount, commissionAmount: commissionOn(kept, order.commissionRate) };
  if (refundedAmount >= orderCharged(order)) {
    tx.update("orders", order.id, { ...base, status: "refunded", payableAt: null });
  } else if (dispute.orderStatusBefore === "delivered") {
    tx.update("orders", order.id, { ...base, status: "delivered", payableAt: atIso });
  } else {
    tx.update("orders", order.id, { ...base, status: dispute.orderStatusBefore });
  }

  const payload = { orderId: order.id, refundAmount, resolution, resolvedBy };
  notifyUser(tx, order.buyerId, "dispute_resolved", payload, at);
  notifyUser(tx, order.sellerId, "dispute_resolved", payload, at);
}

/** Hands a dispute to the admins, who decide. */
export function escalateDispute(
  tx: Tx,
  dispute: Dispute,
  reason: NonNullable<Dispute["escalationReason"]>,
  at: number,
  buyerNote: string | null = null
) {
  const order = tx.find("orders", dispute.orderId);
  tx.update("disputes", dispute.id, {
    status: "escalated",
    escalationReason: reason,
    escalatedAt: new Date(at).toISOString(),
    buyerNote,
    respondBy: null,
  });
  const payload = { orderId: dispute.orderId, reason };
  notifyAdmins(tx, "dispute_escalated", payload, at);
  if (order) {
    notifyUser(tx, order.buyerId, "dispute_escalated", payload, at);
    notifyUser(tx, order.sellerId, "dispute_escalated", payload, at);
  }
}
