# Packaging and auto-update

## What's built

**Windows packaging is configured and works.** `src-tauri/tauri.conf.json`
targets NSIS only (not "all", which was the scaffold default and would
also attempt an MSI). Install mode is `currentUser`, so installing never
raises a UAC prompt: this is a personal app on Jeremy's own machine and
asking for elevation to install a time tracker would be silly.

```bash
npm run tauri build
```

produces an installer under `src-tauri/target/release/bundle/nsis/`.

**CI exists now.** `.github/workflows/release.yml` builds on a `v*` tag
(or manual dispatch), runs the same three gates used locally —
typecheck, frontend tests, Rust tests — and publishes a draft release.
Draft rather than published, so a bad build can be deleted rather than
un-announced. Before this the repo had no `.github` directory at all.

## What's deliberately not built: auto-update

The plan doc recommended GitHub Releases plus `tauri-plugin-updater`,
and that's still the right shape. Two things stop it from being
finishable without Jeremy, and neither is a coding problem.

**1. It needs a signing keypair.** `tauri signer generate` produces a
private key that has to stay secret and a public key that goes in
`tauri.conf.json`. Generating a long-lived credential on someone's
behalf and deciding where it lives is not a call to make unasked. The
workflow already reads `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from repository secrets, so the
moment those exist the signed path starts working with no further code
changes.

**2. The repo is private.** The updater fetches a manifest and the
installer over plain HTTP with no credentials. On a private repo those
URLs need authentication, which would mean shipping a token inside the
app — worse than having no auto-update. Real options, all Jeremy's call:

- Make releases public while the source stays private (GitHub doesn't
  support this directly; it needs a separate public repo holding only
  release artifacts).
- Self-host the manifest and binaries somewhere without auth.
- Skip auto-update entirely and reinstall from a built installer when
  there's something worth updating to.

For a private, single-user, single-machine app, the third option is
genuinely reasonable and costs nothing to choose. That's why this
stopped here rather than guessing.

## To finish it later

1. `npm run tauri signer generate -- -w ~/.tauri/mycelia.key`
2. Put the public key in `tauri.conf.json` under
   `plugins.updater.pubkey`, and add the `endpoints` array.
3. Add `tauri-plugin-updater` to `Cargo.toml` and register it in
   `lib.rs` alongside the other plugins.
4. Add the private key and its password as repository secrets under the
   names the workflow already expects.
5. Resolve the private-repo access question above, since none of the
   preceding steps matter until an unauthenticated client can actually
   reach the manifest.
