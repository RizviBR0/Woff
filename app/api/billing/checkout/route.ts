import { NextRequest, NextResponse } from "next/server";
import { BillingError, createSenderCheckout } from "@/lib/billing";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  try {
    return NextResponse.json(
      { url: await createSenderCheckout() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BillingError ? error.message : "We couldn’t prepare checkout. Please wait a moment before retrying, or contact support.",
        code: error instanceof BillingError ? error.code : "billing_unavailable",
      },
      { status: error instanceof BillingError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
