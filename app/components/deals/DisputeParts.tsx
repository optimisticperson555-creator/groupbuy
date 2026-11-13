"use client";

import { useState } from "react";
import { baht, Dispute, DISPUTE_REASONS, formatDateTime, formatTHB, Order, refundableAmount } from "../../lib/store";
import { StatusPill } from "../ui";

/** Problem-report pieces shared by the buyer, seller and admin pages. */

const STATUS: Record<Dispute["status"], { label: string; tone: "brand" | "danger" | "muted" | "success" }> = {
  seller_review: { label: "Waiting for seller", tone: "brand" },
  awaiting_buyer: { label: "Waiting for buyer", tone: "brand" },
  escalated: { label: "Admin deciding", tone: "danger" },
  resolved: { label: "Resolved", tone: "muted" },
};

export function DisputeStatusPill({ status }: { status: Dispute["status"] }) {
  return <StatusPill tone={STATUS[status].tone}>{STATUS[status].label}</StatusPill>;
}

function refundText(amount: number | null) {
  return amount ? `${formatTHB(amount)} refund` : "no refund";
}

/** The report as a short conversation: buyer → seller → buyer → outcome. */
export function DisputeTimeline({ dispute }: { dispute: Dispute }) {
  const steps: { who: string; when: string | null; text: string }[] = [
    {
      who: `Buyer reported: ${DISPUTE_REASONS[dispute.reason]}`,
      when: dispute.createdAt,
      text: `“${dispute.details}”`,
    },
  ];
  if (dispute.sellerRespondedAt) {
    steps.push({
      who: `Seller offered ${refundText(dispute.sellerOfferAmount)}`,
      when: dispute.sellerRespondedAt,
      text: dispute.sellerMessage ? `“${dispute.sellerMessage}”` : "",
    });
  }
  if (dispute.escalatedAt) {
    steps.push({
      who:
        dispute.escalationReason === "seller_timeout"
          ? "Sent to an admin: the seller didn't answer in time"
          : "Buyer asked an admin to decide",
      when: dispute.escalatedAt,
      text: dispute.buyerNote ? `“${dispute.buyerNote}”` : "",
    });
  }
  if (dispute.status === "resolved") {
    const by =
      dispute.resolvedBy === "admin"
        ? "Admin decided"
        : dispute.resolvedBy === "buyer_timeout"
          ? "Closed: the buyer didn't answer, so the seller's offer stands"
          : "Buyer accepted the seller's offer";
    steps.push({
      who: `${by}: ${refundText(dispute.refundAmount)}`,
      when: dispute.resolvedAt,
      text: dispute.resolvedBy === "admin" && dispute.resolution ? `“${dispute.resolution}”` : "",
    });
  }

  return (
    <ol className="space-y-3 border-l-2 border-line pl-4">
      {steps.map((step, index) => (
        <li key={index} className="relative">
          <span aria-hidden="true" className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
          <p className="text-sm font-bold">{step.who}</p>
          {step.when && <p className="text-xs text-subtle">{formatDateTime(step.when)}</p>}
          {step.text && <p className="mt-1 text-sm leading-6 text-muted-strong">{step.text}</p>}
        </li>
      ))}
    </ol>
  );
}

type RefundChoice = "full" | "partial" | "none";

/**
 * Full / partial / no refund picker. Calls `onSubmit` with the refund in
 * satang and the message; it returns an error message or null.
 */
export function RefundForm({
  order,
  messageLabel,
  submitLabel,
  noneLabel = "No refund",
  recommended = "full",
  onSubmit,
}: {
  order: Order;
  messageLabel: string;
  submitLabel: string;
  noneLabel?: string;
  recommended?: RefundChoice;
  onSubmit: (refund: number, message: string) => string | null;
}) {
  const refundable = refundableAmount(order);
  const [choice, setChoice] = useState<RefundChoice>(recommended);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const refund = choice === "full" ? refundable : choice === "partial" ? baht(Number(amount) || 0) : 0;
    if (choice === "partial" && (refund <= 0 || refund >= refundable)) {
      setError(`A partial refund must be more than ฿0 and less than ${formatTHB(refundable)}.`);
      return;
    }
    setError(onSubmit(refund, message) ?? "");
  }

  const options: [RefundChoice, string, string][] = [
    ["full", `Full refund (${formatTHB(refundable)})`, "Products and shipping. Closes the report straight away."],
    ["partial", "Partial refund", "For example for a small defect the buyer can live with."],
    ["none", noneLabel, "Explain why in your message."],
  ];

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-sm font-bold">Outcome</legend>
        <div className="mt-2 space-y-2">
          {options.map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`refund-${order.id}`}
                checked={choice === value}
                onChange={() => setChoice(value)}
                className="mt-1 accent-brand-500"
              />
              <span>
                <span className="font-semibold">{label}</span>
                {value === recommended && <span className="ml-1 text-xs font-bold text-success-600">Recommended</span>}
                <span className="block text-xs text-subtle">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {choice === "partial" && (
        <label className="block text-sm font-bold">
          Refund amount (฿)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal outline-none focus:border-brand-500"
          />
        </label>
      )}
      <label className="block text-sm font-bold">
        {messageLabel}
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal outline-none focus:border-brand-500"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        className="w-full rounded-xl bg-ink py-2.5 text-sm font-bold text-white hover:bg-brand-500"
      >
        {submitLabel}
      </button>
    </div>
  );
}
