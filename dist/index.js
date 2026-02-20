#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdnUrl = exports.supabase = void 0;
const commander_1 = require("commander");
const dotenv_1 = require("dotenv");
const supabase_js_1 = require("@supabase/supabase-js");
const version_js_1 = require("./commands/version.js");
const build_js_1 = require("./commands/build.js");
const publish_js_1 = require("./commands/publish.js");
const config_js_1 = require("./commands/config.js");
const update_js_1 = require("./commands/update.js");
const config_js_2 = require("./utils/config.js");
// Load environment variables from .env file (if exists)
(0, dotenv_1.config)();
// Load from config file if env vars not set
const configFile = (0, config_js_2.loadConfig)();
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
exports.supabase = isConfigCommand
    ? null
    : (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${APP_PUBLISHER_KEY}`,
            },
        },
    });
exports.cdnUrl = CDN_URL || '';
const program = new commander_1.Command();
program
    .name('publisher')
    .description('Publisher CLI for app version and build management')
    .version('1.0.0');
// Config commands
program
    .command('config:set <key> <value>')
    .description('Set a configuration value')
    .action(config_js_1.setConfig);
program
    .command('config:get [key]')
    .description('Get configuration value(s)')
    .action(config_js_1.getConfig);
program
    .command('config:delete <key>')
    .description('Delete a configuration value')
    .action(config_js_1.deleteConfig);
program
    .command('config:reset')
    .description('Clear all configuration')
    .action(config_js_1.resetConfig);
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
    .action(version_js_1.createVersion);
program
    .command('version:policy <version>')
    .description('Update release policy for a version in a channel')
    .option('--channel <channel>', 'Target release channel (stable, beta, alpha)', 'stable')
    .option('--min-supported <version>', 'Minimum supported app version')
    .option('--rollout <percentage>', 'Rollout percentage (0-100)')
    .option('--rollout-start-at <isoDate>', 'Rollout start date (ISO-8601)')
    .option('--rollout-end-at <isoDate>', 'Rollout end date (ISO-8601)')
    .action(version_js_1.setVersionPolicy);
program
    .command('version:list')
    .description('List all versions')
    .option('-p, --published', 'Show only published versions')
    .option('--channel <channel>', 'Filter by release channel (stable, beta, alpha)')
    .option('-l, --limit <limit>', 'Number of versions to show', '20')
    .option('-o, --offset <offset>', 'Offset for pagination', '0')
    .action(version_js_1.listVersions);
// Build commands
program
    .command('build:upload <version> <file>')
    .description('Upload a build file for a version')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .option('--distribution <distribution>', 'Build distribution source (direct, store)', 'direct')
    .option('-o, --os <os>', 'Operating system (macos, windows, linux, ios, android)')
    .option('-a, --arch <arch>', 'Architecture (arm64, x64, x86)')
    .option('-t, --type <type>', 'Build type (patch, installer)')
    .action(build_js_1.uploadBuild);
program
    .command('build:create <version> <os> <arch> <type> <url>')
    .description('Create a build record with external URL (e.g., App Store, TestFlight)')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .option('--distribution <distribution>', 'Build distribution source (direct, store)', 'store')
    .option('-s, --size <size>', 'File size in bytes', parseInt)
    .option('--sha256 <hash>', 'SHA256 checksum')
    .option('--sha512 <hash>', 'SHA512 checksum')
    .option('-p, --package-name <name>', 'Package name')
    .action(build_js_1.createBuild);
program
    .command('build:list <version>')
    .description('List all builds for a version')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .action(build_js_1.listBuilds);
// Publish commands
program
    .command('publish <version>')
    .description('Publish a version and generate manifests')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .option('-y, --yes', 'Skip publish confirmation prompt', false)
    .action(publish_js_1.publishVersion);
program
    .command('manifest:generate <version>')
    .description('Generate manifest file for a version')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .action(publish_js_1.generateManifest);
program
    .command('update:check <installedVersion> <os> <arch>')
    .description('Evaluate if an installed app should update for a specific platform')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .option('--device-id <deviceId>', 'Stable device identifier for rollout bucketing')
    .option('--allow-prerelease', 'Allow pre-release target versions', false)
    .action(update_js_1.checkForUpdate);
program.parse();
//# sourceMappingURL=index.js.map