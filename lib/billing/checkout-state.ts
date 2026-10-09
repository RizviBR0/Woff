/** Browser-safe billing presentation. Only verified server account data belongs here. */
export type CheckoutAccount = {
  is_pro: boolean;
  status: string;
  subscription_id?: string | null;
  billing_capacity_reserved?: boolean;
  paid_through?: string | null;
  pro_until?: string | null;
};

export function needsBillingManagement(account: CheckoutAccount): boolean {
  return Boolean(
    account.is_pro ||
      account.billing_capacity_reserved ||
      (account.subscription_id &&
        !["expired", "unpaid", "refunded"].includes(account.status)),
  );
}

export type CheckoutStatus = {
  state: "active" | "processing" | "attention" | "inactive";
  hasSubscription: boolean;
  paidThrough: string | null;
};

export function checkoutStatus(account: CheckoutAccount, now = Date.now()): CheckoutStatus {
  const hasSubscription = Boolean(account.subscription_id);
  const value = account.paid_through || account.pro_until;
  const paidThrough = value && Number.isFinite(Date.parse(value)) ? value : null;
  // A cancellation's paid deadline can pass before its expiry webhook arrives.
  const cancelledAccessEnded = !account.is_pro && account.status === "cancelled" &&
    paidThrough !== null && Date.parse(paidThrough) <= now;
  // Grace access is useful to the customer, but must not say a failed renewal
  // was paid merely because is_pro remains true during its bounded grace.
  const needsAttention = ["past_due", "unpaid", "paused", "refunded"].includes(
    account.status,
  );
  return {
    state: needsAttention
      ? "attention"
      : account.is_pro && ["active", "cancelled"].includes(account.status)
        ? "active"
        : hasSubscription && (account.status === "expired" || cancelledAccessEnded)
          ? "inactive"
          : "processing",
    hasSubscription,
    paidThrough,
  };
}
