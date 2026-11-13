"use client";

import { useMemo, useState } from "react";
import { EmptyState, PageHeader, Skeleton, StatCard } from "../../components/ui";
import {
  formatDateTime,
  formatTHB,
  setBankAccount,
  getSetting,
  percent,
  sellerEarnings,
  useDb,
  useSessionUser,
} from "../../lib/store";

const BANKS = ["Bangkok Bank", "KBank", "SCB", "Krungthai", "Krungsri", "ttb"];

/** Where 2C2P sends payouts. Failed payouts retry automatically once an account is saved. */
function BankAccountForm({ current }: { current: string | null }) {
  const [editing, setEditing] = useState(!current);
  const [bank, setBank] = useState(BANKS[0]);
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");

  if (!editing && current) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Payouts go to <b>{current}</b>
        </p>
        <button type="button" onClick={() => setEditing(true)} className="text-sm font-bold text-brand-600">
          Change
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Bank"
          value={bank}
          onChange={(event) => setBank(event.target.value)}
          className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
        >
          {BANKS.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <input
          aria-label="Account number"
          inputMode="numeric"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="Account number"
          className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={() => {
            const result = setBankAccount(bank, number);
            setError(result.ok ? "" : result.error);
            if (result.ok) {
              setEditing(false);
              setNumber("");
            }
          }}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-500"
        >
          Save
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <p className="mt-2 text-xs text-subtle">Demo: any 10–12 digit number. Only the last 4 digits are kept.</p>
    </div>
  );
}

export default function SellerEarningsPage() {
  const db = useDb();
  const user = useSessionUser();

  const data = useMemo(() => {
    if (!db || !user) {
      return null;
    }
    const profile = db.sellerProfiles.find((row) => row.id === user.id);
    return {
      earnings: sellerEarnings(db, user.id),
      rate: profile?.commissionRate ?? getSetting(db, "defaultCommissionRate"),
      custom: profile?.commissionRate !== null && profile?.commissionRate !== undefined,
      profile,
      payouts: db.payouts
        .filter((payout) => payout.sellerId === user.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((payout) => {
          const order = db.orders.find((row) => row.id === payout.orderId);
          return {
            payout,
            order,
            title: db.deals.find((deal) => deal.id === order?.dealId)?.title ?? "Order",
            resolved: payout.status === "failed" && Boolean(order?.payoutId),
          };
        }),
    };
  }, [db, user]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
      <PageHeader
        eyebrow="MONEY"
        title="Earnings"
        text="Each order is paid out automatically once delivery is confirmed: 2C2P releases the product total minus GroupBuy's commission and the payment fee straight to your bank account. Shipping goes to the courier."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {data ? (
          <>
            <StatCard label="Waiting for release" value={formatTHB(data.earnings.payable)} />
            <StatCard label="Awaiting delivery" value={formatTHB(data.earnings.inProgress)} />
            <StatCard label="Paid out" value={formatTHB(data.earnings.paidOut)} tone="success" />
            <StatCard label="Commission + payment fees" value={formatTHB(data.earnings.commission + data.earnings.paymentFees)} />
          </>
        ) : (
          [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24" />)
        )}
      </div>

      {data?.profile?.payoutHoldAt && (
        <p role="status" className="mt-6 rounded-2xl bg-surface-muted px-4 py-3 text-sm font-semibold text-danger">
          GroupBuy has paused your payouts: {data.profile.payoutHoldReason} Delivered orders stay safe and are released
          when the hold ends.
        </p>
      )}

      {data && (
        <section className="mt-6 rounded-sheet bg-surface p-5 shadow-sm">
          <h2 className="font-extrabold">Payout account</h2>
          {!data.profile?.bankAccount && (
            <p className="mt-1 text-sm font-semibold text-danger">
              Add a bank account to receive payouts. Any waiting payouts are sent automatically once it&apos;s saved.
            </p>
          )}
          <div className="mt-3">
            <BankAccountForm current={data.profile?.bankAccount ?? null} />
          </div>
        </section>
      )}

      {data && (
        <p className="mt-4 text-sm text-muted">
          Your commission rate is <b className="text-ink">{percent(data.rate)}</b>
          {data.custom ? " (set for your shop)" : " (platform default)"}, plus the 2C2P payment fee of{" "}
          <b className="text-ink">{percent(getSetting(db!, "paymentFeeRate"))}</b> ({formatTHB(data.earnings.paymentFees)} so far). Each
          deal locks its commission rate when approved.
          GroupBuy sends payouts for delivered orders.
        </p>
      )}

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-subtle">Payouts</h2>
      <div className="mt-3 space-y-3">
        {!data ? (
          <Skeleton className="h-32" />
        ) : data.payouts.length === 0 ? (
          <EmptyState icon="banknote" title="No payouts yet" text="Each order is paid out automatically once its delivery is confirmed." />
        ) : (
          <div className="overflow-hidden rounded-sheet bg-surface shadow-sm">
            <ul className="divide-y divide-line">
              {data.payouts.map(({ payout, order, title, resolved }) => (
                <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
                  <span className="min-w-0">
                    <span className="font-bold">
                      {order ? `${order.quantity} × ` : ""}
                      {title}
                    </span>
                    <span className="block text-xs text-subtle">
                      {payout.status === "paid"
                        ? `Released ${payout.paidAt ? formatDateTime(payout.paidAt) : ""} by 2C2P`
                        : resolved
                          ? `${payout.failureReason} · sent later`
                          : `${payout.failureReason} · sent automatically once fixed`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        payout.status === "paid"
                          ? "bg-success-50 text-success-600"
                          : resolved
                            ? "bg-surface-muted text-muted"
                            : "bg-surface-muted text-danger"
                      }`}
                    >
                      {payout.status === "paid" ? "Paid" : resolved ? "Fixed" : "Failed"}
                    </span>
                    <span className="font-extrabold tabular-nums">{formatTHB(payout.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
