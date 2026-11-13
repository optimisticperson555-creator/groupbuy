import { DAY, HOUR, now } from "./clock";
import { mutate, newId, subscribe, Tx } from "./db";
import { escalateDispute, sellerNet, settleDispute } from "./dispute-core";
import { notifyAdmins, notifyUser } from "./notify";
import { DEMO_LIVE_DEAL_IDS } from "./seed";
import { getSetting } from "./settings";
import { Deal, Order } from "./types";

export { notifyAdmins, notifyUser };

/**
 * Deadline jobs (CLAUDE.md, "Scheduled jobs"). There is no server, so they run
 * lazily: before every store action and from <DeadlineRunner> while a page is
 * open. Each job uses the deadline itself as its timestamp, so jumping the
 * clock forward several days replays every step in order. Running them again
 * changes nothing.
 */

function settings(tx: Tx) {
  return { settings: tx.all("settings") };
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function activeVotes(tx: Tx, dealId: string) {
  return tx.all("votes").filter((vote) => vote.dealId === dealId && vote.status === "active");
}

/** Voting deadline: lock the tier from units voted and hand over to the seller. */
function closeVoting(tx: Tx, deal: Deal, at: number) {
  const votes = activeVotes(tx, deal.id);
  const units = votes.reduce((sum, vote) => sum + vote.quantity, 0);

  if (units === 0) {
    tx.update("deals", deal.id, { status: "completed", unitsVotedAtClose: 0 });
    notifyUser(tx, deal.sellerId, "deal_closed_no_votes", { dealId: deal.id }, at);
    return;
  }

  const tiers = tx
    .all("dealTiers")
    .filter((tier) => tier.dealId === deal.id)
    .sort((a, b) => a.minUnits - b.minUnits);
  const tier = [...tiers].reverse().find((row) => units >= row.minUnits) ?? tiers[0];

  tx.update("deals", deal.id, {
    status: "seller_decision",
    unitsVotedAtClose: units,
    lockedTierId: tier?.id ?? null,
    lockedUnitPrice: tier?.unitPrice ?? null,
    decisionDeadline: iso(at + getSetting(settings(tx), "sellerDecisionHours") * HOUR),
  });
  notifyUser(tx, deal.sellerId, "decision_needed", { dealId: deal.id, units }, at);
}

/** Cancels a deal at the seller decision step. No buyer has paid yet. */
export function cancelAtDecision(tx: Tx, deal: Deal, reason: "seller" | "decision_timeout", at: number) {
  tx.update("deals", deal.id, { status: "cancelled", cancelReason: reason, decidedAt: iso(at) });
  for (const vote of activeVotes(tx, deal.id)) {
    tx.update("votes", vote.id, { status: "cancelled", updatedAt: iso(at) });
    notifyUser(tx, vote.buyerId, "deal_cancelled", { dealId: deal.id }, at);
  }
  if (reason === "decision_timeout") {
    notifyUser(tx, deal.sellerId, "decision_timed_out", { dealId: deal.id }, at);
  }
}

/** Payment deadline: unanswered votes become no-shows, then shipping starts. */
function closePaymentWindow(tx: Tx, deal: Deal, at: number) {
  const limit = getSetting(settings(tx), "noShowLimit");
  const lookback = getSetting(settings(tx), "noShowLookbackDays") * DAY;
  const restriction = getSetting(settings(tx), "noShowRestrictionDays") * DAY;

  for (const vote of activeVotes(tx, deal.id)) {
    tx.update("votes", vote.id, { status: "expired", respondedAt: iso(at), updatedAt: iso(at) });
    tx.insert("noShowEvents", { id: newId("noshow"), buyerId: vote.buyerId, dealId: deal.id, createdAt: iso(at) });

    const recent = tx
      .all("noShowEvents")
      .filter((event) => event.buyerId === vote.buyerId && Date.parse(event.createdAt) > at - lookback).length;
    const profile = tx.find("profiles", vote.buyerId);
    if (recent >= limit && profile) {
      const until = at + restriction;
      if (!profile.votingRestrictedUntil || Date.parse(profile.votingRestrictedUntil) < until) {
        tx.update("profiles", profile.id, { votingRestrictedUntil: iso(until) });
      }
      notifyUser(tx, vote.buyerId, "voting_restricted", { until: iso(until) }, at);
    } else {
      notifyUser(tx, vote.buyerId, "payment_missed", { dealId: deal.id, count: recent, limit }, at);
    }
  }

  const paid = tx.all("orders").some((order) => order.dealId === deal.id);
  tx.update("deals", deal.id, { status: paid ? "fulfilling" : "completed" });
  notifyUser(tx, deal.sellerId, paid ? "ready_to_ship" : "deal_closed_no_payments", { dealId: deal.id }, at);
}

function hasOpenDispute(tx: Tx, orderId: string) {
  return tx.all("disputes").some((dispute) => dispute.orderId === orderId && dispute.status !== "resolved");
}

/**
 * Problem-report deadlines: a seller who doesn't answer in time sends the case
 * to an admin; a buyer who doesn't answer the seller's offer accepts it.
 */
function runDisputeDeadlines(tx: Tx, at: number): number {
  let ran = 0;
  for (const dispute of tx.all("disputes")) {
    if (!dispute.respondBy || Date.parse(dispute.respondBy) > at) {
      continue;
    }
    const due = Date.parse(dispute.respondBy);
    if (dispute.status === "seller_review") {
      escalateDispute(tx, dispute, "seller_timeout", due);
      ran++;
    } else if (dispute.status === "awaiting_buyer") {
      settleDispute(
        tx,
        dispute,
        dispute.sellerOfferAmount ?? 0,
        dispute.sellerMessage ?? "The buyer didn't answer the seller's offer in time.",
        "buyer_timeout",
        due
      );
      ran++;
    }
  }
  return ran;
}

/** Delivery confirmed (by the buyer or automatically): the order becomes payable to the seller. */
export function markDelivered(tx: Tx, order: Order, at: number) {
  tx.update("orders", order.id, { status: "delivered", deliveredAt: iso(at), payableAt: iso(at) });
  notifyUser(tx, order.sellerId, "order_delivered", { orderId: order.id }, at);
}

/** Shipped orders are confirmed automatically after the configured days, unless disputed. */
function autoConfirmDeliveries(tx: Tx, at: number): number {
  const wait = getSetting(settings(tx), "autoConfirmDeliveryDays") * DAY;
  let ran = 0;
  for (const order of tx.all("orders")) {
    if (order.status !== "shipped" || !order.shippedAt || hasOpenDispute(tx, order.id)) {
      continue;
    }
    const due = Date.parse(order.shippedAt) + wait;
    if (due <= at) {
      markDelivered(tx, order, due);
      notifyUser(tx, order.buyerId, "delivery_auto_confirmed", { orderId: order.id }, due);
      ran++;
    }
  }
  return ran;
}

/** A fulfilling deal completes once every order is delivered or refunded and no dispute is open. */
function completeFulfilledDeals(tx: Tx, at: number): number {
  let ran = 0;
  for (const deal of tx.all("deals")) {
    if (deal.status !== "fulfilling") {
      continue;
    }
    const orders = tx.all("orders").filter((order) => order.dealId === deal.id);
    const done = orders.every(
      (order) => (order.status === "delivered" || order.status === "refunded") && !hasOpenDispute(tx, order.id)
    );
    if (done) {
      tx.update("deals", deal.id, { status: "completed" });
      notifyUser(tx, deal.sellerId, "deal_completed", { dealId: deal.id }, at);
      ran++;
    }
  }
  return ran;
}

/**
 * Seeded demo deals roll over to a new voting period instead of closing when
 * their deadline passes in real time, so the marketplace always has live
 * deals. It uses the real clock, not now(): moving the dev clock forward
 * still closes them, so deadline testing works as before.
 */
function keepDemoDealsLive(tx: Tx) {
  const realNow = Date.now();
  for (const deal of tx.all("deals")) {
    if (deal.status !== "live" || !DEMO_LIVE_DEAL_IDS.has(deal.id) || !deal.votingEndsAt || !deal.votingStartsAt) {
      continue;
    }
    const endsAt = Date.parse(deal.votingEndsAt);
    if (endsAt > realNow) {
      continue;
    }
    const period = Math.max(deal.votingDays, 1) * DAY;
    const shift = Math.ceil((realNow - endsAt + 1) / period) * period;
    tx.update("deals", deal.id, {
      votingStartsAt: iso(Date.parse(deal.votingStartsAt) + shift),
      votingEndsAt: iso(endsAt + shift),
    });
  }
}

/** Hours before the payment deadline when unanswered voters are reminded. */
export const REMINDER_HOURS = [12, 2];

/**
 * Payment reminders "by LINE and email" (simulated: they arrive as
 * notifications marked with those channels). Each vote gets each reminder once.
 */
function sendPaymentReminders(tx: Tx, at: number): number {
  let ran = 0;
  for (const deal of tx.all("deals")) {
    if (deal.status !== "payment_window" || !deal.paymentDeadline) {
      continue;
    }
    const deadline = Date.parse(deal.paymentDeadline);
    if (at >= deadline) {
      continue;
    }
    for (const vote of tx.all("votes").filter((row) => row.dealId === deal.id && row.status === "active")) {
      const due = REMINDER_HOURS.filter((hours) => at >= deadline - hours * HOUR).length;
      if (due > (vote.reminders ?? 0)) {
        const hoursLeft = REMINDER_HOURS[due - 1];
        tx.update("votes", vote.id, { reminders: due });
        notifyUser(tx, vote.buyerId, "payment_reminder", {
          dealId: deal.id,
          hoursLeft,
          paymentDeadline: deal.paymentDeadline,
          channels: ["LINE", "email"],
        }, at);
        ran++;
      }
    }
  }
  return ran;
}

/**
 * Automatic payouts (2C2P split payment, simulated): every payable order is
 * released to its seller, minus commission and the payment fee. Sellers on an
 * admin hold are skipped; sellers without a bank account get one "failed"
 * record per order, retried automatically once they add an account.
 */
function releasePayouts(tx: Tx, at: number): number {
  let ran = 0;
  const paidBySeller = new Map<string, number>();
  for (const order of tx.all("orders")) {
    if (order.status !== "delivered" || !order.payableAt || order.payoutId || hasOpenDispute(tx, order.id)) {
      continue;
    }
    const seller = tx.find("sellerProfiles", order.sellerId);
    if (!seller || seller.payoutHoldAt) {
      continue;
    }
    const releasedAt = new Date(Math.max(Date.parse(order.payableAt), Date.parse(seller.createdAt))).toISOString();
    const amount = sellerNet(order);
    if (!seller.bankAccount) {
      const alreadyFailed = tx.all("payouts").some((row) => row.orderId === order.id && row.status === "failed");
      if (!alreadyFailed) {
        tx.insert("payouts", {
          id: newId("payout"),
          sellerId: order.sellerId,
          orderId: order.id,
          amount,
          status: "failed",
          failureReason: "No bank account on file",
          paidAt: null,
          createdAt: releasedAt,
        });
        notifyUser(tx, order.sellerId, "payout_failed", { amount }, at);
        ran++;
      }
      continue;
    }
    const id = newId("payout");
    tx.insert("payouts", {
      id,
      sellerId: order.sellerId,
      orderId: order.id,
      amount,
      status: "paid",
      failureReason: null,
      paidAt: releasedAt,
      createdAt: releasedAt,
    });
    tx.update("orders", order.id, { payoutId: id });
    paidBySeller.set(order.sellerId, (paidBySeller.get(order.sellerId) ?? 0) + amount);
    ran++;
  }
  for (const [sellerId, amount] of paidBySeller) {
    notifyUser(tx, sellerId, "payout_sent", { amount }, at);
  }
  return ran;
}

/** Runs every due job inside an existing mutate(). Returns how many ran. */
export function runDueJobs(tx: Tx, at: number): number {
  keepDemoDealsLive(tx);
  let ran = 0;
  // Each pass can make the next deadline due (e.g. voting closes, then the
  // decision window also ends), so repeat until nothing changes.
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (const deal of tx.all("deals")) {
      const due = (value: string | null) => value !== null && Date.parse(value) <= at;
      if (deal.status === "live" && due(deal.votingEndsAt)) {
        closeVoting(tx, deal, Date.parse(deal.votingEndsAt!));
      } else if (deal.status === "seller_decision" && due(deal.decisionDeadline)) {
        cancelAtDecision(tx, deal, "decision_timeout", Date.parse(deal.decisionDeadline!));
      } else if (deal.status === "payment_window" && due(deal.paymentDeadline)) {
        closePaymentWindow(tx, deal, Date.parse(deal.paymentDeadline!));
      } else {
        continue;
      }
      changed = true;
      ran++;
    }
    if (!changed) {
      break;
    }
  }
  ran += runDisputeDeadlines(tx, at);
  ran += sendPaymentReminders(tx, at);
  ran += autoConfirmDeliveries(tx, at);
  ran += releasePayouts(tx, at);
  ran += completeFulfilledDeals(tx, at);
  return ran;
}

