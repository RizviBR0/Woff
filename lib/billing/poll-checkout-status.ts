import type { CheckoutStatus } from "./checkout-state";

export const CHECKOUT_CHECK_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 3_000;

type CheckResult =
  | { kind: "complete" | "pending" | "signed-out" }
  | { kind: "error"; message: string };

function isCheckoutStatus(value: unknown): value is CheckoutStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Partial<CheckoutStatus>;
  return ["active", "processing", "attention", "inactive"].includes(status.state ?? "") &&
    typeof status.hasSubscription === "boolean" &&
    (status.paidThrough === null ||
      (typeof status.paidThrough === "string" && Number.isFinite(Date.parse(status.paidThrough))));
}

/** A check must finish even if a request/body stalls or ignores its abort signal. */
export function pollCheckoutStatus({
  onStatus,
  onFinish,
  isVisible = () => document.visibilityState !== "hidden",
}: {
  onStatus: (status: CheckoutStatus) => void;
  onFinish: (result: CheckResult) => void;
  isVisible?: () => boolean;
}): () => void {
  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let requestController: AbortController | undefined;
  const deadline = Date.now() + CHECKOUT_CHECK_TIMEOUT_MS;

  function stop() {
    stopped = true;
    clearTimeout(deadlineTimer);
    clearTimeout(pollTimer);
    clearTimeout(requestTimer);
    requestController?.abort();
  }

  function finish(result: CheckResult) {
    if (stopped) return;
    stop();
    onFinish(result);
  }

  // This watchdog is independent of the poll loop and the fetch promise.
  const deadlineTimer = setTimeout(() => finish({ kind: "pending" }), CHECKOUT_CHECK_TIMEOUT_MS);

  async function check() {
    if (stopped) return;
    if (Date.now() >= deadline) { finish({ kind: "pending" }); return; }
    if (!isVisible()) {
      pollTimer = setTimeout(check, POLL_INTERVAL_MS);
      return;
    }
    requestController = new AbortController();
    requestTimer = setTimeout(() => finish({
      kind: "error", message: "The account check timed out. Please try again.",
    }), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/billing/status", {
        cache: "no-store",
        signal: requestController.signal,
      });
      if (stopped) return;
      if (response.status === 401) { finish({ kind: "signed-out" }); return; }
      if (!response.ok) {
        finish({ kind: "error", message: "We couldn’t check your account just now. Please try again." });
        return;
      }
      const result: unknown = await response.json();
      if (stopped) return;
      if (!isCheckoutStatus(result)) {
        finish({ kind: "error", message: "We couldn’t read your subscription status. Please try again." });
        return;
      }
      clearTimeout(requestTimer);
      onStatus(result);
      if (result.state !== "processing") { finish({ kind: "complete" }); return; }
      pollTimer = setTimeout(check, POLL_INTERVAL_MS);
    } catch {
      if (!stopped) finish({
        kind: "error", message: "We couldn’t check your account just now. Please try again.",
      });
    }
  }

  void check();
  return stop;
}
