# SignPath Trusted GitHub Build Signing Design

## Goal

Make Windows release signing compatible with the `release-signing` policy, which requires SignPath's GitHub.com Trusted Build System and origin verification. No signing request may upload a local file directly to the SignPath API.

## Root cause

The Electron Builder hook currently calls `Submit-SigningRequest -InputArtifactPath`. SignPath receives the API token but no verifiable GitHub Actions artifact identity, so the trusted-build policy rejects the request with HTTP 403. The existing outer-installer signing stage already uses the correct GitHub Artifact connector flow.

## Build flow

1. Compile the Electron main, fork, renderer, and language assets once.
2. Build an unsigned Windows app directory and a disposable portable target. The portable target ensures Electron Builder places `resources/elevate.exe` in the app directory before signing.
3. Copy only unsigned PE files (`.exe`, `.dll`, `.node`) from `release/win-unpacked` into a path-preserving staging directory. Skip non-PE files and files with an already-valid Authenticode signature.
4. Upload that directory with `actions/upload-artifact` and sign it through `signpath/github-action-submit-signing-request@v2`, using the `windows-app` artifact configuration.
5. Validate every returned PE signature and overlay the signed files onto `release/win-unpacked`.
6. Run Electron Builder with `prepackaged=release/win-unpacked` to create NSIS and portable artifacts without rebuilding or editing the signed application payload. Set `nsis.packElevateHelper=false`; for portable packaging, use the supported `portable.useZip=true` path, which bypasses Electron Builder's app-package helper and therefore does not copy over the signed elevate helper.
7. Upload the unsigned outer setup/portable executables and sign them through the same trusted GitHub connector using `windows-installer`.

## Code boundaries

- `scripts/app-builder.ts` owns the normal, Windows app-stage, and Windows installer-stage build modes.
- `scripts/windows-signpath-bundle.ps1` owns PE selection, signature validation, staging, and applying the signed result.
- `.github/workflows/windows-version-build.yml` owns GitHub Artifact upload and both official SignPath Action calls.
- `configs/electron-builder.win.ts` keeps only local Electron packaging hooks; it no longer submits signing requests.

## Failure handling

- Missing prepackaged directories, empty PE bundles, invalid returned signatures, or missing destination files fail the workflow immediately.
- Signing requests use the release policy and wait for approval/completion.
- Existing valid third-party signatures are preserved rather than replaced.
- Local builds remain unsigned and do not require a SignPath token.

## Verification

- A source-level regression test checks that no direct SignPath PowerShell submission remains.
- The test checks the two-stage app-builder contract and both trusted GitHub Action calls.
- The PowerShell script is parsed when PowerShell is available; formatting, TypeScript checks, and workflow structural checks run locally without a full Electron build.

## Known boundary

The official GitHub connector can sign files that exist as GitHub workflow artifacts. Electron Builder's transient NSIS uninstaller is generated and embedded inside the packaging call, so it is not independently submitted. The release-signed outer installer and the complete installed application payload are covered by the trusted workflow.
