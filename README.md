# Spacerun Archive CLI

[![Release](https://img.shields.io/github/v/release/SpacerunApp/deployment?filter=cli-*&label=CLI&logo=github)](https://github.com/SpacerunApp/publisher-cli/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

CLI tool to manage Spacerun app versions, builds, and auto-update manifests.


## Installation

### Download Pre-built Binaries (Recommended)

Download the latest release from [GitHub Releases](https://github.com/SpacerunApp/deployment/releases):

```bash
# macOS ARM64 (Apple Silicon)
curl -LO https://github.com/SpacerunApp/deployment/releases/latest/download/archive-macos-arm64
chmod +x archive-macos-arm64
./archive-macos-arm64 --help

# macOS x64 (Intel)
curl -LO https://github.com/SpacerunApp/deployment/releases/latest/download/archive-macos-x64
chmod +x archive-macos-x64

# Linux x64
curl -LO https://github.com/SpacerunApp/deployment/releases/latest/download/archive-linux-x64
chmod +x archive-linux-x64

# Windows x64
# Download from GitHub Releases page or use PowerShell:
# Invoke-WebRequest -Uri "https://github.com/SpacerunApp/deployment/releases/latest/download/archive-win-x64.exe" -OutFile "archive.exe"
```
### From Source

```bash
cd cli
npm install
npm run build
```

### Build Executables Locally

```bash
# Build for current platform
npm run pkg

# Build for all platforms (macOS, Linux, Windows)
npm run pkg:all
```

Executables will be in the `bin/` directory:
- `bin/archive-macos-arm64`
- `bin/archive-macos-x64`
- `bin/archive-linux-x64`
- `bin/archive-win-x64.exe`

## Quick Start (Executable Users)

After downloading a pre-built executable:

```bash
# 1. Make executable (macOS/Linux)
chmod +x archive-macos-arm64

# 2. Configure credentials (stored in ~/.spacerun-archive/config.json)
./archive-macos-arm64 config:set SUPABASE_URL "https://your-project.supabase.co"
./archive-macos-arm64 config:set SUPABASE_ANON_KEY "your-anon-key"
./archive-macos-arm64 config:set APP_PUBLISHER_KEY "your-jwt-token"
./archive-macos-arm64 config:set CDN_URL "https://cdn.com/storage/v1/object/public/"

# 3. Verify configuration
./archive-macos-arm64 config:get

# 4. Start using CLI
./archive-macos-arm64 version:list
./archive-macos-arm64 version:create 1.0.0 --notes "Initial release"
```

Configuration is saved and persists across CLI runs!

## Configuration

The CLI requires Supabase credentials to function. You can configure these in three ways:

### Method 1: CLI Config (Recommended for Executables)

Use the built-in config commands to store credentials persistently:

```bash
# Set credentials
archive config:set SUPABASE_URL "https://your-project.supabase.co"
archive config:set SUPABASE_ANON_KEY "your-anon-key"
archive config:set APP_PUBLISHER_KEY "your-app-publisher-jwt-token"
archive config:set CDN_URL "https://your-cdn.com/storage/v1/object/public/"

# View all configuration
archive config:get

# View specific value
archive config:get SUPABASE_URL

# Delete a value
archive config:delete SUPABASE_URL

# Clear all configuration
archive config:reset
```

Configuration is stored in `~/.spacerun-archive/config.json` and persists across CLI runs.

### Method 2: Environment Variables (For Development)

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export APP_PUBLISHER_KEY="your-app-publisher-jwt-token"
export CDN_URL="https://your-cdn.com/storage/v1/object/public/"
```

### Method 3: .env File (For Development)

Create a `.env` file in the CLI directory:

```bash
cd cli
cp .env.example .env
# Edit .env with your credentials
```

Edit `.env` with your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
APP_PUBLISHER_KEY=your-app-publisher-jwt-token
CDN_URL=https://your-cdn.com/storage/v1/object/public/
```

**Priority order:** Environment variables > .env file > CLI config file

### Get Supabase Credentials

**Get your Supabase credentials:**
1. Go to your Supabase project settings
2. Copy the **Project URL** → `SUPABASE_URL`
3. Copy the **anon public** key → `SUPABASE_ANON_KEY`
4. Generate **APP_PUBLISHER_KEY** (see below)

**Generate APP_PUBLISHER_KEY:**

```js
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your-supabase-jwt-secret';

const token = jwt.sign({ role: 'app_uploader' }, JWT_SECRET, {
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

**Checksums are automatically generated** (SHA256 & SHA512) and stored with each build.

Examples:
```bash
# macOS ARM64 patch
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-arm64-macos.tar.gz

# Windows x64 installer
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-x64-windows.msi

# Linux x64 AppImage
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-x64-linux.AppImage

# iOS ARM64
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-arm64-ios.zip

# Android ARM64
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-arm64-android.apk
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

**Benefits:**
- No file upload required (saves storage and bandwidth)
- Direct links to store pages
- Still tracks versions in your manifest
- Works with interactive publishing prompts

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

Example interactive flow when publishing:
```
✔ Version 1.0.0 found with 3 builds

⚠ Missing 2 installer build(s):
  - ios/arm64/installer
  - android/arm64/installer

You can assign builds from previous versions as fallbacks.

? Select fallback build for ios/arm64/installer: (Use arrow keys)
❯ 0.9.0 - spacerun-0.9.0-arm64-ios.zip
  0.8.5 - spacerun-0.8.5-arm64-ios.zip
  Skip this platform

✔ Assigned build from 0.9.0
✔ Version 1.0.0 published
  Manifests generated:
    - archive/1.0.0/manifest.json
    - archive/manifest.json (latest)
```

**Note:** 
- **Installer builds** are required for each platform
- **Patch builds** (tar.gz, zip) are optional
- You can skip platforms if you don't want to support them in this release

Generates:
- `archive/1.0.0/manifest.json` (version-specific)
- `archive/manifest.json` (latest build per platform)

The manifest will include a `fallbackFrom` field to indicate builds from other versions:

```json
{
  "ios": {
    "builds": {
      "arm64": {
        "installer": {
          "url": "...",
          "fallbackFrom": "0.9.0"
        }
      }
    }
  }
}
```

### Generate manifest only

```bash
npm run dev -- manifest:generate 1.0.0
```

## Manifest Structure

### Version-specific manifest
`archive/1.0.0/manifest.json`:

```json
{
  "name": "Spacerun",
  "version": "1.0.0",
  "platforms": [
    {
      "os": "macos",
      "builds": {
        "arm64": {
          "patch": {
            "url": "https://cdn.com/archive/1.0.0/macos/arm64/spacerun-1.0.0-arm64-macos.tar.gz",
            "size": 52428800,
            "packageName": "spacerun-1.0.0-arm64-macos.tar.gz",
            "releaseDate": "2026-01-18T...",
            "type": "patch",
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "sha512": "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce..."
          },
          "installer": { ... }
        }
      }
    },
    {
      "os": "ios",
      "builds": {
        "arm64": {
          "installer": {
            "url": "https://testflight.apple.com/join/ABC123",
            "size": 0,
            "packageName": "Spacerun iOS 1.0.0",
            "releaseDate": "2026-01-18T...",
            "type": "installer",
            "external": true
          }
        }
      }
    }
  ]
}
```

**Note:** External builds (created with `build:create`) include `"external": true` in the manifest.

### Latest manifest
`archive/manifest.json` - shows latest published build for each platform:

```json
{
  "name": "Spacerun",
  "version": "1.0.0",
  "platforms": [
    {
      "os": "macos",
      "version": "1.0.0",
      "builds": { ... }
    },
    {
      "os": "windows",
      "version": "0.9.0",
      "builds": { ... }
    }
  ]
}
```

## Workflow Example

```bash
# 1. Create version
npm run dev -- version:create 1.0.0 --notes "New features"

# 2. Upload builds for desktop platforms
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-arm64-macos.tar.gz
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-arm64-macos.dmg
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-x64-windows.zip
npm run dev -- build:upload 1.0.0 ./builds/spacerun-1.0.0-x64-windows.msi

# 3. Create external references for mobile platforms
npm run dev -- build:create 1.0.0 ios arm64 installer \
  "https://testflight.apple.com/join/ABC123" \
  --package-name "Spacerun iOS 1.0.0"

npm run dev -- build:create 1.0.0 android arm64 installer \
  "https://play.google.com/store/apps/details?id=com.spacerun.app"

# 4. Verify builds
npm run dev -- build:list 1.0.0

# 5. Publish (CLI will prompt for any missing platforms)
npm run dev -- publish 1.0.0

# The CLI detects missing platforms and asks:
# ? Select fallback build for linux/x64/installer:
#   ❯ 0.9.0 - spacerun-0.9.0-x64-linux.AppImage
#     Skip this platform
```

**Result:**
- macOS/Windows users get 1.0.0 downloads
- iOS users get TestFlight link
- Android users get Play Store link
- Any other platforms use builds from the version you selected (with `fallbackFrom` indicator)
- Root `manifest.json` shows latest per platform

## Supported Platforms

- **macOS**: arm64, x64
- **Windows**: x64, x86
- **Linux**: arm64, x64
- **iOS**: arm64
- **Android**: arm64, x86

## Build Types

- **patch**: Incremental updates (`.tar.gz`, `.zip`)
- **installer**: Full installers (`.dmg`, `.msi`, `.AppImage`, `.deb`, `.rpm`, `.apk`)

## Build Distribution Methods

### `build:upload` - File Upload
Upload actual build files to Supabase Storage. Best for:
- Desktop applications (macOS, Windows, Linux)
- Self-hosted distribution
- Full control over file hosting

**Pros:**
- Automatic checksum generation
- Files stored in your infrastructure
- No external dependencies

**Cons:**
- Storage space required
- Bandwidth costs for downloads
- 500MB file size limit (Supabase default)

### `build:create` - External Reference
Create build records with external URLs. Best for:
- Mobile apps (iOS TestFlight/App Store, Android Play Store)
- Third-party distribution platforms
- Large files exceeding storage limits
- Beta testing platforms

**Pros:**
- No storage space needed
- No file size limits
- Direct links to app stores
- Works with existing distribution channels

**Cons:**
- Manual checksum entry (if needed)
- Dependent on external services
- No automatic verification

## Security

All uploaded builds include:
- **SHA256 checksum**: Fast verification
- **SHA512 checksum**: Enhanced security

Clients can verify file integrity before installation:

```typescript
import { createHash } from 'crypto';

function verifyChecksum(filePath: string, expectedSha256: string): boolean {
  const hash = createHash('sha256');
  const fileBuffer = readFileSync(filePath);
  hash.update(fileBuffer);
  return hash.digest('hex') === expectedSha256;
}
```

## Development

```bash
# Run in dev mode
npm run dev -- version:list

# Build TypeScript
npm run build

# Run built version
npm start -- version:list

# Build executables
npm run pkg:all
```
