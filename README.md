# Publisher CLI

CLI for managing app versions, release channels, builds, and update manifests.

## Install

**Linux/macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/Nika0000/publisher-cli/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/Nika0000/publisher-cli/main/install.ps1 | iex
```

**Install a specific version:**

```bash
curl -fsSL https://raw.githubusercontent.com/Nika0000/publisher-cli/main/install.sh | bash -s 2026.5.17
```

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Nika0000/publisher-cli/main/install.ps1))) "2026.5.17"
```

Or download binaries directly from the [latest release](https://github.com/Nika0000/publisher-cli/releases/latest).

Binary: `publisher`

## Interactive mode

Run `publisher` (no args) or `publisher chat` to enter an interactive REPL:

```
❯ [stable] version:list --limit 5
❯ [stable] /channel beta
❯ [beta]   publish 1.2.0
❯ [beta]   /help
❯ [beta]   /exit
```

Slash commands:

- `/help` — list slash and publisher commands
- `/channel <stable|beta|alpha>` — set the active channel context (auto-applied as `--channel` to commands that don't pass one)
- `/setup` — interactively configure Supabase credentials (URL, anon key, publisher key, optional CDN). Secret values are masked. Runs automatically on first launch when no credentials are found.
- `/clear` — clear the screen
- `/exit` — leave interactive mode (also Ctrl+D)

Press `Tab` for command completion (slash commands, publisher commands, `--flags`, and channel values after `/channel` or `--channel`). As you type, the best matching command is shown as **ghost text** after the cursor — press `Tab` to accept it. If you type a command name that isn't recognized, the REPL shows a **"Did you mean…"** suggestion list (e.g. typing `build` suggests `build:create, build:delete, build:list, build:upload`; typing `list` suggests `build:list, version:list`).

All regular `publisher` subcommands work inside the REPL without the `publisher` prefix.

## What this manages

- Version records per channel (`stable`, `beta`, `alpha`)
- Build records per platform/arch/type
- Version manifest: `archive/releases/{channel}/{version}/manifest.xml`
- Channel manifest: `archive/channels/{channel}/manifest.xml`

Manifests are XML (schema version 2). See `manifest.xsd` for the schema and `manifest.example.xml` for a complete example.

## Setup

Required env:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `APP_PUBLISHER_KEY`

Optional:

- `CDN_URL` (auto-derived from `SUPABASE_URL` if omitted)

### Generate APP_PUBLISHER_KEY

```js
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your-supabase-jwt-secret';

const token = jwt.sign({ role: 'app_publisher' }, JWT_SECRET, {
  expiresIn: '365d'
});

console.log(token);
```

## Typical flow

Create version:

```bash
publisher version:create 1.2.0 --channel stable --notes "Release notes"
```

Upload or register builds:

```bash
publisher build:upload 1.2.0 ./spacerun-1.2.0-arm64-macos.dmg --channel stable
publisher build:create 1.2.0 ios arm64 installer "https://testflight.apple.com/join/ABC123" --channel stable --distribution store
```

Publish and generate manifests:

```bash
publisher publish 1.2.0 --channel stable
```

## Useful commands

```bash
publisher version:list --channel stable
publisher build:list 1.2.0 --channel stable
publisher update:check 1.1.0 macos arm64 --channel stable --device-id my-device-1
```

## Migrations

Run in order:

1. `migration/0001_initial.sql`
2. `migration/0002_release_channels.sql`
3. `migration/0003_multi_distribution_builds.sql`

Optional seed data:

4. `migration/9000_seed_test_scenarios.sql`
