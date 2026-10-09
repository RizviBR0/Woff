/** Public launch information. Read on the server; never expose provider keys. */
export const MIB = 1024 * 1024;
export const GIB = 1024 * MIB;

export function getLaunchConfig() {
  const accountsEnabled = process.env.WOFF_ACCOUNTS_ENABLED !== "false";
  const emailDeliveryVerified = process.env.WOFF_EMAIL_DELIVERY_VERIFIED === "true";
  const storageCapacityVerified = process.env.WOFF_STORAGE_CAPACITY_VERIFIED === "true";
  const testPayments = process.env.LEMON_SQUEEZY_TEST_MODE === "true";
  const providerConfigured = Boolean(
    process.env.LEMON_SQUEEZY_API_KEY &&
      process.env.LEMON_SQUEEZY_STORE_ID &&
      process.env.LEMON_SQUEEZY_VARIANT_ID &&
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return {
    accountsEnabled,
    emailDeliveryVerified,
    storageCapacityVerified,
    checkoutEnabled:
      accountsEnabled &&
      emailDeliveryVerified &&
      (testPayments || storageCapacityVerified) &&
      providerConfigured &&
      process.env.WOFF_BILLING_ENABLED === "true",
    proPriceUsd: 8,
    freeRoomBytes: 200 * MIB,
    freeOwnerBytes: 400 * MIB,
    proOwnerBytes: GIB,
    maxProRooms: 10,
    maxPilotAccounts: 5,
    maxFileBytes: 50 * MIB,
    maxBatchFiles: 20,
  };
}
