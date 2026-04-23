#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdnUrl = exports.supabase = void 0;
exports.reinitSupabase = reinitSupabase;
const commander_1 = require("commander");
const dotenv_1 = require("dotenv");
const supabase_js_1 = require("@supabase/supabase-js");
const version_js_1 = require("./commands/version.js");
const build_js_1 = require("./commands/build.js");
const publish_js_1 = require("./commands/publish.js");
const config_js_1 = require("./commands/config.js");
const update_js_1 = require("./commands/update.js");
const config_js_2 = require("./utils/config.js");
const package_json_1 = require("../package.json");
const repl_js_1 = require("./repl.js");
const banner_js_1 = require("./ui/banner.js");
const theme_js_1 = require("./ui/theme.js");
const log_js_1 = require("./ui/log.js");
// Load environment variables from .env file (if exists)
(0, dotenv_1.config)();
exports.supabase = null;
exports.cdnUrl = '';
function reinitSupabase() {
    const cfg = (0, config_js_2.loadConfig)();
    const url = process.env.SUPABASE_URL || cfg.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY;
    const key = process.env.APP_PUBLISHER_KEY || cfg.APP_PUBLISHER_KEY;
    if (!url || !anon || !key) {
        exports.supabase = null;
        exports.cdnUrl = '';
        return false;
    }
    const resolved = url.replace(/\/$/, '');
    const defaultCdn = `${resolved}/storage/v1/object/public/`;
    exports.cdnUrl = process.env.CDN_URL || cfg.CDN_URL || defaultCdn;
    exports.supabase = (0, supabase_js_1.createClient)(url, anon, {
        db: { schema: 'publisher' },
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
    log_js_1.ui.error('Missing required credentials.');
    console.log('');
    log_js_1.ui.heading('Configure using one of these methods:');
    log_js_1.ui.hint('1. Run interactive setup:  publisher chat');
    log_js_1.ui.hint('2. Set via CLI:           publisher config:set SUPABASE_URL "https://..."');
    log_js_1.ui.hint('3. Environment variables:  export SUPABASE_URL="https://..."');
    log_js_1.ui.hint('4. .env file with the same keys');
    process.exit(1);
}
const program = new commander_1.Command();
program
    .name('publisher')
    .description(`${theme_js_1.theme.brandBold('Publisher CLI')} ${theme_js_1.theme.muted('— versions, builds, channels, and update manifests.')}`)
    .version(package_json_1.version);
program.addHelpText('beforeAll', `\n${(0, banner_js_1.renderBanner)(package_json_1.version)}\n`);
program.addHelpText('after', `\n${theme_js_1.theme.muted('Run')} ${theme_js_1.theme.accent('publisher chat')} ${theme_js_1.theme.muted('to enter interactive mode.')}\n`);
program
    .command('chat')
    .alias('interactive')
    .description('Start interactive mode (REPL with slash commands)')
    .action(async () => {
    await (0, repl_js_1.startRepl)(program, package_json_1.version, {
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
function collectMeta(value, previous) {
    return [...(previous || []), value];
}
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
program
    .command('version:delete <version>')
    .description('Delete a version and all its builds')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .option('-y, --yes', 'Skip confirmation prompt', false)
    .option('--force', 'Delete even if published or referenced as fallback by other versions', false)
    .action(version_js_1.deleteVersion);
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
    .option('--meta <keyValue>', 'Custom metadata as key=value (repeatable, e.g. --meta minOsVersion=12.0)', collectMeta, [])
    .action(build_js_1.uploadBuild);
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
    .option('--meta <keyValue>', 'Custom metadata as key=value (repeatable, e.g. --meta minOsVersion=12.0)', collectMeta, [])
    .action(build_js_1.createBuild);
program
    .command('build:list <version>')
    .description('List all builds for a version')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .action(build_js_1.listBuilds);
program
    .command('build:delete <version> <os> <arch> <type>')
    .description('Delete a specific build for a version')
    .option('--channel <channel>', 'Release channel (stable, beta, alpha)', 'stable')
    .option('--distribution <distribution>', 'Filter by distribution (direct, store)')
    .option('--variant <variant>', 'Filter by variant label (default: all variants)')
    .option('-y, --yes', 'Skip confirmation prompt', false)
    .action(build_js_1.deleteBuild);
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
if (!firstArg) {
    if (process.stdin.isTTY) {
        (0, repl_js_1.startRepl)(program, package_json_1.version, {
            reinitSupabase: () => {
                const ok = reinitSupabase();
                hasCredentials = ok;
                return ok;
            },
            needsSetup: !hasCredentials,
        });
    }
    else {
        program.outputHelp();
    }
}
else {
    program.parse();
}
//# sourceMappingURL=index.js.map