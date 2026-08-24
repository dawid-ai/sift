# Code signing: options, costs, and what changes

**Status: nothing has been changed.** This document exists so you can pick a route.
The build is still unsigned and `verifyUpdateCodeSignature` is still `false`.

Everything below was checked on 2026-08-24. Prices move and eligibility rules move faster —
confirm both at purchase time.

## What signing actually buys you

Signing binds your verified legal identity to the installer and proves it hasn't been
modified since. It does **not** buy a clean first-run experience by itself.

Since 2024, Microsoft SmartScreen no longer grants instant reputation to Extended
Validation (EV) certificates. Reputation is earned per publisher identity, through
download volume and clean telemetry, for OV and EV alike. Paying the EV premium to skip
SmartScreen no longer works; several vendors document warnings on freshly signed EV
builds. In March 2026 Microsoft migrated customers onto new intermediate CAs and even
established publishers saw warnings return.

So the realistic outcome of signing:

- The prompt changes from "unknown publisher" to your name. That alone is most of the
  perceived trust win, and it is what users screenshot when they complain.
- The "Run anyway" warning may still appear for the first few hundred downloads.
- Every certificate rotation risks resetting reputation.
- Auto-update signature verification becomes possible (see the last section).

If the goal is only "stop the scary dialog on day one", signing does not deliver that.
If the goal is "be a named publisher and let reputation accumulate", it does.

## The constraint that kills the current wiring

`electron-builder.yml` and `release.yml` are wired for `CSC_LINK` + `CSC_KEY_PASSWORD`,
which means a `.pfx` file holding certificate and private key. Since June 2023 the
CA/Browser Forum baseline requirements forbid that for publicly trusted code signing: the
private key must be generated on and never leave a FIPS 140-2 Level 2 / Common Criteria
EAL 4+ hardware module. No compliant CA issues an exportable `.pfx` today.

That means **every route below changes the build config.** The existing env-var wiring
only still works for a certificate issued before mid-2023.

Second deadline: from 2026-02-27 a single code signing certificate is valid for at most
459 days, so multi-year purchases are reissues, not one long certificate. Budget for a
renewal roughly every 15 months whichever route you take.

## The four routes

| Route                     | Cost per year            | Key storage               | Blocks to check first                                             |
| ------------------------- | ------------------------ | ------------------------- | ----------------------------------------------------------------- |
| SignPath Foundation (OSS) | free                     | their HSM                 | project must be fully OSI-licensed, released, maintained          |
| Certum Open Source        | ~€69 first, ~€29 renewal | smartcard or their cloud  | individuals only; certificate says "Open Source Developer"        |
| Azure Artifact Signing    | ~$120                    | Microsoft-managed         | individuals US/Canada only; organizations need 3 years of history |
| Commercial OV certificate | ~$219–$660               | USB token or your own HSM | token shipping; signing needs the token plugged in                |

### 1. SignPath Foundation — free, and the best fit on paper

SignPath Foundation issues OV-level certificates to qualifying open-source projects at no
cost. The private key lives on their HSM; you never handle it. Signing runs as a step in
your CI pipeline, with a documented GitHub Actions integration.

Conditions, all of which Sift appears to meet: an OSI-approved license for every component
(MIT), no proprietary or commercially dual-licensed parts, no malware or bundled unwanted
software, a public repository, active maintenance, and an existing release in the form to
be signed.

Disadvantages: an application and review, and a permanent dependency on a third party's
pipeline for releases. The signature identifies the project, not you personally.

