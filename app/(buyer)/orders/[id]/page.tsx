"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import Countdown from "../../../components/deals/Countdown";
import { DisputeStatusPill, DisputeTimeline } from "../../../components/deals/DisputeParts";
import OrderStatusPill from "../../../components/deals/OrderStatusPill";
import Icon from "../../../components/shell/Icon";
import { BackLink, EmptyState, Skeleton } from "../../../components/ui";
import { COURIERS } from "../../../lib/shipping";
import {
  acceptDisputeOffer,
  canDispute,
  canReview,
  submitReview,
  confirmDelivery,
  DAY,
  dealCoverImage,
  Dispute,
  DISPUTE_REASONS,
  disputeForOrder,
  escalateDisputeToAdmin,
  formatDateTime,
  formatTHB,
  getSetting,
  openDispute,
  useDb,
  useSessionUser,
} from "../../../lib/store";

function Step({ done, label, time }: { done: boolean; label: string; time?: string | null }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
          done ? "bg-success-600 text-white" : "border-2 border-line bg-surface"
        }`}
      >
        {done && <Icon name="tick" className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span>
        <span className={`block font-bold ${done ? "" : "text-subtle"}`}>{label}</span>
        {time && <span className="block text-xs text-muted">{formatDateTime(time)}</span>}
      </span>
    </li>
  );
}

function DisputeForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [reason, setReason] = useState<Dispute["reason"]>("not_delivered");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const result = openDispute(orderId, reason, details);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-line p-4">
      <label className="block text-sm font-bold">
        What went wrong?
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as Dispute["reason"])}
          className="mt-2 w-full rounded-xl border border-line px-4 py-3 font-normal outline-none focus:border-brand-500"
        >
          {Object.entries(DISPUTE_REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-bold">
        Details
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={3}
          placeholder="Tell us what happened so we can help."
          className="mt-2 w-full rounded-xl border border-line px-4 py-3 font-normal outline-none focus:border-brand-500"
        />
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-500">
          Send to the seller
        </button>
        <button type="button" onClick={onDone} className="px-3 py-2.5 text-sm font-bold text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The buyer's answer to the seller's offer: accept it, or ask an admin to decide. */
function OfferAnswer({ dispute }: { dispute: Dispute }) {
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const offer = dispute.sellerOfferAmount ?? 0;

  function accept() {
    const result = acceptDisputeOffer(dispute.id);
    setError(result.ok ? "" : result.error);
  }

  function escalate() {
    const result = escalateDisputeToAdmin(dispute.id, note);
    setError(result.ok ? "" : result.error);
  }

  return (
    <div className="mt-4 rounded-2xl bg-surface-subtle p-4">
      <p className="font-bold">
        {offer ? `The seller offers a ${formatTHB(offer)} refund.` : "The seller replied without offering a refund."}
      </p>
      <p className="mt-1 text-sm text-muted">
        Accept it, or ask a GroupBuy admin to decide; the admin&apos;s decision is final.
        {dispute.respondBy && (
          <>
            {" "}If you don&apos;t answer in <Countdown until={dispute.respondBy} />, the seller&apos;s offer stands.
          </>
        )}
      </p>
      {escalating ? (
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-bold">
            Why isn&apos;t this enough?
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              autoFocus
              className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 font-normal outline-none focus:border-brand-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={escalate} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-500">
              Send to an admin
            </button>
            <button type="button" onClick={() => setEscalating(false)} className="px-3 py-2.5 text-sm font-bold text-muted">
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={accept} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
            {offer ? `Accept ${formatTHB(offer)}` : "Accept and close"}
          </button>
          <button
            type="button"
            onClick={() => setEscalating(true)}
            className="rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-bold hover:border-brand-400"
          >
            Ask an admin to decide
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

/** 1–5 stars and a comment, once the order is delivered. */
function ReviewForm({ orderId }: { orderId: string }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const result = submitReview(orderId, rating, comment);
    setError(result.ok ? "" : result.error);
  }

  return (
    <section className="mt-6 rounded-sheet bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-extrabold">Rate this order</h2>
      <p className="mt-1 text-sm text-muted">Your review helps other buyers choose trusted shops.</p>
      <div role="radiogroup" aria-label="Rating" className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            onClick={() => setRating(star)}
            className={`text-3xl leading-none ${star <= rating ? "text-brand-500" : "text-line"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={3}
        placeholder="How was the product and delivery? (optional)"
        className="mt-3 w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-brand-500"
      />
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <button type="button" onClick={submit} className="mt-3 rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-500">
        Post review
      </button>
    </section>
  );
}

