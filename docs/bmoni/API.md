# BMONI API — full reference (captured 2026-07-29)

Source: https://bkey.mintlify.app (llms-full) + live probing. BMONI handles KYC
end-to-end — we never build KYC, we call their onboarding endpoints.

## Base URLs & auth
- Dev/sandbox: `https://embedded-dev.bmoni.com`  ·  Prod: `https://embedded.bmoni.com`
- Header on every request: `x-api-key: <partner_api_key>`  (+ `Content-Type: application/json`)
- Paths already include `/v1` — do not append it to the base URL.
- Shared sandbox key (dev only): `pk_a025cacbf33a_76fb864113f3540909de5b1da39cc146906e35b1c6d4d1e4`

## Wallet currencies (stablecoins, NOT fiat codes)
| Fiat | Stablecoin code |
|---|---|
| USD | `USDB` |
| NGN | `CNGN` |
| CAD | `CADC` · EUR `EURe` · MXN `MXNe` · GBP `GBPe` |

Smart-wallet calls take the **stablecoin** code. Amounts are decimal strings
(e.g. `"100.00"`) except bank payouts, which use USDB **minor units** (`"100000000"`).

## ⚠️ Architecture reality (affects Kudi's flows)
BMONI is a **smart-wallet / stablecoin** platform. Every money MOVE requires:
1. a provisioned on-chain smart wallet (owner address `0x…` + owner-proof signature), and
2. **EIP-712 signatures** on proposals/payouts (client signs `messageToSign` / `eip712Payload`).

**There is NO virtual-card API.** "Wallets & Cards" in the docs are UI widgets, not an
API card product. → Kudi's **create_card is simulator-only** and must be labelled as such.

## Users
- `POST /v1/users` — create user (empty body ok; we send firstName/email/phone). Returns
  `{ user: { bmoniUserId, id, … } }`. Reuse `bmoniUserId` as `:userId` everywhere. ✅ verified live.

## Smart wallets
- `POST /v1/users/:userId/smart-wallets/owner-proof-challenges` — `{ currency, userOwnerAddress }` → `{ challengeId, messageToSign }`
- `POST /v1/users/:userId/smart-wallets/create-managed` — `{ currency, userOwnerAddress, ownerProofChallengeId, ownerProofSignature }` → `{ smartWalletId, address, chain, currency, status }`
- `GET  /v1/smart-wallets/supported-currencies`
- `GET  /v1/users/:userId/smart-wallets/:smartWalletId`
- `GET  /v1/users/:userId/smart-wallets/account/wallets`
- `GET  /v1/users/:userId/smart-wallets/account/balances`  ← **get_balance**
- `GET  /v1/users/:userId/smart-wallets/account/transactions`

## KYC / onboarding (BMONI-handled)
- `GET  /v1/users/:userId/kyc/options` · `GET …/kyc/occupations?search=`
- `POST /v1/users/:userId/kyc/documents/identification|proof-of-address|biometric` (multipart)
- `PATCH /v1/users/:userId/kyc` — profile{personalInfo, address, employment, sourceOfFunds, identificationNumbers[{type:"bvn",…}]}
- `GET  /v1/users/:userId/kyc/readiness` → `{ ready, missing[] }`
- `POST /v1/users/:userId/kyc/activate` (omit body for NGN)
- `GET  /v1/users/:userId/kyc/bvn-lookup/:bvn` · `…/nin-lookup/:nin`  (sandbox BVN `22222222222`)
- `GET  /v1/users/:userId/onboarding/status` → per-currency `{ status }`
- `POST /v1/users/:userId/onboarding/start-nigeria` — `{ bvn, ngnWalletAddress, ngnWalletIndex }`

## NGN money movement (the "transfer" path)
Kudi's "send to my brother" maps to a **bank payout / NGN offramp** to a registered account:
- `GET  /v1/users/:userId/bank-accounts/nigerian-banks` → `[{ bankId, name, code }]`
- `POST /v1/users/:userId/bank-accounts/verify-nigerian-account` — `{ accountNumber, bankCode }` → `{ accountHolderName }`
- `POST /v1/users/:userId/bank-accounts/withdrawal-accounts/nigeria` — `{ accountNumber, bankCode, bankName, accountHolderName }` → `{ id }`
- `POST /v1/users/:userId/smart-wallets/:smartWalletId/offramp/nigeria` — `{ bankAccountId, fromAmount }` → `{ data: { proposalId, status:"PENDING_APPROVALS", quote } }`
- `GET  /v1/users/:userId/smart-wallets/proposals/:proposalId/sign-payload` → `{ eip712Payload }`
- `POST /v1/users/:userId/smart-wallets/proposals/:proposalId/sign` — `{ signature }`
- `GET  /v1/users/:userId/smart-wallets/proposals/:proposalId` → `{ status }`
- Deposits: `POST /v1/users/:userId/vba/ngn` (virtual account), routing via `…/onramp/vba/nigeria`.
- Generic multi-country payout: `POST /v1/users/:userId/payouts` (amount in USDB minor units, bankDetails, returns `{ payoutId, quote, signatureRequest }`).

## Currency conversion (real — usable)
- `POST /v1/users/:userId/exchange/convert` — `{ sourceSmartWalletId, sourceCurrency, sourceAmount, targetCurrency }`
  → `{ quoteId, sourceAmount, targetAmount, exchangeRate, expiresAt }`

## Deposits (crypto / fiat VBAs)
- `GET  /v1/deposit/supported-assets` · `POST /v1/users/:userId/deposit/wallet` `{ chain, currency }`
- USD VBA: `POST …/onboarding/start-usa` `{ smartWalletId }`; `GET /v1/users/:userId/vba/usd`.

## Signatures
- `POST /v1/users/:userId/wallets/submit-signature` — `{ workflowId, signature }`

## Webhooks BMONI sends us
- `employee.linked` `{ invitationId, bmoniUserId, companyEmail, linkedAt, kycSubmitted }`
- `onboarding.completed` `{ bmoniUserId, currency, status:"active" }`

## What this means for Kudi's tools
| Kudi tool | BMONI reality |
|---|---|
| get_balance | ✅ `…/account/balances` |
| create_card | ❌ no card API — **simulator only**, must be labelled |
| send_money  | ⚠️ = NGN offramp/payout: verify → register account → offramp → **EIP-712 sign** |
| convert_currency | ✅ `…/exchange/convert` (quote → target/rate) |
| set_savings | ⚠️ no direct savings API; model as a CNGN→USDB convert/hold |

## Still to confirm from interactive docs (embedded-dev.bmoni.com/docs)
- Rate limits. Exact balances response JSON. Whether sandbox auto-approves KYC/funding.
- The owner-address keypair strategy (who holds the signing key for a managed wallet).
