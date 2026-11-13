"use client";

import { useMemo, useState } from "react";
import Icon from "../../components/shell/Icon";
import { EmptyState, PageHeader, Skeleton, StatCard } from "../../components/ui";
import { formatTHB, now, percent, RevenuePeriod, revenueBySeller, RevenueTotals, useDb } from "../../lib/store";

const PERIODS: [RevenuePeriod, string][] = [
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["all", "All time"],
];

/** The money columns shown for a seller and for each of their deals. */
function Figures({ totals, compact = false }: { totals: RevenueTotals; compact?: boolean }) {
  const items: [string, number, string?][] = compact
    ? [
        ["Sales", totals.sales],
        ["Refunded", totals.refunded],
        ["Commission", totals.commission, "text-success-600"],
        ["2C2P fees (seller)", totals.paymentFees],
        ["Owed to seller", totals.sellerPending],
        ["Paid to seller", totals.sellerPaidOut],
      ]
    : [
        ["Commission", totals.commission, "text-success-600"],
        ["Product Boost", totals.boosts, "text-success-600"],
        ["Sponsored banners", totals.banners, "text-success-600"],
        ["Pro plan", totals.subscriptions, "text-success-600"],
        ["Sales", totals.sales],
        ["Refunded", totals.refunded],
        ["Owed to seller", totals.sellerPending],
        ["Paid to seller", totals.sellerPaidOut],
        ["2C2P fees (seller pays)", totals.paymentFees],
        ["Shipping (to courier)", totals.shipping],
        ["Referral credit used", totals.credits],
      ];
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 ${compact ? "text-xs lg:grid-cols-6" : "text-sm lg:grid-cols-4"}`}>
      {items.map(([label, value, color]) => (
        <div key={label}>
          <dt className="text-subtle">{label}</dt>
          <dd className={`font-extrabold tabular-nums ${color ?? ""}`}>{formatTHB(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminRevenuePage() {
  const db = useDb();
  const [period, setPeriod] = useState<RevenuePeriod>("all");
  const [open, setOpen] = useState<string | null>(null);

  const data = useMemo(() => (db ? revenueBySeller(db, period, now()) : null), [db, period]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader
        eyebrow="ADMIN"
        title="Revenue"
        text="What GroupBuy earns from each seller across the four revenue streams: commission, Product Boost, sponsored banners and Pro subscriptions. Commission is charged on product sales after refunds, never on shipping. Seller services are simulated payments."
      />

      <div role="tablist" aria-label="Period" className="mt-8 flex flex-wrap gap-2">
        {PERIODS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={period === key}
            onClick={() => setPeriod(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              period === key ? "bg-ink text-white" : "bg-surface text-muted-strong hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {data ? (
          <>
            <StatCard label="Platform revenue" value={formatTHB(data.totals.revenue)} tone="success" />
            <StatCard label="Commission" value={formatTHB(data.totals.commission)} />
            <StatCard label="Seller services" value={formatTHB(data.totals.boosts + data.totals.banners + data.totals.subscriptions)} />
            <StatCard label="Product sales (GMV)" value={formatTHB(data.totals.sales)} />
          </>
        ) : (
          [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24" />)
        )}
      </div>

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-subtle">By seller</h2>
      <div className="mt-3 space-y-3">
        {!data ? (
          <Skeleton className="h-40" />
        ) : data.sellers.length === 0 ? (
          <EmptyState icon="chart" title="No revenue in this period" text="Revenue appears once buyers pay for a deal or sellers buy a service." />
        ) : (
          data.sellers.map((seller) => {
            const expanded = open === seller.sellerId;
            return (
              <div key={seller.sellerId} className="rounded-sheet bg-surface p-5 shadow-sm sm:p-6">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : seller.sellerId)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block font-extrabold">{seller.shopName}</span>
                    <span className="block text-sm text-muted">
                      {seller.orders} {seller.orders === 1 ? "order" : "orders"} · {seller.deals.length}{" "}
                      {seller.deals.length === 1 ? "deal" : "deals"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-right">
                      <span className="block text-xl font-extrabold text-success-600 tabular-nums">
                        {formatTHB(seller.revenue)}
                      </span>
                      <span className="block text-xs text-subtle">platform revenue</span>
                    </span>
                    <Icon
                      name="chevron-right"
                      className={`h-5 w-5 text-subtle transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                  </span>
                </button>
                <div className="mt-4">
                  <Figures totals={seller} />
                </div>
                {expanded && (
                  <ul className="mt-5 space-y-3 border-t border-line pt-4">
                    {seller.deals.map((deal) => (
                      <li key={deal.dealId} className="rounded-2xl bg-surface-subtle p-4">
                        <p className="text-sm font-bold">
                          {deal.title}{" "}
                          <span className="font-normal text-muted">
                            · {deal.orders} {deal.orders === 1 ? "order" : "orders"} · {percent(deal.commissionRate)} commission
                          </span>
                        </p>
                        <div className="mt-2">
                          <Figures totals={deal} compact />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