const DISPUTE_HEADLINE: Record<Dispute["status"], string> = {
  seller_review: "The seller has been asked to answer.",
  awaiting_buyer: "The seller answered. Your turn.",
  escalated: "A GroupBuy admin is reviewing your report.",
  resolved: "This report is closed.",
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const user = useSessionUser();
  const [disputing, setDisputing] = useState(false);
  const [error, setError] = useState("");

  const data = useMemo(() => {
    if (!db || !user) {
      return null;
    }
    const order = db.orders.find((row) => row.id === id && row.buyerId === user.id);
    if (!order) {
      return { order: undefined };
    }
    return {
      order,
      deal: db.deals.find((deal) => deal.id === order.dealId),
      shop: db.sellerProfiles.find((seller) => seller.id === order.sellerId)?.shopName,
      cover: dealCoverImage(db, order.dealId),
      dispute: disputeForOrder(db, order.id),
      disputable: canDispute(db, order),
      reviewable: canReview(db, order),
      review: db.reviews.find((row) => row.orderId === order.id),
      autoConfirmAt: order.shippedAt
        ? new Date(Date.parse(order.shippedAt) + getSetting(db, "autoConfirmDeliveryDays") * DAY).toISOString()
        : null,
    };
  }, [db, user, id]);

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10">
        <Skeleton className="h-96" />
      </div>
    );
  }

  const { order } = data;
  if (!order) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10">
        <EmptyState icon="ghost" title="Order not found" text="It may belong to another account." action={{ href: "/orders", label: "Back to orders" }} />
      </div>
    );
  }

  const { deal, shop, cover, dispute, disputable, autoConfirmAt, reviewable, review } = data;
  const address = order.shippingAddress;

  function confirm() {
    const result = confirmDelivery(order!.id);
    setError(result.ok ? "" : result.error);
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:py-10">
      <BackLink href={"/orders"}>Back to orders</BackLink>

      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-sheet bg-surface shadow-sm">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <OrderStatusPill status={order.status} />
          <h1 className="mt-2 text-3xl font-extrabold">{deal?.title ?? "Order"}</h1>
          <p className="mt-1 text-muted">
            {shop} · {order.quantity} × {formatTHB(order.unitPrice)} = {formatTHB(order.total)}
            {order.shippingFee > 0 && <> + {formatTHB(order.shippingFee)} shipping</>} ·{" "}
            <b className="text-ink">{formatTHB(order.total + order.shippingFee)} paid</b>
          </p>
        </div>
      </div>

      {order.status === "shipped" && (
        <section className="mt-6 rounded-hero bg-gradient-to-br from-hero-from via-hero-via to-hero-to p-6">
          <p className="text-lg font-extrabold">Has your order arrived?</p>
          <p className="mt-1 text-sm text-muted-strong">
            Confirm once it&apos;s with you. Otherwise it&apos;s confirmed automatically in{" "}
            {autoConfirmAt && <Countdown until={autoConfirmAt} />} unless you report a problem.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={confirm} className="rounded-2xl bg-brand-500 px-6 py-3 font-extrabold text-white hover:bg-brand-600">
              Yes, it arrived
            </button>
            {disputable && !disputing && (
              <button
                type="button"
                onClick={() => setDisputing(true)}
                className="rounded-2xl border border-line bg-surface px-6 py-3 font-bold hover:border-danger hover:text-danger"
              >
                Report a problem
              </button>
            )}
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        </section>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-sheet bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-extrabold">Progress</h2>
          <ol className="mt-4 space-y-4">
            <Step done label="Paid" time={order.createdAt} />
            <Step
              done={Boolean(order.shippedAt)}
              label={
                order.trackingNumber
                  ? `Shipped · ${order.courier ? `${COURIERS[order.courier].name} ` : ""}${order.trackingNumber}`
                  : "Shipped"
              }
              time={order.shippedAt}
            />
            <Step done={Boolean(order.deliveredAt)} label="Delivered" time={order.deliveredAt} />
          </ol>
        </section>

        <section className="rounded-sheet bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-extrabold">Delivery address</h2>
          <p className="mt-3 text-sm leading-6 text-muted-strong">
            <b className="text-ink">{address.recipient}</b> · {address.phone}
            <br />
            {[address.line1, address.line2].filter(Boolean).join(", ")}
            <br />
            {address.district}, {address.province} {address.postalCode}
          </p>
        </section>
      </div>

      {reviewable && <ReviewForm orderId={order.id} />}
      {review && (
        <section className="mt-6 rounded-sheet bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-extrabold">Your review</h2>
          <p className="mt-2 text-lg text-brand-500" aria-label={`${review.rating} out of 5 stars`}>
            {"★".repeat(review.rating)}
            <span className="text-line">{"★".repeat(5 - review.rating)}</span>
          </p>
          {review.comment && <p className="mt-1 text-sm text-muted-strong">{review.comment}</p>}
        </section>
      )}

      <section className="mt-6 rounded-sheet bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-extrabold">Need help?</h2>
        {dispute ? (
          <div className="mt-3 text-sm leading-6">
            <div className="flex flex-wrap items-center gap-2">
              <DisputeStatusPill status={dispute.status} />
              <span className="font-bold">{DISPUTE_HEADLINE[dispute.status]}</span>
            </div>
            {dispute.status === "seller_review" && dispute.respondBy && (
              <p className="mt-1 text-muted">
                The seller has <Countdown until={dispute.respondBy} /> to offer a refund or reply. If they don&apos;t,
                a GroupBuy admin takes over.
              </p>
            )}
            <div className="mt-4">
              <DisputeTimeline dispute={dispute} />
            </div>
            {dispute.status === "awaiting_buyer" && <OfferAnswer dispute={dispute} />}
            {dispute.status === "resolved" && dispute.refundAmount ? (
              <p className="mt-3 font-bold text-success-600">
                {formatTHB(dispute.refundAmount)} refunded to your original payment method.
              </p>
            ) : null}
          </div>
        ) : disputable ? (
          <>
            <p className="mt-2 text-sm text-muted">
              Not delivered, damaged or the wrong item? Tell the seller first: they have {db ? getSetting(db, "disputeResponseDays") : 3} days to offer a refund
              or reply. If you can&apos;t agree, a GroupBuy admin decides.
            </p>
            {disputing ? (
              <DisputeForm orderId={order.id} onDone={() => setDisputing(false)} />
            ) : (
              <button type="button" onClick={() => setDisputing(true)} className="mt-3 text-sm font-bold text-brand-500">
                Report a problem <Icon name="arrow-right" className="inline h-4 w-4 align-[-3px]" />
              </button>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">This order is closed. Contact GroupBuy support if something is wrong.</p>
        )}
      </section>
    </div>
  );
}
