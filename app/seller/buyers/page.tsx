"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DealStatusPill from "../../components/deals/DealStatusPill";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { useDb, useSessionUser } from "../../lib/store";
import { BuyerList, DEAL_STATUSES_WITH_BUYERS, dealVotes, joinedTotals, totalsLabel } from "../BuyerList";

/** Newest stage first: live deals at the top, finished ones at the bottom. */
const STAGE_ORDER = ["live", "seller_decision", "payment_window", "fulfilling", "completed", "cancelled"];

/** Every buyer who joined one of this seller's deals, grouped by deal. */
export default function SellerBuyersPage() {
  const db = useDb();
  const user = useSessionUser();
  const [dealFilter, setDealFilter] = useState("all");

  const groups = useMemo(() => {
    if (!db || !user) {
      return [];
    }
    return db.deals
      .filter((deal) => deal.sellerId === user.id && DEAL_STATUSES_WITH_BUYERS.has(deal.status))
      .sort(
        (a, b) => STAGE_ORDER.indexOf(a.status) - STAGE_ORDER.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt)
      )
      .map((deal) => ({ deal, votes: dealVotes(db, deal.id) }));
  }, [db, user]);

  if (!db || !user) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Skeleton className="h-96" />
      </div>
    );
  }

  const shown = dealFilter === "all" ? groups : groups.filter((group) => group.deal.id === dealFilter);
  const totals = joinedTotals(shown.flatMap((group) => group.votes));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader eyebrow="SELLER CENTER" title="Buyers" text="Everyone who joined your deals, with their units and status.">
        {groups.length > 0 && (
          <label className="block text-xs font-bold text-muted-strong sm:w-72">
            Deal
            <select
              value={dealFilter}
              onChange={(event) => setDealFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-500"
            >
              <option value="all">All deals</option>
              {groups.map(({ deal }) => (
                <option key={deal.id} value={deal.id}>
                  {deal.title || "Untitled deal"}
                </option>
              ))}
            </select>
          </label>
        )}
      </PageHeader>

      {groups.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="users"
            title="No buyers yet"
            text="Buyers appear here once one of your deals is live and people join it."
            action={{ href: "/seller", label: "Go to dashboard" }}
          />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm font-bold text-muted-strong">{totalsLabel(totals)}</p>
          <div className="mt-3 space-y-6">
            {shown.map(({ deal, votes }) => (
              <section key={deal.id} className="rounded-sheet bg-surface p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/seller/deals/${deal.id}`} className="text-lg font-extrabold hover:text-brand-600">
                      {deal.title || "Untitled deal"}
                    </Link>
                    <p className="mt-1 text-sm text-muted">{totalsLabel(joinedTotals(votes))}</p>
                  </div>
                  <DealStatusPill status={deal.status} />
                </div>
                <BuyerList db={db} deal={deal} votes={votes} />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
