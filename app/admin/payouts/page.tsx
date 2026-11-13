"use client";

import { useMemo, useState } from "react";
import Icon from "../../components/shell/Icon";
import { EmptyState, PageHeader, Skeleton, StatCard, StatusPill } from "../../components/ui";
import {
  bangkokMonth,
  formatDate,
  formatDateTime,
  formatTHB,
  holdPayouts,
  now,
  payableOrders,
  releasePayouts,
  sellerNet,
  useDb,
} from "../../lib/store";

type Filter = "all" | "paid" | "failed";

/** Hold form for one seller: asks for a reason first. */
function HoldButton({ sellerId, onResult }: { sellerId: string; onResult: (error: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-line px-4 py-2 text-sm font-bold hover:border-danger hover:text-danger"
      >
        Hold payouts
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 sm:w-80">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        autoFocus
        placeholder="Reason, shown to the seller"
        className="rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const result = holdPayouts(sellerId, reason);
            onResult(result.ok ? "" : result.error);
            if (result.ok) {
              setOpen(false);
            }
          }}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-danger"
        >
          Hold
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-bold text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Hold a seller who isn't in the attention list (their payouts are flowing normally). */
function HoldAnySeller({ sellers, onResult }: { sellers: { id: string; shopName: string }[]; onResult: (error: string) => void }) {
  const [sellerId, setSellerId] = useState("");
  if (sellers.length === 0) {
    return null;
  }
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-sheet bg-surface p-5 shadow-sm sm:flex-row sm:items-start">
      <label className="text-sm font-bold sm:w-72">
        Hold another seller
        <select
          value={sellerId}
          onChange={(event) => setSellerId(event.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-normal"
        >
          <option value="">Choose a seller</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>
              {seller.shopName}
            </option>
          ))}
        </select>
      </label>
      {sellerId && (
        <div className="sm:pt-7">
          <HoldButton key={sellerId} sellerId={sellerId} onResult={onResult} />
        </div>
      )}
    </div>
  );
}

