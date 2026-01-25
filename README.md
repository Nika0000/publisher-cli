# Spacerun Archive CLI

[![Release](https://img.shields.io/github/v/release/SpacerunApp/deployment?filter=cli-*&label=CLI&logo=github)](https://github.com/SpacerunApp/publisher-cli/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

CLI tool to manage Spacerun app versions, builds, and auto-update manifests.

### Credentials

**Get your Supabase credentials:**
1. Go to your Supabase project settings
2. Copy the **Project URL** → `SUPABASE_URL`
3. Copy the **anon public** key → `SUPABASE_ANON_KEY`
4. Generate **APP_PUBLISHER_KEY** (see below)

**Generate APP_PUBLISHER_KEY:**

```js
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your-supabase-jwt-secret';

const token = jwt.sign({ role: 'app_publisher' }, JWT_SECRET, {
  expiresIn: '365d'
});

console.log(token);
```

## Usage

### Create a new version

Versions must follow [semantic versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

```bash
npm run dev -- version:create 1.0.0 \
  --notes "Initial release" \
  --changelog "First stable version" \
  --mandatory

# Also supports pre-release versions
npm run dev -- version:create 1.0.0-beta.1 --notes "Beta release"
npm run dev -- version:create 2.1.0-alpha.3 --notes "Alpha release"
```

### List versions

```bash
# Show first 20 versions (default)
npm run dev -- version:list

# Show published versions only
npm run dev -- version:list --published

# Pagination (useful for 100+ versions)
npm run dev -- version:list --limit 50 --offset 0
npm run dev -- version:list --limit 50 --offset 50  # Next page
```

### Upload builds

Upload builds using the standard naming convention:
```
spacerun-{version}-{arch}-{os}.{ext}
```

Or specify manually:
```bash
npm run dev -- build:upload 1.0.0 ./my-custom-build.zip \
  --os macos \
  --arch arm64 \
  --type patch
```

### Create external build references

For platforms like iOS/Android that use external distribution (App Store, TestFlight, Play Store), create build records without uploading files:

```bash
# iOS TestFlight
npm run dev -- build:create 1.0.0 ios arm64 installer \
  "https://testflight.apple.com/join/ABC123" \
  --package-name "Spacerun iOS 1.0.0" \
  --size 52428800

# iOS App Store
npm run dev -- build:create 1.0.0 ios arm64 installer \
  "https://apps.apple.com/app/spacerun/id123456789"

# Android Play Store
npm run dev -- build:create 1.0.0 android arm64 installer \
  "https://play.google.com/store/apps/details?id=com.spacerun.app"

# With checksums (if available)
npm run dev -- build:create 1.0.0 ios arm64 installer \
  "https://testflight.apple.com/join/ABC123" \
  --size 52428800 \
  --sha256 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" \
  --package-name "Spacerun iOS 1.0.0 TestFlight"
```

**When to use `build:create`:**
- iOS apps distributed via TestFlight or App Store
- Android apps on Google Play Store
- External hosting services
- Beta distribution platforms

### Quick Comparison

| Feature | `build:upload` | `build:create` |
|---------|----------------|----------------|
| **File Upload** | ✅ Yes, to Supabase Storage | ❌ No upload needed |
| **Checksums** | ✅ Auto-generated (SHA256/SHA512) | ⚠️ Manual entry (optional) |
| **Use Case** | Desktop apps, self-hosting | Mobile apps, app stores |
| **Storage** | Required | Not required |
| **File Size Limit** | 500MB (default) | No limit |
| **URL Type** | CDN URL (your infrastructure) | External URL (any) |
| **Examples** | `.dmg`, `.msi`, `.tar.gz` | TestFlight, Play Store links |

### List builds for a version

```bash
npm run dev -- build:list 1.0.0
```

### Publish a version

This marks the version as published and generates all manifests. **If builds are missing for certain platforms, the CLI will interactively prompt you to select fallback builds from previous versions.**

```bash
npm run dev -- publish 1.0.0
```
