import { NextRequest, NextResponse } from "next/server";
import {
  createBillingAdminClient,
  getBillingConfig,
  lemonSqueezyRequest,
  type ProviderResource,
} from "@/lib/billing";
import {
  billingEventKey,
  parseSubscriptionSnapshot,
  reconcileLatestInvoice,
  subscriptionIdFromEvent,
  SUPPORTED_BILLING_EVENTS,
  verifyCheckoutBinding,
  verifyWebhookSignature,
} from "@/lib/billing/helpers";

export const runtime = "nodejs";
const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: NextRequest) {
  let config;
  try {
    config = getBillingConfig();
  } catch {
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  }
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_WEBHOOK_BYTES)
    return NextResponse.json({ error: "Body too large." }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json({ error: "Body required." }, { status: 400 });
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return NextResponse.json({ error: "Body too large." }, { status: 413 });
    }
    parts.push(value);
  }
  const raw = Buffer.concat(parts).toString("utf8");
  if (
    !verifyWebhookSignature(
      raw,
      request.headers.get("x-signature"),
      config.webhookSecret,
    )
  )
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  let payload: {
    meta?: { event_name?: string; custom_data?: Record<string, unknown> };
    data?: { type?: string; id?: string; attributes?: Record<string, unknown> };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const eventName = payload?.meta?.event_name;
  if (
    !eventName ||
    (request.headers.get("x-event-name") &&
      request.headers.get("x-event-name") !== eventName)
  )
    return NextResponse.json({ error: "Invalid event name." }, { status: 400 });
  if (!SUPPORTED_BILLING_EVENTS.has(eventName))
    return NextResponse.json({ ignored: true });
  const subscriptionId = subscriptionIdFromEvent(payload);
  if (!subscriptionId)
    return NextResponse.json(
      { error: "Subscription identity missing." },
      { status: 400 },
    );
  try {
    // Re-read authoritative current state: a late delivery cannot restore an old subscription.
    const [current, invoices] = await Promise.all([
      lemonSqueezyRequest(`subscriptions/${subscriptionId}`),
      lemonSqueezyRequest<{ data: ProviderResource[] }>(
        `subscription-invoices?filter[subscription_id]=${subscriptionId}&page[size]=1`,
      ),
    ]);
    const snapshot = reconcileLatestInvoice(
      parseSubscriptionSnapshot(current.data, config),
      invoices.data[0],
      config,
    );
    const admin = createBillingAdminClient();
    const { data: existing, error: mappingError } = await admin
      .from("sender_entitlements")
      .select("user_id, customer_id")
      .eq("subscription_id", subscriptionId)
      .maybeSingle();
    if (mappingError) throw new Error("Billing mapping unavailable.");
    const custom = payload.meta?.custom_data;
    let userId = existing?.user_id as string | undefined;
    let reservationId: string | null = null;
    if (!userId) {
      if (
        !verifyCheckoutBinding(
          custom?.user_id,
          custom?.reservation_id,
          custom?.account_signature,
          config,
          config.webhookSecret,
        )
      )
        throw new Error("Verified checkout ownership missing.");
      userId = custom?.user_id as string;
      reservationId = custom?.reservation_id as string;
    } else if (existing?.customer_id !== snapshot.customerId)
      throw new Error("Subscription customer mismatch.");
    const { data, error } = await admin.rpc("process_billing_event", {
      p_event_key: billingEventKey(raw),
      p_event_name: eventName,
      p_occurred_at: snapshot.updatedAt,
      p_user_id: userId,
      p_customer_id: snapshot.customerId,
      p_subscription_id: snapshot.id,
      p_status: snapshot.status,
      p_pro_until: snapshot.proUntil,
      p_test_mode: snapshot.testMode,
      p_payload: {
        resource_type: payload.data?.type,
        resource_id: payload.data?.id,
      },
      p_reservation_id: reservationId,
      p_capacity_reserved: snapshot.capacityReserved,
    });
    if (error) throw new Error("Billing event persistence failed.");
    return NextResponse.json({ received: true, result: data });
  } catch {
    // No payload or provider secrets in logs/responses. A non-2xx requests a retry.
    return NextResponse.json(
      { error: "Billing reconciliation failed. Retry this event." },
      { status: 503 },
    );
  }
}
