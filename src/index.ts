#!/usr/bin/env node
import { Command } from 'commander';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createVersion, listVersions, setVersionPolicy, deleteVersion } from './commands/version.js';
import { uploadBuild, listBuilds, createBuild, deleteBuild } from './commands/build.js';
import { publishVersion, generateManifest } from './commands/publish.js';
import { setConfig, getConfig, deleteConfig, resetConfig } from './commands/config.js';
import { checkForUpdate } from './commands/update.js';
import { loadConfig } from './utils/config.js';
import { version as pkgVersion } from '../package.json';
import { startRepl } from './repl.js';
import { renderBanner } from './ui/banner.js';
import { theme } from './ui/theme.js';
import { ui } from './ui/log.js';

// Load environment variables from .env file (if exists)
config();

export let supabase: any = null;
export let cdnUrl: string = '';

export function reinitSupabase(): boolean {
  const cfg = loadConfig();
  const url = process.env.SUPABASE_URL || cfg.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY;
  const key = process.env.APP_PUBLISHER_KEY || cfg.APP_PUBLISHER_KEY;

  if (!url || !anon || !key) {
    supabase = null;
    cdnUrl = '';
    return false;
  }

  const resolved = url.replace(/\/$/, '');
  const defaultCdn = `${resolved}/storage/v1/object/public/`;
  cdnUrl = process.env.CDN_URL || cfg.CDN_URL || defaultCdn;

  supabase = createClient(url, anon, {
    db: { schema: 'application' },
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    },
  });
  return true;
}

let hasCredentials = reinitSupabase();

// Skip validation for config commands, interactive launch, and help/version flags
const firstArg = process.argv[2];
const isConfigCommand = firstArg?.startsWith('config');
const isInteractiveLaunch = !firstArg || firstArg === 'chat' || firstArg === 'interactive';
const isHelpOrVersion = firstArg === '--help' || firstArg === '-h' ||
                        firstArg === 'help' ||
                        firstArg === '--version' || firstArg === '-V';

if (!isConfigCommand && !isInteractiveLaunch && !isHelpOrVersion && !hasCredentials) {
  ui.error('Missing required credentials.');
  console.log('');
  ui.heading('Configure using one of these methods:');
  ui.hint('1. Run interactive setup:  publisher chat');
  ui.hint('2. Set via CLI:           publisher config:set SUPABASE_URL "https://..."');
  ui.hint('3. Environment variables:  export SUPABASE_URL="https://..."');
  ui.hint('4. .env file with the same keys');
  process.exit(1);
}

const program = new Command();

program
  .name('publisher')
  .description(`${theme.brandBold('Publisher CLI')} ${theme.muted('— versions, builds, channels, and update manifests.')}`)
  .version(pkgVersion);

program.addHelpText('beforeAll', `\n${renderBanner(pkgVersion)}\n`);
program.addHelpText('after', `\n${theme.muted('Run')} ${theme.accent('publisher chat')} ${theme.muted('to enter interactive mode.')}\n`);

program
  .command('chat')
  .alias('interactive')
  .description('Start interactive mode (REPL with slash commands)')
  .action(async () => {
    await startRepl(program, pkgVersion, {
      reinitSupabase: () => {
        const ok = reinitSupabase();
        hasCredentials = ok;
        return ok;
      },
      needsSetup: !hasCredentials,
    });
  });

// Config commands
program
  .command('config:set <key> <value>')
  .description('Set a configuration value')
  .action(setConfig);

program
  .command('config:get [key]')
  .description('Get configuration value(s)')
  .action(getConfig);

program
  .command('config:delete <key>')
  .description('Delete a configuration value')
  .action(deleteConfig);

program
  .command('config:reset')
  .description('Clear all configuration')
  .action(resetConfig);