Apply at [signpath.org](https://signpath.org/); the open-source conditions are at
[signpath.org/terms.html](https://signpath.org/terms.html).

### 2. Certum Open Source — cheapest paid route, EU-friendly

Certum (Poland) sells a discounted Open Source Code Signing certificate to individual
developers. Reported pricing is about €69 for the first set including the cryptographic
card and reader, and about €29 per renewal once you own the hardware. Resellers list it
between $50 and $120 depending on the bundle. Certum's SimplySign cloud option removes the
physical card, which is what you want for CI.

The catch is the certificate subject: the Organization field reads "Open Source
Developer", and the Common Name carries your name plus that phrase. It is a real publicly
trusted OV certificate and it removes "unknown publisher", but the displayed publisher is
not a company name.

Verification: government ID plus supporting documents, handled by Certum.

### 3. Azure Artifact Signing — likely blocked, check before spending time

Microsoft's managed signing service, renamed from Trusted Signing to **Azure Artifact
Signing** in 2026. $9.99/month Basic (5,000 signatures per month), $99.99/month Premium
(100,000), $0.005 per signature over. Microsoft holds the key; certificates are short-lived
and rotate automatically, which sidesteps both the HSM problem and renewals.

Two eligibility gates, and one of them probably applies to you:

- **Individual developers must be located in the United States or Canada.** No exception is
  documented. Poland does not qualify for individual validation, despite Poland Central
  being a supported Azure _region_ for the service — region availability and identity
  eligibility are separate things.
- **Organizations** are eligible in the EU, UK, US, Canada, Australia, New Zealand, Japan,
  South Korea, Singapore, Switzerland, Norway, and Israel, but need at least three years of
  verifiable operating history through business registration, tax records, or D-U-N-S.

This route opens only if you sign as a registered business with three or more years of
history. If dawid.ai has that, it becomes the recommended paid route on cost and
maintenance alone.

Identity validation runs in the Azure portal only, takes 1 to 20 business days, and for
individuals uses AU10TIX plus Microsoft Authenticator Verified ID (email PIN, phone, ID
document scanned by camera). Individual details are pulled read-only from the Azure billing
account, so that account's legal name and address must already match exactly what you want
on the certificate. Organizations need a monitored email address on the company domain, a
second address on the same domain, a business identifier, and the registered address.

### 4. Commercial OV certificate — the fallback

Sectigo and Comodo OV run about $219/year through resellers; DigiCert lists $539 plus $120
for their hardware token. EV runs roughly $300–$700 and, as covered earlier, no longer buys
the SmartScreen behavior it used to.

You get a USB token in the post, or you provision your own cloud HSM and have the CA verify
it. Signing then requires the token present on the signing machine, which means either a
self-hosted CI runner with the token attached, a cloud HSM, or a manual signing step
outside CI. That consequence is the real cost of this route, not the certificate price.

Verification is standard OV: business registration or personal identity documents, address,
and a verifiable phone listing.

## Recommendation

1. Apply to SignPath Foundation. It costs nothing, fits an MIT-licensed Electron app
   precisely, and if accepted the other three routes stop mattering.
2. If SignPath declines or takes too long, and dawid.ai is a registered business with three
   years of history, use Azure Artifact Signing.
3. Otherwise buy the Certum Open Source certificate with SimplySign cloud signing. €29 per
   renewal and a working CI path beats a $219 certificate that needs a USB stick.

Do not buy EV. It costs more and no longer does the one thing it was bought for.

## What changes in this repo, per route

None of this is applied. Each block is what the change would be.

**Common to all routes:** `apps/desktop/electron-builder.yml` is on electron-builder
`^26.15.3`, which uses `win.signtoolOptions.*` and `win.azureSignOptions.*`. The current
`CSC_LINK` / `CSC_KEY_PASSWORD` wiring still works for a `.pfx` path, but no new
certificate can be delivered that way.

**SignPath:** signing moves out of electron-builder and into a post-build CI step that
uploads the artifact to SignPath and downloads the signed result. `release.yml` gains their
action between `dist` and the release upload. `electron-builder.yml` stays unsigned, and
`verifyUpdateCodeSignature` has to stay `false` unless you also record the publisher name
manually in `app-update.yml`.

**Certum with SimplySign:** the cloud service exposes the key to `signtool` through a
PKCS#11 provider, so `win.signtoolOptions.certificateSubjectName` (or `certificateSha1`)
selects it from the Windows certificate store. `certificateFile` is not used. This needs a
Windows runner with Certum's SimplySign desktop client installed and authenticated, which
GitHub-hosted runners cannot do — expect a self-hosted runner or local release builds.

**Azure Artifact Signing:**

```yaml
win:
  azureSignOptions:
    endpoint: https://plc.codesigning.azure.net # match your account's region
    codeSigningAccountName: <account>
    certificateProfileName: <profile>
    publisherName: <exact certificate subject>
  verifyUpdateCodeSignature: true
```

with `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` added to `release.yml`
as secrets, replacing `CSC_LINK` / `CSC_KEY_PASSWORD`.

Gotcha for this version: electron-builder 26 signs by shelling out to PowerShell, running
`Install-Module -Name TrustedSigning` from the PSGallery on every build. That needs the
NuGet provider present on the runner, and it has broken on GitHub Actions before. Budget a
build or two for it. Version 27 replaces this with the `signtool /dlib` path.

**Commercial OV:** the same `signtoolOptions.certificateSubjectName` approach as Certum,
plus the token attached to whichever machine builds.

## What re-enabling update signature verification changes

`win.verifyUpdateCodeSignature` defaults to `true` in electron-builder. It is `false` here
for a build reason, not a security decision: with it on, electron-builder pulls the
`winCodeSign` tool bundle, whose archive contains macOS dylibs stored as symlinks, and
extracting those on Windows needs Developer Mode or admin. It fails otherwise with "Cannot
create symbolic link". The flag is documented in `electron-builder.yml` and
`docs/DEVELOPMENT.md`.

With it on and a real certificate in place:

- electron-builder writes `publisherName` into `app-update.yml`.
- Before running a downloaded update, electron-updater checks the installer's Authenticode
  publisher against that name and refuses to install on a mismatch.

What that adds: today the update chain trusts the SHA-512 digest in `latest.yml`, served
over TLS from GitHub Releases. That is decent, but the feed is the whole trust root — an
attacker who can publish to the release, or who compromises the account, controls both the
binary and the hash that vouches for it. Publisher verification moves the trust root to the
certificate, which lives outside GitHub.

**The trap: certificate rotation breaks auto-update.** If the publisher subject changes at
renewal, every installed copy refuses the update and users are stuck on the old version
with no error they can act on. Mitigations:

- `signtoolOptions.publisherName` accepts an array. List the old and new subject names
  across a rotation, then drop the old one a release later. `azureSignOptions.publisherName`
  in version 26 is a single string, so the Azure route has no such escape hatch — one more
  reason to confirm what Artifact Signing puts in the subject before committing.
- Given the 459-day validity ceiling, this comes up roughly annually. Write it into the
  release runbook, not into your memory.

Do not turn this flag on before signing works end to end. An unsigned build with
verification on either fails to build or ships an updater that rejects every update.

## What is needed from you

1. Whether dawid.ai is a registered business, and if so how long it has existed. That
   single answer decides between routes 2 and 3.
2. A go-ahead to apply to SignPath Foundation, which is free but puts the project through a
   third-party review.
3. Whether release builds may move to a self-hosted runner or a local machine, which is what
   the Certum and commercial routes require.

## Sources

- [Quickstart: Set up Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) — eligibility, regions, validation steps
- [Trusted Signing pricing](https://azure.microsoft.com/en-in/pricing/details/trusted-signing/)
- [SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [EV certs do not grant immediate reputation anymore](https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore)
- [Code signing options for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [SignPath Foundation conditions for open-source projects](https://signpath.org/terms.html)
- [Certum code signing shop](https://shop.certum.eu/code-signing.html) and a [first-hand write-up of the open-source certificate](https://piers.rocks/2025/10/30/certum-open-source-code-sign.html)
- [New code signing changes: delivery modes, HSM](https://certera.com/blog/new-code-signing-changes-delivery-modes-hsm-and-installation-guide/)
- [electron-builder Windows code signing](https://www.electron.build/docs/features/code-signing/code-signing-win/)
