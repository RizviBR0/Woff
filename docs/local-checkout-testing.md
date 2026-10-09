# Restart the local checkout test

This is an **optional local diagnostic**, not the startup procedure for public checkout. The authorized hosted Test release uses **`https://woff.space`** and its permanent webhook route; the owner needs no terminals or tunnel for it.

**Do not run the webhook-update command in step 3 while public Test checkout is in use.** The existing helper explicitly updates Test webhook **140877**. Repointing that hook to a temporary local tunnel would stop notifications reaching Woff's public accounts. A new local diagnostic session needs a separate Test webhook and local signing secret, with the helper adapted to that new hook; the commands below record the earlier isolated setup.

These steps use the existing checkout test tools in `E:\Woff`. Node, the local PostgreSQL runtime, Cloudflare's tunnel executable and the private provider settings are already present on this computer. No new account or paid plan is needed to run this checkout test.

The test app runs at **http://localhost:3002**. The regular app at port 3000 keeps its current configuration. Each test startup recreates only the disposable local **woff_billing_fixture** database and seeds a new synthetic account. Do not start a second runner while one is running, or restart during an unfinished purchase. A local reset does not cancel provider Test subscriptions.

## 1. Terminal 1: start the database and test app

Open PowerShell in your editor or Windows Terminal. Run:

```powershell
Set-Location E:\Woff
powershell -NoProfile -File .\supabase\tests\start-local-postgres.ps1
```

After it reports that the local fixture is running or started, run:

```powershell
node .\internal\checkout-test-runner.mjs
```

Wait for Next.js to report **Ready**. Leave this terminal running. It starts the test app, the local Auth/database adapter and a bounded webhook proxy on port 3006. It reads provider credentials from the ignored `.env.checkout-test.local`; you do not need to paste those credentials again.

## 2. Terminal 2: start the webhook tunnel

Open a second PowerShell terminal and run:

```powershell
Set-Location E:\Woff
.\internal\bin\cloudflared.exe tunnel --url http://127.0.0.1:3006 --no-autoupdate --loglevel info --metrics 127.0.0.1:3007
```

Copy the **new** `https://...trycloudflare.com` address printed in the terminal. Leave this terminal running too. The tunnel forwards only the bounded webhook proxy; it does not expose the test app or database.

## 3. Terminal 3: connect the new callback

Open a third PowerShell terminal. Replace `YOUR-NEW-ADDRESS` below with the address from Terminal 2 and keep `/api/billing/webhook` at the end:

```powershell
Set-Location E:\Woff
node .\internal\checkout-test-webhook-config.mjs "https://YOUR-NEW-ADDRESS.trycloudflare.com/api/billing/webhook"
```

This updates existing **Test webhook 140877** with the new callback, the eleven implemented events and the signing secret already saved privately. It checks the webhook's store and Test mode before updating it. A successful result includes `testMode: true` and `eventCount: 11`. You do not need to edit the webhook dashboard manually.

The callback accepts provider POST requests. Visiting the callback URL directly in a browser returns 404 by design.

## 4. Open Woff and try checkout

Open [the local fixture sign-in](http://localhost:3002/fixture-sign-in). It signs you into the fresh synthetic test account and redirects to `/checkout`. No email confirmation is needed for this fixture. Use this route rather than older fixture pages left in the ignored snapshot.

Select **Continue to secure checkout**. Confirm that Lemon Squeezy visibly says **Test mode is currently enabled**, then use its dummy card:

| Field | Test value |
| --- | --- |
| Card number | `4242 4242 4242 4242` |
| Expiration | `12/35` |
| CVC | `123` |
| Cardholder | `Woff Test` |
| Country | Bangladesh |
| Postal code | `1000` |

Use the dummy card only. After the simulated payment, use **Continue** to return to Woff. Pro appears after the signed notification updates the local account. Returning from checkout alone does not grant it. Keep Terminals 1 and 2 running until confirmation arrives; Terminal 1 reports webhook response statuses.

The provider billing portal currently refuses access because the store has not been activated. This remains separate from the working Test purchase. The fixture exercises billing against local SQL and synthetic Auth; it does not verify real email delivery or actual file storage.

## 5. Stop or restart

Press **Ctrl+C in Terminal 2**, then **Ctrl+C in Terminal 1**. Terminal 3 can close after its command finishes. The local PostgreSQL cluster stays running for reuse.

Fixture credentials last about **one hour**. For another session, stop the current test and repeat these steps. Always use the new tunnel address and update the Test webhook again. Previous provider Test subscriptions remain in Lemon Squeezy even though the disposable local account is reset.

See [the checkout setup guide](pro-checkout-setup.md) for the verified results and coverage limits.
