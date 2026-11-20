"use client";

import { Deal, Db, formatDateTime, VoteStatus } from "../../../lib/store";

type Tone = "brand" | "success" | "muted";

const TONES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-50 text-success-700",
  muted: "bg-surface-subtle text-muted",
};

/**
 * What the seller sees for each vote. "Declined" and "didn't respond" are
 * shown the same way on purpose: sellers never learn who no-showed.
 */
function statusFor(status: VoteStatus, deal: Deal): { label: string; tone: Tone } {
  switch (status) {
    case "active":
      if (deal.status === "payment_window") return { label: "Waiting to pay", tone: "brand" };
      return { label: "Joined", tone: "brand" };
    case "paid":
      return { label: "Paid", tone: "success" };
    case "declined":
    case "expired":
      return { label: "Didn't pay", tone: "muted" };
    case "withdrawn":
      return { label: "Left the deal", tone: "muted" };
    case "cancelled":
      return { label: "Deal cancelled", tone: "muted" };
  }
}

const ORDER: Record<VoteStatus, number> = { paid: 0, active: 1, declined: 2, expired: 2, cancelled: 3, withdrawn: 4 };

/** The buyers who joined (voted for) one of the seller's deals. */
export default function DealBuyers({ db, deal }: { db: Db; deal: Deal }) {
  const votes = db.votes
    .filter((vote) => vote.dealId === deal.id)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.createdAt.localeCompare(b.createdAt));
  const joined = votes.filter((vote) => vote.status !== "withdrawn");
  const units = joined.reduce((sum, vote) => sum + vote.quantity, 0);
  const nameOf = (buyerId: string) => db.profiles.find((row) => row.id === buyerId)?.fullName || "Buyer";

  return (
    <section className="mt-6 rounded-sheet bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold">Buyers who joined</h2>
        <p className="text-sm text-muted">
          {joined.length} {joined.length === 1 ? "buyer" : "buyers"} · {units} {units === 1 ? "unit" : "units"}
        </p>
      </div>

      {votes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nobody has joined yet. Share the deal to get your first buyers.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {votes.map((vote, index) => {
            const status = statusFor(vote.status, deal);
            return (
              <li key={vote.id} className="flex items-center gap-3 py-3">
                <span className="w-6 shrink-0 text-right text-xs font-bold text-subtle">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{nameOf(vote.buyerId)}</p>
                  <p className="text-xs text-muted">Joined {formatDateTime(vote.createdAt)}</p>
                </div>
                <span className="shrink-0 text-sm font-extrabold">× {vote.quantity}</span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${TONES[status.tone]}`}>{status.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
