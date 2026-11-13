import { BasisPoints, Deal, SellerProfile, Setting, SettingKey } from "./types";

/** Starting values only; admins change them on the settings page. */
export const DEFAULT_SETTINGS: Record<SettingKey, number> = {
  votingPeriodMinDays: 1,
  votingPeriodMaxDays: 14,
  votingPeriodDefaultDays: 7,
  sellerDecisionHours: 12,
  paymentWindowHours: 24,
  noShowLimit: 3,
  noShowLookbackDays: 90,
  noShowRestrictionDays: 30,
  autoConfirmDeliveryDays: 7,
  /** Days the seller has to answer a problem report, and the buyer to answer the seller's offer */
  disputeResponseDays: 3,
  /** Basis points: 50 = 0.5% (the report's introductory rate, 0.25–0.5%) */
  defaultCommissionRate: 50,
  /** 2C2P processing fee on each payment, passed through to the seller. Planning assumption, basis points. */
  paymentFeeRate: 250,
  /** Referral credit for the inviter and for the friend, satang (฿10) */
  referralCredit: 1000,
  /** Product Boost: ฿200 for 3 days */
  boostPrice: 20000,
  boostDays: 3,
  /** Sponsored home-page banner, per week (฿1,500) */
  bannerWeeklyPrice: 150000,
  /** Pro plan, per month (฿590) */
  proMonthlyPrice: 59000,
  /** Deals a seller can have in review or live at once */
  basicActiveDeals: 3,
  proActiveDeals: 10,
};

/** Works with a Db snapshot, or inside mutate() as getSetting({ settings: tx.all("settings") }, key). */
export function getSetting(db: { settings: readonly Setting[] }, key: SettingKey): number {
  return db.settings.find((setting) => setting.id === key)?.value ?? DEFAULT_SETTINGS[key];
}

type CommissionSource = { settings: readonly Setting[]; sellerProfiles: readonly SellerProfile[] };

/** The seller's own rate, or the platform default. */
export function sellerCommissionRate(db: CommissionSource, sellerId: string): BasisPoints {
  return (
    db.sellerProfiles.find((row) => row.id === sellerId)?.commissionRate ?? getSetting(db, "defaultCommissionRate")
  );
}

/**
 * The rate a deal's orders pay: locked on the deal when the admin approves it.
 * Before approval this is what the deal would get today (seller rate or default).
 */
export function dealCommissionRate(db: CommissionSource, deal: Pick<Deal, "sellerId" | "commissionRate">): BasisPoints {
  return deal.commissionRate ?? sellerCommissionRate(db, deal.sellerId);
}
