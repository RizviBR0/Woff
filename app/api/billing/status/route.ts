import { NextResponse } from "next/server";
import { getAccountContext } from "@/lib/account";
import { isVerifiedSender } from "@/lib/account-helpers";
import { checkoutStatus } from "@/lib/billing/checkout-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const { user, account, available } = await getAccountContext();
  if (!available)
    return NextResponse.json(
      { error: "We couldn’t check your account. Please try again." },
      { status: 503, headers },
    );
  if (!isVerifiedSender(user))
    return NextResponse.json(
      { error: "Sign in to check your subscription." },
      { status: 401, headers },
    );
  if (!account)
    return NextResponse.json(
      { error: "Your account is temporarily unavailable." },
      { status: 503, headers },
    );
  return NextResponse.json(checkoutStatus(account), { headers });
}