export default function AdminPayoutsPage() {
  const db = useDb();
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const data = useMemo(() => {
    if (!db) {
      return null;
    }
    const month = bangkokMonth(now());
    const shopName = (id: string) => db.sellerProfiles.find((seller) => seller.id === id)?.shopName ?? "Seller";
    const sellers = db.sellerProfiles
      .filter((seller) => seller.applicationStatus === "approved" || seller.payoutHoldAt)
      .map((seller) => {
        const waiting = payableOrders(db, seller.id);
        return {
          seller,
          waitingAmount: waiting.reduce((sum, order) => sum + sellerNet(order), 0),
          waitingCount: waiting.length,
          paidTotal: db.payouts
            .filter((row) => row.sellerId === seller.id && row.status === "paid")
            .reduce((sum, row) => sum + row.amount, 0),
        };
      });
    const attention = sellers
      .filter((row) => row.seller.payoutHoldAt || !row.seller.bankAccount || row.waitingCount > 0)
      .sort((a, b) => b.waitingAmount - a.waitingAmount);
    const log = [...db.payouts]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((payout) => {
        const order = db.orders.find((row) => row.id === payout.orderId);
        return {
          payout,
          shop: shopName(payout.sellerId),
          deal: db.deals.find((deal) => deal.id === order?.dealId)?.title,
          // A failed release counts as fixed once the order has been paid out.
          resolved: payout.status === "failed" && Boolean(order?.payoutId),
        };
      });
    const listed = new Set(attention.map((row) => row.seller.id));
    return {
      attention,
      holdable: sellers
        .filter((row) => !listed.has(row.seller.id) && !row.seller.payoutHoldAt)
        .map((row) => ({ id: row.seller.id, shopName: row.seller.shopName }))
        .sort((a, b) => a.shopName.localeCompare(b.shopName)),
      log,
      paidThisMonth: db.payouts
        .filter((row) => row.status === "paid" && row.paidAt && bangkokMonth(row.paidAt) === month)
        .reduce((sum, row) => sum + row.amount, 0),
      onHold: sellers.filter((row) => row.seller.payoutHoldAt).reduce((sum, row) => sum + row.waitingAmount, 0),
      heldSellers: sellers.filter((row) => row.seller.payoutHoldAt).length,
      failedOpen: log.filter((row) => row.payout.status === "failed" && !row.resolved).length,
    };
  }, [db]);

  const visibleLog = (data?.log ?? []).filter((row) => filter === "all" || row.payout.status === filter);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader
        eyebrow="ADMIN"
        title="Payouts"
        text="Payouts are automatic: when an order is delivered and has no open problem report, 2C2P's split payment releases the seller's share (product total minus commission and the payment fee) to their bank account. You only step in to hold a seller or check a failed payout. Payments are simulated."
      />
      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {data ? (
          <>
            <StatCard label="Released this month" value={formatTHB(data.paidThisMonth)} tone="success" />
            <StatCard label="Waiting on holds" value={formatTHB(data.onHold)} />
            <StatCard label="Sellers on hold" value={data.heldSellers} />
            <StatCard label="Failed, not yet fixed" value={data.failedOpen} />
          </>
        ) : (
          [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24" />)
        )}
      </div>

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-subtle">Needs attention</h2>
      <div className="mt-3 space-y-3">
        {!data ? (
          <Skeleton className="h-32" />
        ) : data.attention.length === 0 ? (
          <EmptyState icon="done" title="Nothing needs you" text="Every payable order has been released automatically." />
        ) : (
          data.attention.map(({ seller, waitingAmount, waitingCount, paidTotal }) => (
            <div key={seller.id} className="flex flex-col gap-4 rounded-sheet bg-surface p-5 shadow-sm lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-extrabold">{seller.shopName}</p>
                  {seller.payoutHoldAt ? (
                    <StatusPill tone="danger">On hold</StatusPill>
                  ) : !seller.bankAccount ? (
                    <StatusPill tone="brand">No bank account</StatusPill>
                  ) : (
                    <StatusPill tone="muted">Releasing</StatusPill>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {waitingCount} {waitingCount === 1 ? "order" : "orders"} waiting ({formatTHB(waitingAmount)}) ·{" "}
                  {formatTHB(paidTotal)} paid so far · {seller.bankAccount ?? "no bank account"}
                </p>
                {seller.payoutHoldAt && (
                  <p className="mt-1 text-sm text-muted-strong">
                    Held {formatDate(seller.payoutHoldAt)}: {seller.payoutHoldReason}
                  </p>
                )}
              </div>
              {seller.payoutHoldAt ? (
                <button
                  type="button"
                  onClick={() => {
                    const result = releasePayouts(seller.id);
                    setError(result.ok ? "" : result.error);
                  }}
                  className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600"
                >
                  Release hold
                </button>
              ) : (
                <HoldButton sellerId={seller.id} onResult={setError} />
              )}
            </div>
          ))
        )}
      </div>
      {data && <HoldAnySeller sellers={data.holdable} onResult={setError} />}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-subtle">Payout log</h2>
        <div role="tablist" aria-label="Payout status" className="flex gap-2">
          {(["all", "paid", "failed"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                filter === key ? "bg-ink text-white" : "bg-surface text-muted-strong hover:text-ink"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-sheet bg-surface shadow-sm">
        {!data ? (
          <Skeleton className="h-24" />
        ) : visibleLog.length === 0 ? (
          <p className="p-6 text-sm text-muted">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visibleLog.map(({ payout, shop, deal, resolved }) => (
              <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                <span className="min-w-0">
                  <span className="font-bold">{shop}</span>
                  {deal && <span className="text-muted"> · {deal}</span>}
                  <span className="block text-xs text-subtle">
                    {payout.status === "paid"
                      ? `Released ${payout.paidAt ? formatDateTime(payout.paidAt) : ""} via 2C2P split (simulated)`
                      : `${payout.failureReason}${resolved ? " · fixed and paid later" : " · retries automatically"}`}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {payout.status === "failed" && (
                    <StatusPill tone={resolved ? "muted" : "danger"}>
                      <Icon name={resolved ? "tick" : "alert"} className="h-3 w-3" />
                      {resolved ? "Fixed" : "Failed"}
                    </StatusPill>
                  )}
                  <span className="font-extrabold tabular-nums">{formatTHB(payout.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
