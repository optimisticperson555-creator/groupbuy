"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { DealSummary, formatTHB, getSetting, rememberReferral, SessionUser, useDb } from "../../lib/store";
import Icon, { IconName } from "../shell/Icon";

/**
 * Invite link for a deal, with one-tap sharing to LINE and Facebook, the
 * phone's own share sheet (Instagram, TikTok, Messenger...) and copy link.
 * Signed-in users get a personal link (`?ref=<their id>`): when a friend
 * joins through it and pays a first order, both get referral credit.
 */

const noop = () => () => {};

/** The site's address in the browser; empty during server rendering. */
function useOrigin() {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}

/** Whether the browser has a native share sheet (most phones). */
function useCanNativeShare() {
  return useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
}

export function inviteLink(origin: string, dealId: string, user: SessionUser | null | undefined) {
  const url = new URL(`/deals/${dealId}`, origin || "http://localhost");
  if (user) {
    url.searchParams.set("ref", user.id);
  }
  return url.toString();
}

/** The message that goes with the link, built from the deal's live progress. */
export function inviteMessage(summary: DealSummary) {
  const price = summary.currentTier ? formatTHB(summary.currentTier.unitPrice) : "";
  const next =
    summary.nextTier && summary.unitsToNextTier
      ? ` Only ${summary.unitsToNextTier} more ${summary.unitsToNextTier === 1 ? "unit" : "units"} to unlock ${formatTHB(summary.nextTier.unitPrice)}!`
      : "";
  return `Join me on GroupBuy: ${summary.deal.title} is ${price} right now.${next} The more we buy together, the less we all pay.`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is blocked on plain-http LAN addresses; fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function ShareButton({ href, onClick, icon, label }: { href?: string; onClick?: () => void; icon: IconName; label: string }) {
  const className =
    "flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-bold hover:border-brand-400 hover:text-brand-600";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function ShareDeal({ summary, user }: { summary: DealSummary; user: SessionUser | null | undefined }) {
  const origin = useOrigin();
  const canNativeShare = useCanNativeShare();
  const [copied, setCopied] = useState(false);

  const link = inviteLink(origin, summary.deal.id, user);
  const message = inviteMessage(summary);
  const encodedLink = encodeURIComponent(link);
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);

  async function copy() {
    if (await copyText(link)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: summary.deal.title, text: message, url: link });
    } catch {
      // The user closed the share sheet.
    }
  }

  return (
    <section className="rounded-sheet bg-surface p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          <Icon name="share" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold">Invite friends, pay less</h2>
          <p className="mt-1 text-sm text-muted">
            {summary.nextTier && summary.unitsToNextTier
              ? `${summary.unitsToNextTier} more ${summary.unitsToNextTier === 1 ? "unit unlocks" : "units unlock"} ${formatTHB(summary.nextTier.unitPrice)} for everyone.`
              : "Every friend who joins helps the whole group."}{" "}
            Share your invite link{user?.role === "buyer" ? ": when a friend pays their first order, you both get referral credit" : ""}.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-subtle p-2 pl-3">
        <Icon name="link" className="h-4 w-4 shrink-0 text-subtle" />
        <input
          readOnly
          value={link}
          aria-label="Invite link"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent text-sm text-muted-strong outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-brand-500"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? "Invite link copied" : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <ShareButton
          href={`https://line.me/R/share?text=${encodeURIComponent(`${message} ${link}`)}`}
          icon="chat"
          label="LINE"
        />
        <ShareButton href={`https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`} icon="share" label="Facebook" />
        {canNativeShare ? (
          <ShareButton onClick={nativeShare} icon="more" label="More apps" />
        ) : (
          <ShareButton onClick={() => void copyText(`${message} ${link}`).then(() => setCopied(true))} icon="copy" label="Copy message" />
        )}
      </div>
      <p className="mt-3 text-xs text-subtle">
        For Instagram or TikTok, use {canNativeShare ? "“More apps”" : "“Copy message”"} and paste it into your story or chat.
        {isLocal && " This demo runs on your computer, so the link only opens on this device until the site is online."}
      </p>
    </section>
  );
}

function InvitedBannerInner({ dealId, user }: { dealId: string; user: SessionUser | null | undefined }) {
  const db = useDb();
  const ref = useSearchParams().get("ref");
  useEffect(() => {
    if (ref) {
      rememberReferral(ref);
    }
  }, [ref]);
  if (!db || !ref || ref === user?.id) {
    return null;
  }
  const inviter = db.profiles.find((profile) => profile.id === ref);
  if (!inviter) {
    return null;
  }
  return (
    <p className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-600" data-deal={dealId}>
      <Icon name="party" className="h-4 w-4 shrink-0" />
      {inviter.fullName} invited you to this deal. Join and pay your first order, and you both get{" "}
      {formatTHB(getSetting(db, "referralCredit"))} credit.
    </p>
  );
}

/** "X invited you" when the page was opened from someone's invite link. */
export function InvitedBanner(props: { dealId: string; user: SessionUser | null | undefined }) {
  return (
    <Suspense fallback={null}>
      <InvitedBannerInner {...props} />
    </Suspense>
  );
}
