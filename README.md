# Publisher CLI

CLI for managing app versions, release channels, builds, and update manifests.

## Install

```bash
npm install -g publisher-cli
```

or from this repo:

```bash
npm install -g github:SpacerunApp/publisher-cli
```

Binary: `publisher`

## What this manages

- Version records per channel (`stable`, `beta`, `alpha`)
- Build records per platform/arch/type
- Version manifest: `archive/releases/{channel}/{version}/manifest.json`
- Channel manifest: `archive/channels/{channel}/manifest.json`

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
