# Proofolio

A portfolio for your work, with independently checkable credentials. Built with React, TypeScript, ethers, and a small Solidity registry. Warm paper, electric blue, a little lime, and a fingerprint for every claim.

The starter portfolio and its credentials are fictional examples. Nothing ships preverified. There is no deployed registry, account service, or public hosting. The interface works without a wallet; blockchain actions become available after you configure a trusted registry.

## Run the portfolio

Use Node.js 24 or newer and npm. Node.js 26 was used during development.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The default is `http://127.0.0.1:5173`.

- Edit the profile, add or update projects, and filter or search the work. Remove starter entries from their detail dialogs; local removals offer Undo.
- Create credential drafts with issuer and recipient wallet addresses.
- Open a credential to inspect its canonical fingerprint, evidence, dates, and on-chain status.
- Use settings to export your JSON backup, or review and confirm a replacement import.
- Preview the portfolio without editor controls. This is a local preview, not a published URL.
- Local activity records edits and confirmed transactions. It is a convenience log, not an audit trail.

Content and trusted registry settings stay in this browser's local storage. Export before clearing site data, changing devices, or importing a replacement portfolio. No server receives portfolio content. Opening evidence links or connecting a wallet contacts the corresponding service; proof checks contact the configured RPC endpoint.

## Try real proof locally

The development chain uses public test accounts and binds only to `127.0.0.1`. Do not expose it to a network, send it real assets, or reuse its test mnemonic in a real wallet. The chain resets when restarted.

In one terminal:

```sh
npm run chain
```

In another terminal:

```sh
npm run deploy:local
```

Deployment refuses any chain ID other than 31337 and uses the first unlocked local test account. It prints the registry and administrator addresses. It does not write credentials or secrets to disk. The administrator is initially an authorized issuer.

In Proofolio settings, save the printed contract address with network `Local development · 31337` and endpoint `http://127.0.0.1:8545`.

Configure a development-only Ethereum browser wallet with:

| Setting         | Value                   |
| --------------- | ----------------------- |
| Network name    | Proofolio Local         |
| RPC URL         | `http://127.0.0.1:8545` |
| Chain ID        | `31337`                 |
| Currency symbol | `ETH`                   |

The chain uses the public development mnemonic `test test test test test test test test test test test junk`. Import it **only into a separate test wallet**. This is not a secret and must never hold real funds. The first account is the registry administrator and initial authorized issuer. Wallet software may require enabling local/test networks.

1. Connect that issuer wallet in Proofolio.
2. Create a credential draft. Set its issuer address to the connected account and its recipient address to the intended holder. Display names are self-described. The issue date is an issuer assertion, separate from the registry's actual block timestamp.
3. Open the draft and choose **Issue on-chain**. Review and confirm the transaction in the wallet. A successful receipt anchors the fingerprint, subject, issuer, and optional expiration.
4. Choose **Check live proof**. This reads the current registry without asking the wallet to sign anything.
5. The administrator can add or remove issuer access in settings. Removing authorization stops future issuance. It does not invalidate existing records.
6. The original issuer can permanently revoke its own credential, including after losing authorization. Revocation asks for confirmation and requires a wallet transaction.

A new draft uses a random UUID. Credential content is immutable once issued. To correct content, create a fresh draft and revoke the old credential if appropriate. Duplicate issuance of an existing fingerprint is rejected.

`npm run deploy:local` does not deploy to Sepolia or mainnet. The interface can read and transact with a separately deployed copy of this contract on Sepolia, chain ID 11155111, after you explicitly save its trusted address and RPC endpoint. No live-chain deployment was performed for this project. Mainnet is unsupported.

Optional build-time defaults live in `.env.example`. Copy it to `.env.local` and fill in a registry address if desired. `VITE_` values are public browser configuration. Never put secret keys or secret RPC credentials there. Local settings override build-time defaults.

## What “verified” means

A successful check means that the exact canonical payload fingerprint is recorded at the configured registry, its issuer and subject addresses and expiration match, it is not revoked, and it has not expired at the latest checked block. The contract checks issuer authorization when issuance happens. Subsequent issuer deauthorization does not erase history.

It does **not** prove the claim is true, that an issuer's display name belongs to a real institution, or that the displayed portfolio owner controls the recipient wallet. A trusted registry can still authorize an untrustworthy issuer. Choose the registry and RPC provider yourself; the app does not audit their integrity or pin their deployed bytecode.

Verification results live only in memory and never establish trust after import or reload. Wallet network/account changes and trusted registry changes invalidate current checks. Reads have an eight-second HTTP request timeout and fail with an unavailable state. An imported credential cannot change your trusted registry settings. An imported verification status is ignored.

No name, title, biography, description, or evidence link is sent to the contract. Addresses, fingerprints, timestamps, and revocations are public. Public hashes are not encryption; a random ID reduces predictable guessing for newly created drafts but does not make content confidential. The starter examples use fixed IDs for reproducibility. Exported JSON includes full credential content and evidence links. Do not attach sensitive personal documents to a public evidence URL.

Expiration is interpreted as the end of the selected UTC date. Verification uses the current chain block timestamp. A transaction hash is supporting metadata, not proof by itself. The app checks registry state even if a transaction hash is missing.

## Validate

```sh
npm test
npm run test:contracts
npm run build
npm run preview
```

Tests compile the actual Solidity source for the Paris EVM and run the lifecycle against a temporary local chain. They cover unauthorized issuance, administrator-only permissions, duplicate prevention, original-issuer revocation after deauthorization, tampering, subject/expiry mismatch, expiration, malformed imports, URL safety, and canonical fingerprint stability. Tests do not deploy to a public network. GitHub Actions runs tests and a production build on Node.js 24.

The local chain uses JavaScript fallbacks when its optional native modules do not match the Node.js version. Those messages do not indicate a failed chain. The browser production bundle contains neither the local-chain implementation nor the Solidity compiler. Compatible dependency overrides remove the old local-chain package’s high and critical advisories. The full development tree still reports low-severity legacy cryptography advisories; the production dependency audit reports none. Use development wallets only.

## Structure

- `src/domain.ts` owns the versioned portfolio, credential payload, strict import boundaries, canonical serialization, and fingerprint.
- `src/blockchain.ts` owns read-only verification, the wallet boundary, trusted-chain checks, issuance, revocation, and issuer authorization.
- `src/App.tsx` owns browser persistence and the editing, preview, import, and proof-inspection flows.
- `contracts/CredentialRegistry.sol` owns the issuer allowlist and immutable issuance records with permanent revocation.
- `scripts/` contains the local chain, compilation, and deployment tools.
- `tests/` checks public behavior with the actual contract and current registry reads.

Canonical payloads use an explicit fixed field order, UTF-8 JSON, checksummed addresses, and Keccak-256. Changing any field creates a different fingerprint. Chain ID and registry address travel in the envelope and must match separately trusted configuration. This serialization is specific to version 1; other issuers must reproduce it exactly.

There is no document upload, real institution integration, hosted profile, decentralized content storage, recovery service, token, or payment flow. This is an MVP for portfolio editing and test-network credential lifecycles. The contract has not received an external security audit.

## License

MIT. Copyright 2026 Alejandro.
