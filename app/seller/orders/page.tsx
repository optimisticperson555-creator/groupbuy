"use client";

import { useMemo, useState } from "react";
import { DisputeStatusPill, DisputeTimeline, RefundForm } from "../../components/deals/DisputeParts";
import { COURIERS, CourierId } from "../../lib/shipping";
import OrderStatusPill from "../../components/deals/OrderStatusPill";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import {
  Dispute,
  disputeForOrder,
  formatDate,
  formatDateTime,
  formatTHB,
  Order,
  respondToDispute,
  sellerNet,
  shipOrder,
  useDb,
  useSessionUser,
} from "../../lib/store";

/** What we suggest the seller offers: items that didn't arrive, arrived broken or are wrong get a full refund. */
function recommendedRefund(reason: Dispute["reason"]) {
  return reason === "other" ? "partial" : "full";
}

const TABS = [
  { id: "to_ship", label: "To ship", statuses: ["paid"] },
  { id: "shipped", label: "Shipped", statuses: ["shipped"] },
  { id: "delivered", label: "Delivered", statuses: ["delivered"] },
  { id: "problems", label: "Problems", statuses: ["disputed", "refunded"] },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ShipForm({ order }: { order: Order }) {
  const [courier, setCourier] = useState<CourierId | "own">("flash");
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState("");

  function ship() {
    const result = courier === "own" ? shipOrder(order.id, tracking, null) : shipOrder(order.id, "", courier);
    setError(result.ok ? "" : result.error);
  }

  return (
    <div className="w-full sm:w-64">
      <label className="block text-xs font-bold text-muted-strong">
        Courier
        <select
          value={courier}
          onChange={(event) => setCourier(event.target.value as CourierId | "own")}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-500"
        >
          {(Object.keys(COURIERS) as CourierId[]).map((id) => (
            <option key={id} value={id}>
              {COURIERS[id].name}
            </option>
          ))}
          <option value="own">Other / my own tracking</option>
        </select>
      </label>
      {courier === "own" ? (
        <label className="mt-2 block text-xs font-bold text-muted-strong">
          Tracking number (optional)
          <input
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            placeholder="e.g. TH0123456789"
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-500"
          />
        </label>
      ) : (
        <p className="mt-2 text-xs text-subtle">Creates a shipping label and tracking number (simulated).</p>
      )}
      <button
        type="button"
        onClick={ship}
        className="mt-2 w-full rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
      >
        {courier === "own" ? "Mark as shipped" : "Create label & ship"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

export default function SellerOrdersPage() {
  const db = useDb();
  const user = useSessionUser();
  const [chosenTab, setTab] = useState<TabId | null>(null);

  const orders = useMemo(() => {
    if (!db || !user) {
      return null;
    }
    return db.orders
      .filter((order) => order.sellerId === user.id)
      .map((order) => ({
        order,
        deal: db.deals.find((deal) => deal.id === order.dealId),
        dispute: disputeForOrder(db, order.id),
      }))
      .sort((a, b) => Date.parse(a.order.createdAt) - Date.parse(b.order.createdAt));
  }, [db, user]);

  const inTab = (id: TabId) =>
    (orders ?? []).filter((row) =>
      (TABS.find((item) => item.id === id)!.statuses as readonly string[]).includes(row.order.status)
    );
  const needsAnswer = (orders ?? []).filter((row) => row.dispute?.status === "seller_review").length;
  const tab =
    chosenTab ?? (needsAnswer > 0 ? "problems" : inTab("to_ship").length > 0 || !orders?.length ? "to_ship" : "shipped");
  const visible = inTab(tab);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader eyebrow="FULFILMENT" title="Orders" text="Ship every paid order to the buyer's address. Add tracking if you have it." />

      {needsAnswer > 0 && (
        <p role="status" className="mt-6 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-600">
          {needsAnswer === 1 ? "A buyer reported a problem" : `${needsAnswer} buyers reported problems`}. Answer within the
          deadline, or the report goes to an admin.
        </p>
      )}

      <div role="tablist" aria-label="Order status" className="mt-8 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                selected ? "bg-ink text-white" : "bg-surface text-muted-strong hover:text-ink"
              }`}
            >
              {item.label} <span className={selected ? "text-brand-300" : "text-subtle"}>{inTab(item.id).length}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-4">
        {!orders ? (
          <Skeleton className="h-40" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={tab === "to_ship" ? "done" : "box"}
            title={tab === "to_ship" ? "Nothing to ship" : "No orders here"}
            text="Orders appear once buyers confirm and pay for a deal you proceeded with."
          />
        ) : (
          visible.map(({ order, deal, dispute }) => {
            const address = order.shippingAddress;
            return (
              <div key={order.id} className="rounded-sheet bg-surface p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <OrderStatusPill status={order.status} paidOut={Boolean(order.payoutId)} />
                    <p className="mt-2 font-extrabold">
                      {order.quantity} × {deal?.title ?? "Deal"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Order {order.id.slice(-6).toUpperCase()} · paid {formatDate(order.createdAt)} · {formatTHB(order.total)}
                      {order.refundedAmount > 0 && ` · ${formatTHB(order.refundedAmount)} refunded`} · you get{" "}
                      <b className="text-ink">{formatTHB(sellerNet(order))}</b>
                    </p>
                    <p className="mt-1 text-xs text-subtle">
                      Commission {formatTHB(order.commissionAmount)} · 2C2P fee {formatTHB(order.paymentFee)} · buyer paid{" "}
                      {formatTHB(order.shippingFee)} shipping
                    </p>
                    <p className="mt-3 rounded-2xl bg-surface-subtle p-3 text-sm leading-6 text-muted-strong">
                      <b className="text-ink">{address.recipient}</b> · {address.phone}
                      <br />
                      {[address.line1, address.line2, address.district, address.province, address.postalCode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {order.trackingNumber && (
                      <p className="mt-2 text-xs text-muted">
                        {order.courier ? `${COURIERS[order.courier].name} · ` : ""}Tracking: {order.trackingNumber}
                      </p>
                    )}
                    {dispute && (order.status === "disputed" || dispute.status === "resolved") && (
                      <div className="mt-4 rounded-2xl border border-line p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <DisputeStatusPill status={dispute.status} />
                          {dispute.respondBy && (
                            <span className="text-xs text-muted">
                              {dispute.status === "seller_review" ? "Answer by" : "Buyer answers by"}{" "}
                              {formatDateTime(dispute.respondBy)}
                            </span>
                          )}
                        </div>
                        <DisputeTimeline dispute={dispute} />
                        {order.status === "disputed" && (
                          <p className="mt-3 text-xs text-subtle">Payout for this order waits until the report is resolved.</p>
                        )}
                      </div>
                    )}
                  </div>
                  {order.status === "paid" && <ShipForm order={order} />}
                  {dispute?.status === "seller_review" && (
                    <div className="w-full sm:w-72">
                      <RefundForm
                        order={order}
                        recommended={recommendedRefund(dispute.reason)}
                        noneLabel="Reply without a refund"
                        messageLabel="Message to the buyer"
                        submitLabel="Send answer"
                        onSubmit={(refund, message) => {
                          const result = respondToDispute(dispute.id, refund, message);
                          return result.ok ? null : result.error;
                        }}
                      />
                      <p className="mt-2 text-xs text-subtle">
                        If the buyer doesn&apos;t accept a partial refund or reply, an admin decides.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
