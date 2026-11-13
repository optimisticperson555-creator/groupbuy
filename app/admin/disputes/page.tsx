"use client";

import { useMemo, useState } from "react";
import { DisputeStatusPill, DisputeTimeline, RefundForm } from "../../components/deals/DisputeParts";
import OrderStatusPill from "../../components/deals/OrderStatusPill";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { Dispute, formatDateTime, formatTHB, resolveDispute, useDb } from "../../lib/store";

type Tab = "escalated" | "in_progress" | "resolved";

const TABS: [Tab, string][] = [
  ["escalated", "Needs your decision"],
  ["in_progress", "With seller or buyer"],
  ["resolved", "Resolved"],
];

function tabFor(dispute: Dispute): Tab {
  if (dispute.status === "escalated") {
    return "escalated";
  }
  return dispute.status === "resolved" ? "resolved" : "in_progress";
}

export default function AdminDisputesPage() {
  const db = useDb();
  const [tab, setTab] = useState<Tab>("escalated");

  const disputes = useMemo(() => {
    if (!db) {
      return null;
    }
    return db.disputes
      .map((dispute) => {
        const order = db.orders.find((row) => row.id === dispute.orderId);
        return {
          dispute,
          order,
          deal: db.deals.find((deal) => deal.id === order?.dealId),
          buyer: db.profiles.find((profile) => profile.id === order?.buyerId)?.fullName,
          shop: db.sellerProfiles.find((seller) => seller.id === order?.sellerId)?.shopName,
        };
      })
      .sort((a, b) => Date.parse(b.dispute.createdAt) - Date.parse(a.dispute.createdAt));
  }, [db]);

  const counts = Object.fromEntries(
    TABS.map(([key]) => [key, (disputes ?? []).filter((row) => tabFor(row.dispute) === key).length])
  ) as Record<Tab, number>;
  const visible = (disputes ?? []).filter((row) => tabFor(row.dispute) === tab);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader
        eyebrow="ADMIN"
        title="Problem reports"
        text="Sellers answer reports first. A report comes to you when the buyer turns down the seller's offer or the seller doesn't answer in time. Your decision is final."
      />

      <div role="tablist" className="mt-8 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              tab === key ? "bg-ink text-white" : "bg-surface text-muted-strong hover:text-ink"
            }`}
          >
            {label} {counts[key] > 0 && key !== "resolved" ? counts[key] : ""}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {!disputes ? (
          <Skeleton className="h-48" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="peace"
            title={tab === "escalated" ? "Nothing needs your decision" : tab === "in_progress" ? "No reports in progress" : "No resolved reports"}
            text="Problems buyers report on their orders appear here."
          />
        ) : (
          visible.map(({ dispute, order, deal, buyer, shop }) =>
            order ? (
              <div key={dispute.id} className="rounded-sheet bg-surface p-6 shadow-sm">
                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <DisputeStatusPill status={dispute.status} />
                      <OrderStatusPill status={order.status} />
                    </div>
                    <p className="mt-3 font-extrabold">
                      {order.quantity} × {deal?.title} · {formatTHB(order.total)}
                      {order.shippingFee > 0 && (
                        <span className="font-normal text-muted"> + {formatTHB(order.shippingFee)} shipping</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Buyer {buyer} · seller {shop}
                      {order.trackingNumber && ` · tracking ${order.trackingNumber}`}
                      {dispute.respondBy && ` · answer due ${formatDateTime(dispute.respondBy)}`}
                    </p>
                    <div className="mt-4">
                      <DisputeTimeline dispute={dispute} />
                    </div>
                  </div>
                  {dispute.status === "escalated" && (
                    <div className="lg:w-80">
                      <RefundForm
                        order={order}
                        messageLabel="Decision (shown to buyer and seller)"
                        submitLabel="Make final decision"
                        onSubmit={(refund, message) => {
                          const result = resolveDispute(dispute.id, refund, message);
                          return result.ok ? null : result.error;
                        }}
                      />
                      <p className="mt-3 text-xs text-subtle">
                        Commission is recalculated on what the seller keeps. With no or a partial refund, the order
                        returns to {dispute.orderStatusBefore}.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null
          )
        )}
      </div>
    </div>
  );
}
