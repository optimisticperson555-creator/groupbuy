/**
 * Table row types for the localStorage store. They follow the data model in
 * CLAUDE.md (Part 3). Conventions:
 * - every row has a string `id`
 * - timestamps are ISO strings (UTC); format them in Asia/Bangkok for display
 * - money is an integer number of satang (฿1 = 100)
 * - rates are integer basis points (10% = 1000)
 */

export type UserRole = "buyer" | "seller" | "admin";

export type Satang = number;
export type BasisPoints = number;
export type IsoDate = string;

/** Login credentials. Replaces Supabase Auth for the demo. */
export type Account = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: IsoDate;
};

export type Profile = {
  /** Same as the account id */
  id: string;
  role: UserRole;
  fullName: string;
  phone: string;
  status: "active" | "suspended";
  votingRestrictedUntil: IsoDate | null;
  /** The buyer whose invite link brought this buyer in (set on their first vote) */
  referredBy: string | null;
  createdAt: IsoDate;
};

export type SellerApplicationStatus = "pending" | "approved" | "rejected" | "suspended";

export type SellerProfile = {
  /** Same as the seller's profile id */
  id: string;
  shopName: string;
  description: string;
  applicationStatus: SellerApplicationStatus;
  /** null means the platform default from settings */
  commissionRate: BasisPoints | null;
  /** Pro plan (simulated subscription) is active until this time */
  proUntil: IsoDate | null;
  /** Where 2C2P sends this seller's payouts, e.g. "KBank •••• 1234"; null until the seller adds one */
  bankAccount: string | null;
  /** Admin hold: automatic payouts stop until the admin releases them */
  payoutHoldAt: IsoDate | null;
  payoutHoldReason: string | null;
  rejectionReason: string | null;
  createdAt: IsoDate;
};

export type Address = {
  id: string;
  userId: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  district: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
  createdAt: IsoDate;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  /** An icon name from app/components/shell/Icon.tsx (CATEGORY_ICONS) */
  icon: string;
  sortOrder: number;
};

export type DealStatus =
  | "draft"
  | "pending_review"
  | "rejected"
  | "live"
  | "seller_decision"
  | "payment_window"
  | "fulfilling"
  | "completed"
  | "cancelled";

export type Deal = {
  id: string;
  sellerId: string;
  categoryId: string;
  title: string;
  description: string;
  status: DealStatus;
  /** Length of the voting period; the clock starts when an admin approves the deal */
  votingDays: number;
  /** Set on approval (seed data may set them earlier) */
  votingStartsAt: IsoDate | null;
  votingEndsAt: IsoDate | null;
  maxUnitsPerBuyer: number | null;
  /** Stock cap: the most units the seller can supply. Voting stops accepting units at this total. */
  maxTotalUnits: number | null;
  /** Parcel weight of one unit in grams, used for the courier quote */
  parcelWeightGrams: number;
  /**
   * Commission locked when the admin approves the deal: the admin's per-deal
   * rate, else the seller's rate, else the platform default. null before approval.
   */
  commissionRate: BasisPoints | null;
  unitsVotedAtClose: number | null;
  lockedTierId: string | null;
  lockedUnitPrice: Satang | null;
  decisionDeadline: IsoDate | null;
  paymentDeadline: IsoDate | null;
  /** When the seller chose Proceed or Cancel, or the decision window ran out */
  decidedAt: IsoDate | null;
  cancelReason: "seller" | "decision_timeout" | null;
  /** Admin's note when rejecting a deal */
  reviewNote: string | null;
  createdAt: IsoDate;
};

export type DealImage = {
  id: string;
  dealId: string;
  /** A path under /public for now, e.g. /assets/watch.jpeg */
  src: string;
  sortOrder: number;
};

export type DealTier = {
  id: string;
  dealId: string;
  minUnits: number;
  /** null for the top tier */
  maxUnits: number | null;
  unitPrice: Satang;
};

export type VoteStatus = "active" | "withdrawn" | "paid" | "declined" | "expired" | "cancelled";