// Version commands
program
  .command('version:create <version>')
  .description('Create a new version')
  .option('-n, --notes <notes>', 'Release notes')
  .option('-c, --changelog <changelog>', 'Changelog')
  .option('-m, --mandatory', 'Mark as mandatory update', false)
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('--min-supported <version>', 'Minimum supported app version')
  .option('--rollout <percentage>', 'Rollout percentage (0-100)', '100')
  .option('--rollout-start-at <isoDate>', 'Rollout start date (ISO-8601)')
  .option('--rollout-end-at <isoDate>', 'Rollout end date (ISO-8601)')
  .action(createVersion);

program
  .command('version:policy <version>')
  .description('Update release policy for a version in a channel')
  .option('--channel <channel>', 'Target release channel (stable, beta, alpha)', 'stable')
  .option('--min-supported <version>', 'Minimum supported app version')
  .option('--rollout <percentage>', 'Rollout percentage (0-100)')
  .option('--rollout-start-at <isoDate>', 'Rollout start date (ISO-8601)')
  .option('--rollout-end-at <isoDate>', 'Rollout end date (ISO-8601)')
  .action(setVersionPolicy);

program
  .command('version:list')
  .description('List all versions')
  .option('-p, --published', 'Show only published versions')
  .option('--channel <channel>', 'Filter by release channel (stable, beta, alpha)')
  .option('-l, --limit <limit>', 'Number of versions to show', '20')
  .option('-o, --offset <offset>', 'Offset for pagination', '0')
  .action(listVersions);

program
  .command('version:delete <version>')
  .description('Delete a version and all its builds')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('-y, --yes', 'Skip confirmation prompt', false)
  .option('--force', 'Delete even if published or referenced as fallback by other versions', false)
  .action(deleteVersion);

// Build commands
program
  .command('build:upload <version> <file>')
  .description('Upload a build file for a version')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('--distribution <distribution>', 'Build distribution source (direct, store)', 'direct')
  .option('--variant <variant>', 'Build variant label, e.g. opengl, d3d11 (default: "default")', 'default')
  .option('-o, --os <os>', 'Operating system (macos, windows, linux, ios, android)')
  .option('-a, --arch <arch>', 'Architecture (arm64, x64, x86)')
  .option('-t, --type <type>', 'Build type (patch, installer)')
  .action(uploadBuild);

program
  .command('build:create <version> <os> <arch> <type> <url>')
  .description('Create a build record with external URL (e.g., App Store, TestFlight)')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('--distribution <distribution>', 'Build distribution source (direct, store)', 'store')
  .option('--variant <variant>', 'Build variant label, e.g. opengl, d3d11 (default: "default")', 'default')
  .option('-s, --size <size>', 'File size in bytes', parseInt)
  .option('--sha256 <hash>', 'SHA256 checksum')
  .option('--sha512 <hash>', 'SHA512 checksum')
  .option('-p, --package-name <name>', 'Package name')
  .action(createBuild);

program
  .command('build:list <version>')
  .description('List all builds for a version')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .action(listBuilds);

program
  .command('build:delete <version> <os> <arch> <type>')
  .description('Delete a specific build for a version')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('--distribution <distribution>', 'Filter by distribution (direct, store)')
  .option('--variant <variant>', 'Filter by variant label (default: all variants)')
  .option('-y, --yes', 'Skip confirmation prompt', false)
  .action(deleteBuild);

// Publish commands
program
  .command('publish <version>')
  .description('Publish a version and generate manifests')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('-y, --yes', 'Skip publish confirmation prompt', false)
  .action(publishVersion);

program
  .command('manifest:generate <version>')
  .description('Generate manifest file for a version')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .action(generateManifest);

program
  .command('update:check <installedVersion> <os> <arch>')
  .description('Evaluate if an installed app should update for a specific platform')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('--device-id <deviceId>', 'Stable device identifier for rollout bucketing')
  .option('--allow-prerelease', 'Allow pre-release target versions', false)
  .action(checkForUpdate);

if (!firstArg) {
  if (process.stdin.isTTY) {
    startRepl(program, pkgVersion, {
      reinitSupabase: () => {
        const ok = reinitSupabase();
        hasCredentials = ok;
        return ok;
      },
      needsSetup: !hasCredentials,
    });
  } else {
    program.outputHelp();
  }
} else {
  program.parse();
}
