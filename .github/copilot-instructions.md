# Copilot Instructions for `publisher-cli`

## Build, test, and lint commands

```bash
npm ci
npm run build
```

- `npm run dev -- <publisher args>` runs the CLI directly from TypeScript via `tsx src/index.ts`
- `npm run start -- <publisher args>` runs the compiled CLI from `dist/index.js`
- Packaging commands build executables after TypeScript compilation:
  - `npm run pkg:macos-arm64`
  - `npm run pkg:macos-x64`
  - `npm run pkg:linux-x64`
  - `npm run pkg:win-x64`
  - `npm run pkg:all`
- There is currently **no** `npm test` or `npm run lint` script, and the repository does not contain a wired test suite, so there is no single-test command to run.

## High-level architecture

- `src/index.ts` is the only CLI entrypoint. It loads `.env`, then merges credentials from environment variables with `~/.spacerun-archive/config.json`, and creates a Supabase client pinned to the `publisher` schema with the `APP_PUBLISHER_KEY` bearer token. Running with no args (TTY) or with `chat`/`interactive` launches the REPL in `src/repl.ts`.
- Command modules are split by responsibility:
  - `src/commands/version.ts` manages version records, publish policy fields, and deletion/regeneration behavior.
  - `src/commands/build.ts` handles upload/create/list/delete for build records plus archive bucket uploads.
  - `src/commands/publish.ts` assembles version manifests and channel manifests and can copy fallback builds from older versions in the same channel.
  - `src/commands/update.ts` evaluates update eligibility the way a client would: semver ordering, rollout windows, device bucketing, prerelease gating, and compatible build availability.
  - `src/commands/config.ts` is intentionally the only area that works without validated Supabase credentials.
- `src/repl.ts` re-uses the same commander program for execution. It overrides `process.exit` per-command so action handlers calling `process.exit(1)` don't kill the REPL, serializes line handling so concurrent input can't interleave overrides, and auto-injects `--channel` from the active channel context when the user doesn't pass one. The readline `completer` suggests slash commands, publisher commands, `--flags`, and channel values. When credentials are missing, the REPL launches `runSetupWizard()` from `src/setup.ts` (masked secret prompts via a custom muted Writable) and then calls `reinitSupabase()` exported from `src/index.ts` to hot-swap the client without re-exec. UI primitives (banner, panel, themed log helpers) live in `src/ui/`.
- Shared rules live in `src/utils/versioning.ts`: supported OS/arch/build types/channels/distributions, semver helpers, rollout policy normalization, and the metadata/column reconciliation for update policy.
- Supabase schema and storage expectations come from `migration/*.sql`:
  - version data lives in `publisher.versions`
  - build data lives in `publisher.builds`
  - uploaded artifacts and generated manifests live in the public `archive` storage bucket
- Manifest generation is a first-class output of the CLI, not just a side effect. Manifests are XML (schema version 2). Version manifests are written to `archive/{storage_key_prefix}/manifest.xml`; channel manifests are written to `archive/channels/{channel}/manifest.xml`. Serialization lives in `src/utils/manifest.ts` (uses `fast-xml-parser`); see `manifest.xsd` and `manifest.example.xml`.

## Key conventions

- Always treat release channel as part of identity. Versions are unique by `(version_name, release_channel)`, not by version alone.
- Always treat build distribution and variant as part of identity. Builds are unique by `(version_id, os, arch, type, distribution, variant)`.
- Use the helpers in `src/utils/versioning.ts` instead of duplicating semver/channel/rollout validation logic. The project stores update policy both in dedicated columns and in `metadata.updatePolicy`, and the helpers are the canonical way to reconcile them.
- `storage_key_prefix` should stay deterministic: `releases/{channel}/{version}` unless there is a very deliberate migration reason to diverge.
- `build:upload` expects filenames like `spacerun-{version}-{arch}-{os}.{ext}` and infers `os`, `arch`, and `type` from that pattern when flags are omitted.
- Variant handling is intentionally compact in manifests: if an architecture only has the `default` variant, `publish.ts` collapses the variant layer and writes build types directly under the arch key.
- Source preference is opinionated:
  - channel/latest manifests choose versions by semantic version order, not `created_at`
  - manifest build sources prefer `store` over `direct`
  - update checks prefer `patch` over `installer` for the selected target build
- Publishing and deletion have cross-version side effects. Published versions/builds may force manifest regeneration, and fallback builds are tracked through `platform_metadata.fallback_from`.
- Keep `dist/` in sync with `src/` for changes that affect runtime behavior. The release workflow builds from TypeScript, packages platform executables, and commits `package.json`, `package-lock.json`, and `dist` back to `main`.