export type Vote = {
  id: string;
  dealId: string;
  buyerId: string;
  quantity: number;
  status: VoteStatus;
  /** Payment reminders already sent in the payment window */
  reminders: number;
  respondedAt: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type ShippingAddressSnapshot = Omit<Address, "id" | "userId" | "isDefault" | "createdAt">;

export type OrderStatus = "paid" | "shipped" | "delivered" | "disputed" | "refunded";

export type Order = {
  id: string;
  voteId: string;
  dealId: string;
  buyerId: string;
  sellerId: string;
  quantity: number;
  unitPrice: Satang;
  /** Product total (unitPrice × quantity), without shipping. Commission is charged on this. */
  total: Satang;
  /** Courier fee paid by the buyer on top of `total`; no commission on it */
  shippingFee: Satang;
  shippingCarrier: string;
  /** Gateway fee on the amount charged, passed through to the seller (deducted from the payout) */
  paymentFee: Satang;
  /** Referral credit the buyer spent on this order; the platform covers it, the seller is paid in full */
  creditUsed: Satang;
  /** Courier the seller chose when creating the shipping label */
  courier: CourierId | null;
  /** The deal's commission rate, copied at payment; never changes */
  commissionRate: BasisPoints;
  /** Commission on the product amount the seller keeps; recalculated after a refund */
  commissionAmount: Satang;
  /** Everything returned to the buyer. Refunds come out of the product total first, then shipping. */
  refundedAmount: Satang;
  shippingAddress: ShippingAddressSnapshot;
  status: OrderStatus;
  trackingNumber: string | null;
  shippedAt: IsoDate | null;
  deliveredAt: IsoDate | null;
  /** Set once the order can be paid out to the seller */
  payableAt: IsoDate | null;
  payoutId: string | null;
  createdAt: IsoDate;
};

export type CourierId = "flash" | "kex" | "jt";

export type Payment = {
  id: string;
  /** null for a failed attempt that created no order */
  orderId: string | null;
  /** The 2C2P gateway, simulated */
  provider: "2c2p" | "mock";
  providerRef: string;
  method: "promptpay" | "card" | "truemoney";
  amount: Satang;
  /** "refund" rows record money returned to the buyer */
  status: "succeeded" | "failed" | "refund";
  createdAt: IsoDate;
};

/**
 * One payout per order, released automatically through 2C2P's split payment
 * once the order is payable. "failed" rows record a release that couldn't be
 * sent (e.g. no bank account); the order is retried automatically.
 */
export type Payout = {
  id: string;
  sellerId: string;
  orderId: string | null;
  amount: Satang;
  status: "paid" | "failed";
  failureReason: string | null;
  paidAt: IsoDate | null;
  createdAt: IsoDate;
};

export type NoShowEvent = {
  id: string;
  buyerId: string;
  dealId: string;
  createdAt: IsoDate;
};

/**
 * seller_review: the seller has `respondBy` to offer a refund or reply.
 * awaiting_buyer: the buyer has `respondBy` to accept the offer or send it to an admin.
 * escalated: an admin decides. resolved: closed.
 */
export type DisputeStatus = "seller_review" | "awaiting_buyer" | "escalated" | "resolved";

export type Dispute = {
  id: string;
  orderId: string;
  openedBy: string;
  reason: "not_delivered" | "damaged" | "wrong_item" | "other";
  details: string;
  status: DisputeStatus;
  /** Deadline for whoever must act next (seller, then buyer) */
  respondBy: IsoDate | null;
  /** The seller's offer: 0 means a reply without a refund */
  sellerOfferAmount: Satang | null;
  sellerMessage: string | null;
  sellerRespondedAt: IsoDate | null;
  escalatedAt: IsoDate | null;
  escalationReason: "buyer_rejected" | "seller_timeout" | null;
  /** Buyer's note when sending the case to an admin */
  buyerNote: string | null;
  resolvedBy: "buyer_accepted" | "buyer_timeout" | "admin" | null;
  /** Order status when the dispute was opened, to return to if there is no full refund */
  orderStatusBefore: OrderStatus;
  resolution: string | null;
  resolvedAt: IsoDate | null;
  refundAmount: Satang | null;
  createdAt: IsoDate;
};

/** Referral credits: + when earned, − when spent at payment. */
export type CreditEntry = {
  id: string;
  userId: string;
  amount: Satang;
  reason: "referral_inviter" | "referral_friend" | "spent" | "refund";
  /** The friend (for referral rewards) or the order (for spending) */
  relatedId: string | null;
  createdAt: IsoDate;
};

export type Review = {
  id: string;
  orderId: string;
  dealId: string;
  sellerId: string;
  buyerId: string;
  /** 1–5 stars */
  rating: number;
  comment: string;
  createdAt: IsoDate;
};

/** Seller purchases of platform services (all simulated payments). */
export type SellerPurchase = {
  id: string;
  sellerId: string;
  kind: "boost" | "banner" | "pro";
  /** The promoted deal (boost and banner) */
  dealId: string | null;
  amount: Satang;
  startsAt: IsoDate;
  endsAt: IsoDate;
  createdAt: IsoDate;
};

export type Notification = {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: IsoDate | null;
  createdAt: IsoDate;
};

export type SettingKey =
  | "votingPeriodMinDays"
  | "votingPeriodMaxDays"
  | "votingPeriodDefaultDays"
  | "sellerDecisionHours"
  | "paymentWindowHours"
  | "noShowLimit"
  | "noShowLookbackDays"
  | "noShowRestrictionDays"
  | "autoConfirmDeliveryDays"
  | "disputeResponseDays"
  | "defaultCommissionRate"
  | "paymentFeeRate"
  | "referralCredit"
  | "boostPrice"
  | "boostDays"
  | "bannerWeeklyPrice"
  | "proMonthlyPrice"
  | "basicActiveDeals"
  | "proActiveDeals";

export type Setting = {
  /** The setting key */
  id: SettingKey;
  value: number;
};

export type Tables = {
  accounts: Account[];
  profiles: Profile[];
  sellerProfiles: SellerProfile[];
  addresses: Address[];
  categories: Category[];
  deals: Deal[];
  dealImages: DealImage[];
  dealTiers: DealTier[];
  votes: Vote[];
  orders: Order[];
  payments: Payment[];
  payouts: Payout[];
  noShowEvents: NoShowEvent[];
  disputes: Dispute[];
  credits: CreditEntry[];
  reviews: Review[];
  sellerPurchases: SellerPurchase[];
  notifications: Notification[];
  settings: Setting[];
};

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T][number];
