"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useLogout } from "../components/shell/UserMenu";
import { useDb, useSessionUser } from "../lib/store";

/** Shown instead of Seller Center until an admin approves the application. */
const WAITING = {
  pending: {
    label: "WAITING FOR APPROVAL",
    title: "Your seller application is under review",
    text: "An admin will check your shop soon. Seller Center opens as soon as you're approved, and we'll send you a notification.",
  },
  rejected: {
    label: "APPLICATION NOT APPROVED",
    title: "Your seller application was not approved",
    text: "You can't use Seller Center with this account. Contact GroupBuy support if you'd like to apply again.",
  },
};

/** True when this seller may create and edit deals. */
export function useCanSell() {
  return useSessionUser()?.sellerStatus === "approved";
}

/**
 * Keeps pending and rejected sellers out of Seller Center: they see a
 * waiting screen until an admin approves them. Store actions check approval
 * again, so this is not the only guard.
 */
export function SellerApprovalGate({ children }: { children: ReactNode }) {
  const user = useSessionUser();
  const db = useDb();
  const logout = useLogout();
  const status = user?.sellerStatus;

  if (status !== "pending" && status !== "rejected") {
    return <>{children}</>;
  }

  const message = WAITING[status];
  const rejectionReason =
    status === "rejected" ? db?.sellerProfiles.find((row) => row.id === user?.id)?.rejectionReason : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 text-ink">
      <div role="status" className="w-full max-w-md rounded-sheet bg-surface p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-brand-500">{message.label}</p>
        <h1 className="mt-3 text-2xl font-extrabold">{message.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-strong">{message.text}</p>
        {rejectionReason && (
          <p className="mt-4 rounded-2xl bg-brand-50 p-4 text-left text-sm leading-6 text-muted-strong">
            <span className="font-bold text-brand-700">Reason: </span>
            {rejectionReason}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/" className="rounded-xl border border-line bg-surface px-5 py-3 text-sm font-bold hover:border-brand-400">
            Go to homepage
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white hover:bg-brand-600"
          >
            Log out
          </button>
        </div>
      </div>
    </main>
  );
}

/** Banner for an approved seller whose shop has since been suspended (they still have orders to ship). */
export default function SellerStatusBanner() {
  const status = useSessionUser()?.sellerStatus;

  if (status !== "suspended") {
    return null;
  }

  return (
    <div role="status" className="mx-auto max-w-6xl px-5 pt-6">
      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
        <p className="font-bold text-brand-700">Your shop is suspended</p>
        <p className="mt-1 text-sm leading-6 text-muted-strong">
          You can&apos;t create new deals while your shop is suspended. Contact GroupBuy support.
        </p>
      </div>
    </div>
  );
}
