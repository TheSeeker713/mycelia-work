# Packaging and auto-update

## Windows packaging

`src-tauri/tauri.conf.json` targets NSIS only (not "all", which was the
scaffold default and would also attempt an MSI). Install mode is
`currentUser`, so installing never raises a UAC prompt: this is a
personal app on Jeremy's own machine and asking for elevation to install
a time tracker would be silly.

```bash
npm run tauri build
```

produces an installer under `src-tauri/target/release/bundle/nsis/`,
plus a `.sig` file next to it when the signing key is present.

## Auto-update: how the private-repo problem got solved

The previous version of this document stopped here and explained why
auto-update couldn't be finished. Both blockers are gone now, and the
fix for the second one is worth stating plainly because it's the whole
design:

**The update feed has nothing to do with the source repo.**

The old dead end was assuming updates had to come from GitHub Releases,
which on a private repo means authenticating, which means shipping a
token inside the app. That's a worse outcome than having no auto-update
at all. Decoupling removes the problem instead of working around it:

- The **source stays private**, on GitHub, exactly as now.
- Exactly **two files go public**: the installer and `latest.json`.
- They live in a **Cloudflare R2 bucket** behind a custom domain, with
  no credentials required to read them.
- Nothing in either file references the private repo, and the app
  carries no token of any kind.

A draft GitHub release is still created per tag as an internal record of
what was built. The app never looks at it.

### Why a custom domain and not r2.dev

R2 will happily serve a bucket from a `*.r2.dev` subdomain, and it's one
checkbox. Cloudflare documents it as being for non-production use with
strict rate limits, and renamed it "Public Development URL" in May 2025
to make that harder to miss. An update feed is production by definition,
so it goes behind a real domain.

## What's already built

- Signing keypair generated. Public key is in `tauri.conf.json` under
  `plugins.updater.pubkey`.
- `tauri-plugin-updater` and `tauri-plugin-process` registered in
  `lib.rs`, with `updater:default` and `process:allow-restart` in the
  capabilities file.
- `src/services/updater.ts`: check and install, failing soft. An
  unreachable feed reads as "couldn't check", never an error.
- `src/components/UpdateCheck.tsx`: a manual check in Settings. Not
  automatic on launch, deliberately. The app already opens with a
  startup checklist and adding a silent network call plus a possible
  "restart now?" to that moment works against a tool meant to get out of
  the way.
- `.github/workflows/release.yml`: builds on a `v*` tag, runs the same
  three gates used locally, assembles `latest.json` from the real build
  output, and uploads both files to R2.

## What Jeremy has to do once

None of this is code, which is why it isn't done.

**1. Create the bucket and put it behind a domain.**
In the Cloudflare dashboard: R2 → create a bucket → Settings → Custom
Domains → Add, and point it at a subdomain of a domain already on the
account (`updates.<yourdomain>` is the obvious choice). Do not use the
r2.dev URL, for the reason above.

**2. Set the base URL in two places, and make them agree.**

- `plugins.updater.endpoints[0]` in `tauri.conf.json` currently reads
  `https://updates.myceliainteractive.com/mycelia-time/latest.json`.
  That domain is a **placeholder I guessed** from the company name. If
  it isn't right, this is the string to change, and it must be changed
  before cutting a release, since it gets compiled into the binary.
- A repository **variable** named `UPDATE_BASE_URL`, set to the same
  origin without the path (`https://updates.<yourdomain>`). The workflow
  builds download URLs from it and fails loudly if it's missing.

**3. Add the repository secrets.**

| Secret | What it is |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `C:\Users\jroba\.tauri\mycelia-time.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Empty. The key was generated without one. |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | From an R2 API token |
| `R2_SECRET_ACCESS_KEY` | From the same token |
| `R2_BUCKET` | Bucket name |

**4. Keep the private key.** It lives at
`C:\Users\jroba\.tauri\mycelia-time.key` and is not in this repo and
must never be. It has no password, so the file itself is the whole
secret. Losing it means no existing install can ever be updated again,
because they all verify against the public key already baked into them.
Back it up somewhere that isn't this machine.

## Cutting a release

```bash
npm version patch --no-git-tag-version
```

then update `src-tauri/tauri.conf.json`'s `version` to match, commit,
and tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The workflow does the rest. The version in `tauri.conf.json` is what
ends up in `latest.json`, and an installed copy compares against it, so
a tag that disagrees with the config will produce a feed that either
never offers an update or offers one forever.
