"use client";

import { useMemo } from "react";
import DealStatusPill from "../../components/deals/DealStatusPill";
import { EmptyState, PageHeader, Skeleton, StatCard } from "../../components/ui";
import {
  dealSummary,
  formatTHB,
  isPro,
  paymentStatus,
  sellerDecisionStats,
  sellerNet,
  sellerRating,
  useDb,
  useSessionUser,
} from "../../lib/store";

/** Pro plan analytics: how each deal converted from votes to paid orders, and what it earned. */
export default function SellerAnalyticsPage() {
  const db = useDb();
  const user = useSessionUser();

  const data = useMemo(() => {
    if (!db || !user) {
      return null;
    }
    const deals = db.deals
      .filter((deal) => deal.sellerId === user.id && deal.unitsVotedAtClose !== null)
      .map((deal) => {
        const status = paymentStatus(db, deal.id);
        const orders = db.orders.filter((order) => order.dealId === deal.id);
        return {
          deal,
          summary: dealSummary(db, deal),
          status,
          earned: orders.reduce((sum, order) => sum + sellerNet(order), 0),
          conversion: status.voted.units ? Math.round((status.paid.units / status.voted.units) * 100) : 0,
        };
      })
      .sort((a, b) => Date.parse(b.deal.votingEndsAt ?? "") - Date.parse(a.deal.votingEndsAt ?? ""));
    const voted = deals.reduce((sum, row) => sum + row.status.voted.units, 0);
    const paid = deals.reduce((sum, row) => sum + row.status.paid.units, 0);
    const missed = deals.reduce((sum, row) => sum + row.status.missed.units, 0);
    return {
      pro: isPro(db, user.id),
      deals,
      voted,
      paid,
      missed,
      earned: deals.reduce((sum, row) => sum + row.earned, 0),
      rating: sellerRating(db, user.id),
      decisions: sellerDecisionStats(db, user.id),
    };
  }, [db, user]);

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data.pro) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
        <PageHeader eyebrow="PRO" title="Analytics" />
        <div className="mt-8">
          <EmptyState
            icon="chart"
            title="Analytics is part of the Pro plan"
            text="See how many voters actually pay, your no-show rate and earnings per deal."
            action={{ href: "/seller/plan", label: "See the Pro plan" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader
        eyebrow="PRO"
        title="Analytics"
        text="How your closed deals converted from votes to paid orders. Use it to set realistic tiers and stock caps."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Votes → paid" value={`${data.voted ? Math.round((data.paid / data.voted) * 100) : 0}%`} tone="brand" />
        <StatCard label="No-show units" value={`${data.voted ? Math.round((data.missed / data.voted) * 100) : 0}%`} />
        <StatCard label="Earned (after fees)" value={formatTHB(data.earned)} tone="success" />
        <StatCard
          label="Shop rating"
          value={data.rating.count ? `★ ${data.rating.average.toFixed(1)} (${data.rating.count})` : "No reviews"}
        />
      </div>
      <p className="mt-3 text-sm text-muted">
        Cancellation rate {data.decisions.cancelRate}% across {data.decisions.decided} decided{" "}
        {data.decisions.decided === 1 ? "deal" : "deals"}.
      </p>

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-subtle">By deal</h2>
      <div className="mt-3 space-y-3">
        {data.deals.length === 0 ? (
          <EmptyState icon="chart" title="No closed deals yet" text="Numbers appear once a deal's voting closes." />
        ) : (
          data.deals.map(({ deal, summary, status, earned, conversion }) => (
            <div key={deal.id} className="rounded-sheet bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold">{deal.title}</p>
                <DealStatusPill status={deal.status} votingClosed={Boolean(summary.closedReason)} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                {(
                  [
                    ["Voted", `${status.voted.units} units`],
                    ["Paid", `${status.paid.units} units (${conversion}%)`],
                    ["Declined", `${status.declined.units} units`],
                    ["No-shows", `${status.missed.units} units`],
                    ["Earned", formatTHB(earned)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-subtle">{label}</dt>
                    <dd className="font-bold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
