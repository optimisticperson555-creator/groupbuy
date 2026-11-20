"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DealStatusPill from "../../components/deals/DealStatusPill";
import Icon from "../../components/shell/Icon";
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
  /** Deals whose buyer list is folded away (all open by default). */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

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
  const allCollapsed = shown.every((group) => collapsed.has(group.deal.id));

  function toggle(dealId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(dealId)) {
        next.delete(dealId);
      } else {
        next.add(dealId);
      }
      return next;
    });
  }

  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((group) => group.deal.id)));
  }

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
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-muted-strong">{totalsLabel(totals)}</p>
            <button type="button" onClick={toggleAll} className="text-sm font-bold text-brand-600 hover:text-brand-700">
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>
          <div className="mt-3 space-y-4">
            {shown.map(({ deal, votes }) => {
              const open = !collapsed.has(deal.id);
              const panelId = `buyers-${deal.id}`;
              return (
                <section key={deal.id} className="rounded-sheet bg-surface shadow-sm">
                  <div className="flex items-center gap-2 p-4 sm:p-5">
                    <button
                      type="button"
                      onClick={() => toggle(deal.id)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left"
                    >
                      <Icon
                        name="chevron-right"
                        className={`h-5 w-5 shrink-0 text-subtle motion-safe:transition-transform ${open ? "rotate-90" : ""}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-extrabold">{deal.title || "Untitled deal"}</span>
                        <span className="mt-0.5 block text-sm text-muted">{totalsLabel(joinedTotals(votes))}</span>
                      </span>
                      <DealStatusPill status={deal.status} />
                    </button>
                    <Link
                      href={`/seller/deals/${deal.id}`}
                      aria-label={`View deal: ${deal.title || "Untitled deal"}`}
                      className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-subtle hover:bg-surface-subtle hover:text-brand-600"
                    >
                      <span className="hidden sm:inline">View deal</span>
                      <Icon name="arrow-right" className="h-4 w-4" />
                    </Link>
                  </div>
                  {open && (
                    <div id={panelId} className="border-t border-line px-4 pb-2 sm:px-6">
                      <BuyerList db={db} deal={deal} votes={votes} />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
