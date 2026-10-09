import { NextRequest, NextResponse } from "next/server";
import { BillingError, getSenderBillingPortal } from "@/lib/billing";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  try {
    return NextResponse.json(
      { url: await getSenderBillingPortal() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BillingError
            ? error.message
            : "Billing management is temporarily unavailable. Please try again.",
        code: error instanceof BillingError ? error.code : "billing_unavailable",
      },
      { status: error instanceof BillingError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