/** Applies every due deadline. Writes (and notifies) only when something was due. */
export function syncDeadlines(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  return mutate((tx) => runDueJobs(tx, now()));
}

/** Keeps deadlines applied while a page is open. Returns a cleanup function. */
export function startDeadlineRunner(intervalMs = 5000) {
  let queued = false;
  const runSoon = () => {
    if (!queued) {
      queued = true;
      queueMicrotask(() => {
        queued = false;
        syncDeadlines();
      });
    }
  };
  runSoon();
  const timer = window.setInterval(runSoon, intervalMs);
  const unsubscribe = subscribe(runSoon);
  return () => {
    window.clearInterval(timer);
    unsubscribe();
  };
}

/** The next deadline across all deals, for the dev panel's "skip ahead" button. */
export function nextDeadline(deals: readonly Deal[], at: number): { at: number; deal: Deal; label: string } | null {
  let best: { at: number; deal: Deal; label: string } | null = null;
  for (const deal of deals) {
    const candidate =
      deal.status === "live" && deal.votingEndsAt
        ? { value: deal.votingEndsAt, label: "voting closes" }
        : deal.status === "seller_decision" && deal.decisionDeadline
          ? { value: deal.decisionDeadline, label: "seller decision due" }
          : deal.status === "payment_window" && deal.paymentDeadline
            ? { value: deal.paymentDeadline, label: "payment window closes" }
            : null;
    if (!candidate) {
      continue;
    }
    const time = Date.parse(candidate.value);
    if (time > at && (!best || time < best.at)) {
      best = { at: time, deal, label: candidate.label };
    }
  }
  return best;
}
