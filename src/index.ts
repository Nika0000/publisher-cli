#!/usr/bin/env node
import { Command } from 'commander';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createVersion, listVersions, setVersionPolicy } from './commands/version.js';
import { uploadBuild, listBuilds, createBuild } from './commands/build.js';
import { publishVersion, generateManifest } from './commands/publish.js';
import { setConfig, getConfig, deleteConfig, resetConfig } from './commands/config.js';
import { checkForUpdate } from './commands/update.js';
import { loadConfig } from './utils/config.js';

// Load environment variables from .env file (if exists)
config();

// Load from config file if env vars not set
const configFile = loadConfig();

// Get credentials from env vars or config file
const SUPABASE_URL = process.env.SUPABASE_URL || configFile.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || configFile.SUPABASE_ANON_KEY;
const APP_PUBLISHER_KEY = process.env.APP_PUBLISHER_KEY || configFile.APP_PUBLISHER_KEY;
const resolvedSupabaseUrl = SUPABASE_URL ? SUPABASE_URL.replace(/\/$/, '') : '';
const DEFAULT_CDN_URL = resolvedSupabaseUrl ? `${resolvedSupabaseUrl}/storage/v1/object/public/` : undefined;
const CDN_URL = process.env.CDN_URL || configFile.CDN_URL || DEFAULT_CDN_URL;

// Skip validation for config commands
const isConfigCommand = process.argv[2]?.startsWith('config');

if (!isConfigCommand && (!SUPABASE_URL || !SUPABASE_ANON_KEY || !APP_PUBLISHER_KEY)) {
  console.error('❌ Missing required credentials:');
  console.error('   SUPABASE_URL, SUPABASE_ANON_KEY, APP_PUBLISHER_KEY');
  console.error('   Optional: CDN_URL (auto-derived from SUPABASE_URL if omitted)');
  console.error('');
  console.error('Configure using one of these methods:');
  console.error('  1. Environment variables (for development):');
  console.error('     export SUPABASE_URL="https://..."');
  console.error('  2. .env file (for development):');
  console.error('     Create .env file with credentials');
  console.error('  3. CLI config (for executable):');
  console.error('     publisher config:set SUPABASE_URL "https://..."');
  process.exit(1);
}

// Create Supabase client (only if credentials are available)
export const supabase = isConfigCommand 
  ? null as any 
  : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, 
     {
      global: {
        headers: {
          Authorization: `Bearer ${APP_PUBLISHER_KEY}`,
        },
      },
    }
  );
export const cdnUrl = CDN_URL || '';

const program = new Command();

program
  .name('publisher')
  .description('Publisher CLI for app version and build management')
  .version('1.0.0');

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

// Build commands
program
  .command('build:upload <version> <file>')
  .description('Upload a build file for a version')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('--distribution <distribution>', 'Build distribution source (direct, store)', 'direct')
  .option('-o, --os <os>', 'Operating system (macos, windows, linux, ios, android)')
  .option('-a, --arch <arch>', 'Architecture (arm64, x64, x86)')
  .option('-t, --type <type>', 'Build type (patch, installer)')
  .action(uploadBuild);

program
  .command('build:create <version> <os> <arch> <type> <url>')
  .description('Create a build record with external URL (e.g., App Store, TestFlight)')
  .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
  .option('--distribution <distribution>', 'Build distribution source (direct, store)', 'store')
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

program.parse();
