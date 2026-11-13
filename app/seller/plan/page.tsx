"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "../../components/shell/Icon";
import { EmptyState, PageHeader, Skeleton, StatusPill } from "../../components/ui";
import {
  ActionResult,
  activeBanner,
  activeBoost,
  activeDealCount,
  activeDealLimit,
  bookBanner,
  buyBoost,
  formatDate,
  formatTHB,
  getSetting,
  isPro,
  marketplaceDeals,
  purchaseLabel,
  subscribePro,
  useDb,
  useSessionUser,
} from "../../lib/store";

/**
 * Seller services from the report (Section 5.3): the Pro plan, Product Boost
 * and sponsored banners. Payments are simulated: nothing is charged.
 */
export default function SellerPlanPage() {
  const db = useDb();
  const user = useSessionUser();
  const [weeks, setWeeks] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const data = useMemo(() => {
    if (!db || !user) {
      return null;
    }
    const pro = isPro(db, user.id);
    return {
      pro,
      proUntil: db.sellerProfiles.find((row) => row.id === user.id)?.proUntil ?? null,
      active: activeDealCount(db, user.id),
      limit: activeDealLimit(db, user.id),
      live: marketplaceDeals(db).filter((summary) => summary.deal.sellerId === user.id && !summary.closedReason),
      history: db.sellerPurchases
        .filter((row) => row.sellerId === user.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((row) => ({ row, title: db.deals.find((deal) => deal.id === row.dealId)?.title })),
    };
  }, [db, user]);

  function run(result: ActionResult, success: string) {
    setMessage(result.ok ? { ok: true, text: success } : { ok: false, text: result.error });
  }

  if (!db || !data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Skeleton className="h-96" />
      </div>
    );
  }

  const proPrice = getSetting(db, "proMonthlyPrice");
  const boostPrice = getSetting(db, "boostPrice");
  const boostDays = getSetting(db, "boostDays");
  const bannerPrice = getSetting(db, "bannerWeeklyPrice");

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader
        eyebrow="GROW"
        title="Plan & promote"
        text="Upgrade your plan and promote live deals. Payments on this page are simulated for the prototype: nothing is charged."
      />

      {message && (
        <p role="status" className={`mt-6 text-sm font-semibold ${message.ok ? "text-success-600" : "text-danger"}`}>
          {message.text}
        </p>
      )}

      {/* PLAN */}
      <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-subtle">Your plan</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className={`rounded-sheet p-6 shadow-sm ${data.pro ? "bg-surface" : "bg-surface ring-2 ring-brand-300"}`}>
          <div className="flex items-center justify-between">
            <p className="text-lg font-extrabold">Basic</p>
            {!data.pro && <StatusPill tone="brand">Current</StatusPill>}
          </div>
          <p className="mt-1 text-2xl font-extrabold">Free</p>
          <ul className="mt-4 space-y-2 text-sm text-muted-strong">
            <li>Everything needed to run group deals</li>
            <li>Up to {getSetting(db, "basicActiveDeals")} deals in review or live at once</li>
            <li>Orders, payouts and earnings</li>
          </ul>
        </div>
        <div className={`rounded-sheet p-6 shadow-sm ${data.pro ? "bg-surface ring-2 ring-brand-300" : "bg-surface"}`}>
          <div className="flex items-center justify-between">
            <p className="text-lg font-extrabold">Pro</p>
            {data.pro && <StatusPill tone="success">Active</StatusPill>}
          </div>
          <p className="mt-1 text-2xl font-extrabold">
            {formatTHB(proPrice)} <span className="text-sm font-semibold text-muted">/ month</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-strong">
            <li>Up to {getSetting(db, "proActiveDeals")} deals in review or live at once</li>
            <li>
              <Link href="/seller/analytics" className="font-bold text-brand-600">
                Advanced analytics
              </Link>
              : conversion, no-shows and earnings per deal
            </li>
            <li>Priority support</li>
          </ul>
          <button
            type="button"
            onClick={() => run(subscribePro(), data.pro ? "Pro extended by 30 days." : "Welcome to Pro! It's active for 30 days.")}
            className="mt-5 w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white hover:bg-brand-600"
          >
            {data.pro ? `Extend 30 days (${formatTHB(proPrice)})` : `Upgrade to Pro (${formatTHB(proPrice)})`}
          </button>
          {data.pro && data.proUntil && (
            <p className="mt-2 text-center text-xs text-subtle">Active until {formatDate(data.proUntil)}</p>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        You have <b className="text-ink">{data.active}</b> of {data.limit} deals in review or live.
      </p>

      {/* PROMOTE */}
      <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-subtle">Promote a live deal</h2>
      <div className="mt-3 space-y-3">
        {data.live.length === 0 ? (
          <EmptyState icon="rocket" title="No live deals to promote" text="Once an admin approves a deal, you can boost it here." />
        ) : (
          data.live.map((summary) => {
            const boost = activeBoost(db, summary.deal.id);
            const banner = activeBanner(db, summary.deal.id);
            const bannerWeeks = weeks[summary.deal.id] ?? 1;
            return (
              <div key={summary.deal.id} className="flex flex-col gap-4 rounded-sheet bg-surface p-5 shadow-sm lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/seller/deals/${summary.deal.id}`} className="font-extrabold hover:text-brand-500">
                    {summary.deal.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {summary.units} units voted · {summary.voters} buyers
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {boost ? (
                    <span className="rounded-xl bg-success-50 px-4 py-2.5 text-sm font-bold text-success-600">
                      Boosted until {formatDate(boost.endsAt)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => run(buyBoost(summary.deal.id), `${summary.deal.title} is boosted for ${boostDays} days.`)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-bold hover:border-brand-400"
                    >
                      <Icon name="rocket" className="h-4 w-4" />
                      Boost {boostDays} days · {formatTHB(boostPrice)}
                    </button>
                  )}
                  {banner ? (
                    <span className="rounded-xl bg-success-50 px-4 py-2.5 text-sm font-bold text-success-600">
                      Banner until {formatDate(banner.endsAt)}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Banner weeks"
                        value={bannerWeeks}
                        onChange={(event) => setWeeks((current) => ({ ...current, [summary.deal.id]: Number(event.target.value) }))}
                        className="rounded-xl border border-line bg-surface px-2 py-2.5 text-sm"
                      >
                        {[1, 2, 3, 4].map((count) => (
                          <option key={count} value={count}>
                            {count} {count === 1 ? "week" : "weeks"}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          run(bookBanner(summary.deal.id, bannerWeeks), `Home-page banner booked for ${bannerWeeks} ${bannerWeeks === 1 ? "week" : "weeks"}.`)
                        }
                        className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold hover:border-brand-400"
                      >
                        Banner · {formatTHB(bannerPrice * bannerWeeks)}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className="mt-3 text-xs text-subtle">
        Boosted deals show first in the marketplace with a &ldquo;Boosted&rdquo; tag. Banners appear at the top of the home page.
      </p>

      {/* HISTORY */}
      <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-subtle">Purchases</h2>
      <div className="mt-3 overflow-hidden rounded-sheet bg-surface shadow-sm">
        {data.history.length === 0 ? (
          <p className="p-6 text-sm text-muted">Nothing bought yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.history.map(({ row, title }) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                <span className="min-w-0">
                  <span className="font-bold">{purchaseLabel(row)}</span>
                  {title && <span className="text-muted"> · {title}</span>}
                  <span className="block text-xs text-subtle">
                    {formatDate(row.startsAt)} – {formatDate(row.endsAt)}
                  </span>
                </span>
                <span className="font-extrabold">{formatTHB(row.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
