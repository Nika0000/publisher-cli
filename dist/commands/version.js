"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVersion = createVersion;
exports.setVersionPolicy = setVersionPolicy;
exports.listVersions = listVersions;
exports.deleteVersion = deleteVersion;
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const semver_1 = __importDefault(require("semver"));
const prompts_1 = __importDefault(require("prompts"));
const index_js_1 = require("../index.js");
const publish_js_1 = require("./publish.js");
const versioning_js_1 = require("../utils/versioning.js");
async function createVersion(version, options) {
    if (!semver_1.default.valid(version)) {
        console.error(chalk_1.default.red(`❌ Invalid semantic version: ${version}`));
        console.error(chalk_1.default.gray('   Expected format: MAJOR.MINOR.PATCH (e.g., 1.0.0, 2.1.3-beta.1)'));
        process.exit(1);
    }
    if (options.channel && !(0, versioning_js_1.isSupportedChannel)(options.channel)) {
        console.error(chalk_1.default.red(`❌ Invalid channel: ${options.channel}`));
        console.error(chalk_1.default.gray(`   Supported channels: ${versioning_js_1.SUPPORTED_CHANNELS.join(', ')}`));
        process.exit(1);
    }
    if (options.minSupported && !semver_1.default.valid(options.minSupported)) {
        console.error(chalk_1.default.red(`❌ Invalid semantic version for --min-supported: ${options.minSupported}`));
        process.exit(1);
    }
    const rolloutPercentage = parseRolloutPercentage(options.rollout);
    if (options.rollout && rolloutPercentage === null) {
        console.error(chalk_1.default.red(`❌ Invalid rollout percentage: ${options.rollout}`));
        console.error(chalk_1.default.gray('   Expected value between 0 and 100'));
        process.exit(1);
    }
    const spinner = (0, ora_1.default)(`Creating version ${version}...`).start();
    try {
        const releaseChannel = options.channel || 'stable';
        const storageKeyPrefix = `releases/${releaseChannel}/${version}`;
        const updatePolicy = {
            channel: releaseChannel,
            minSupportedVersion: options.minSupported,
            rolloutPercentage: rolloutPercentage ?? 100,
            rolloutStartAt: options.rolloutStartAt,
            rolloutEndAt: options.rolloutEndAt,
        };
        const { data, error } = await index_js_1.supabase
            .schema('application')
            .from('versions')
            .insert({
            version_name: version,
            release_channel: releaseChannel,
            min_supported_version: options.minSupported,
            rollout_percentage: rolloutPercentage ?? 100,
            rollout_start_at: options.rolloutStartAt,
            rollout_end_at: options.rolloutEndAt,
            storage_key_prefix: storageKeyPrefix,
            release_notes: options.notes,
            changelog: options.changelog,
            is_mandatory: options.mandatory || false,
            is_published: false,
            metadata: (0, versioning_js_1.buildVersionMetadataWithPolicy)({}, updatePolicy)
        })
            .select()
            .single();
        if (error)
            throw error;
        spinner.succeed(chalk_1.default.green(`✓ Version ${version} created`));
        console.log(chalk_1.default.gray(`  ID: ${data.id}`));
        console.log(chalk_1.default.gray(`  Channel: ${releaseChannel}`));
        console.log(chalk_1.default.gray(`  Storage Prefix: ${storageKeyPrefix}`));
        console.log(chalk_1.default.gray(`  Status: Unpublished`));
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to create version: ${error.message}`));
        process.exit(1);
    }
}
async function setVersionPolicy(version, options) {
    if (!semver_1.default.valid(version)) {
        console.error(chalk_1.default.red(`❌ Invalid semantic version: ${version}`));
        process.exit(1);
    }
    if (options.channel && !(0, versioning_js_1.isSupportedChannel)(options.channel)) {
        console.error(chalk_1.default.red(`❌ Invalid channel: ${options.channel}`));
        console.error(chalk_1.default.gray(`   Supported channels: ${versioning_js_1.SUPPORTED_CHANNELS.join(', ')}`));
        process.exit(1);
    }
    if (options.minSupported) {
        try {
            (0, versioning_js_1.validateSemverOrThrow)(options.minSupported, 'min-supported');
        }
        catch (error) {
            console.error(chalk_1.default.red(`❌ ${error.message}`));
            process.exit(1);
        }
    }
    const rolloutPercentage = parseRolloutPercentage(options.rollout);
    if (options.rollout && rolloutPercentage === null) {
        console.error(chalk_1.default.red(`❌ Invalid rollout percentage: ${options.rollout}`));
        console.error(chalk_1.default.gray('   Expected value between 0 and 100'));
        process.exit(1);
    }
    const selectedChannel = options.channel || 'stable';
    const spinner = (0, ora_1.default)(`Updating policy for ${version} (${selectedChannel})...`).start();
    try {
        const { data: existing, error: fetchError } = await index_js_1.supabase
            .schema('application')
            .from('versions')
            .select('metadata, release_channel, min_supported_version, rollout_percentage, rollout_start_at, rollout_end_at')
            .eq('version_name', version)
            .eq('release_channel', selectedChannel)
            .single();
        if (fetchError || !existing) {
            throw new Error(`Version ${version} (${selectedChannel}) not found`);
        }
        const currentPolicy = (0, versioning_js_1.getUpdatePolicyFromVersion)(existing);
        const nextPolicy = {
            channel: selectedChannel,
            minSupportedVersion: options.minSupported ?? currentPolicy.minSupportedVersion,
            rolloutPercentage: rolloutPercentage ?? currentPolicy.rolloutPercentage,
            rolloutStartAt: options.rolloutStartAt ?? currentPolicy.rolloutStartAt,
            rolloutEndAt: options.rolloutEndAt ?? currentPolicy.rolloutEndAt,
        };
        const metadata = (0, versioning_js_1.buildVersionMetadataWithPolicy)(existing.metadata, nextPolicy);
        const { error: updateError } = await index_js_1.supabase
            .schema('application')
            .from('versions')
            .update({
            release_channel: nextPolicy.channel,
            min_supported_version: nextPolicy.minSupportedVersion,
            rollout_percentage: nextPolicy.rolloutPercentage,
            rollout_start_at: nextPolicy.rolloutStartAt,
            rollout_end_at: nextPolicy.rolloutEndAt,
            storage_key_prefix: `releases/${nextPolicy.channel}/${version}`,
            metadata,
        })
            .eq('version_name', version)
            .eq('release_channel', selectedChannel);
        if (updateError)
            throw updateError;
        spinner.succeed(chalk_1.default.green(`✓ Policy updated for ${version}`));
        console.log(chalk_1.default.gray(`  Channel: ${nextPolicy.channel}`));
        console.log(chalk_1.default.gray(`  Rollout: ${nextPolicy.rolloutPercentage}%`));
        if (nextPolicy.minSupportedVersion) {
            console.log(chalk_1.default.gray(`  Min Supported: ${nextPolicy.minSupportedVersion}`));
        }
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to update policy: ${error.message}`));
        process.exit(1);
    }
}
async function listVersions(options) {
    const spinner = (0, ora_1.default)('Fetching versions...').start();
    try {
        const limit = options.limit ? parseInt(options.limit) : 20;
        const offset = options.offset ? parseInt(options.offset) : 0;
        if (options.channel && !(0, versioning_js_1.isSupportedChannel)(options.channel)) {
            throw new Error(`Invalid channel: ${options.channel}. Supported: ${versioning_js_1.SUPPORTED_CHANNELS.join(', ')}`);
        }
        let query = index_js_1.supabase
            .schema('application')
            .from('versions')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (options.published) {
            query = query.eq('is_published', true);
        }
        if (options.channel) {
            query = query.eq('release_channel', options.channel);
        }
        const { data, error, count } = await query;
        if (error)
            throw error;
        spinner.stop();
        if (!data || data.length === 0) {
            console.log(chalk_1.default.yellow('No versions found'));
            return;
        }
        console.log(chalk_1.default.bold('\nVersions:'));
        console.log(chalk_1.default.gray(`Showing ${offset + 1}-${offset + data.length} of ${count || 0} total\n`));
        data.forEach((v) => {
            const status = v.is_published ? chalk_1.default.green('Published') : chalk_1.default.yellow('Draft');
            const mandatory = v.is_mandatory ? chalk_1.default.red(' [MANDATORY]') : '';
            const policy = (0, versioning_js_1.getUpdatePolicyFromVersion)(v);
            console.log(`  ${chalk_1.default.bold(v.version_name)} - ${status}${mandatory}`);
            console.log(chalk_1.default.gray(`    Created: ${new Date(v.created_at).toLocaleDateString()}`));
            console.log(chalk_1.default.gray(`    Channel: ${policy.channel} | Rollout: ${policy.rolloutPercentage}%`));
            if (policy.minSupportedVersion) {
                console.log(chalk_1.default.gray(`    Min Supported: ${policy.minSupportedVersion}`));
            }
            if (v.release_notes) {
                console.log(chalk_1.default.gray(`    Notes: ${v.release_notes.substring(0, 60)}...`));
            }
        });
        // Show pagination hints
        if (count && count > offset + data.length) {
            console.log(chalk_1.default.gray(`\n  Use --limit and --offset for pagination`));
            console.log(chalk_1.default.gray(`  Next page: --offset ${offset + limit}`));
        }
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to list versions: ${error.message}`));
        process.exit(1);
    }
}
function parseRolloutPercentage(value) {
    if (value === undefined) {
        return null;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        return null;
    }
    return parsed;
}
async function deleteVersion(version, options) {
    const channel = options.channel || 'stable';
    const spinner = (0, ora_1.default)(`Looking up version ${version} (${channel})...`).start();
    try {
        // Resolve version record
        const { data: versionData, error: versionError } = await index_js_1.supabase
            .schema('application')
            .from('versions')
            .select('id, version_name, release_channel, is_published, storage_key_prefix')
            .eq('version_name', version)
            .eq('release_channel', channel)
            .single();
        if (versionError || !versionData) {
            throw new Error(`Version ${version} (${channel}) not found`);
        }
        // Get all builds for this version
        const { data: builds, error: buildsError } = await index_js_1.supabase
            .schema('application')
            .from('builds')
            .select('*')
            .eq('version_id', versionData.id);
        if (buildsError)
            throw buildsError;
        spinner.stop();
        // Conflict check: are any builds in other versions referencing this version as a fallback?
        const { data: dependentBuilds, error: depError } = await index_js_1.supabase
            .schema('application')
            .from('builds')
            .select('version_id, os, arch, type, distribution, platform_metadata')
            .filter('platform_metadata->>fallback_from', 'eq', version);
        if (depError)
            throw depError;
        if (dependentBuilds && dependentBuilds.length > 0) {
            console.log(chalk_1.default.red(`\n✗ Conflict: ${dependentBuilds.length} build(s) in other versions reference ${version} as a fallback:`));
            dependentBuilds.forEach((b) => {
                console.log(chalk_1.default.gray(`  - version_id=${b.version_id} | ${b.os}/${b.arch}/${b.type}/${b.distribution || 'direct'}`));
            });
            console.log(chalk_1.default.yellow('\n  Delete or reassign those fallback builds before deleting this version.'));
            if (!options.force) {
                process.exit(1);
            }
            console.log(chalk_1.default.yellow('  --force specified, proceeding anyway...'));
        }
        // Block deletion of published versions unless --force
        if (versionData.is_published && !options.force) {
            console.log(chalk_1.default.red(`\n✗ Version ${version} is currently published.`));
            console.log(chalk_1.default.gray('  Unpublish it first, or use --force to delete a published version.'));
            process.exit(1);
        }
        if (versionData.is_published) {
            console.log(chalk_1.default.yellow(`\n⚠ Warning: Version ${version} is published. Deleting it will break active manifests.`));
        }
        // Show summary
        console.log(chalk_1.default.bold(`\nAbout to delete:`));
        console.log(chalk_1.default.gray(`  Version : ${version} (${channel})`));
        console.log(chalk_1.default.gray(`  Builds  : ${builds?.length || 0}`));
        console.log(chalk_1.default.gray(`  Published: ${versionData.is_published ? chalk_1.default.red('yes') : 'no'}`));
        if (!options.yes) {
            const response = await (0, prompts_1.default)({
                type: 'confirm',
                name: 'confirm',
                initial: false,
                message: `Delete version ${version} and all ${builds?.length || 0} associated build(s)?`,
            });
            if (!response.confirm) {
                console.log(chalk_1.default.yellow('Deletion canceled.'));
                return;
            }
        }
        const deleteSpinner = (0, ora_1.default)('Deleting version and builds...').start();
        // Delete all builds from database first
        if (builds && builds.length > 0) {
            const { error: deleteBuildsError } = await index_js_1.supabase
                .schema('application')
                .from('builds')
                .delete()
                .eq('version_id', versionData.id);
            if (deleteBuildsError)
                throw deleteBuildsError;
        }
        // Delete the version itself
        const { error: deleteVersionError } = await index_js_1.supabase
            .schema('application')
            .from('versions')
            .delete()
            .eq('id', versionData.id);
        if (deleteVersionError)
            throw deleteVersionError;
        // Remove entire storage folder (builds + manifest.json + any leftover files)
        const storagePrefix = versionData.storage_key_prefix || `releases/${channel}/${version}`;
        deleteSpinner.text = `Removing storage folder ${storagePrefix}...`;
        try {
            await removeStorageFolder('archive', storagePrefix);
        }
        catch (storageError) {
            // Non-fatal — DB records are already cleaned up
            console.log(chalk_1.default.yellow(`\n  ⚠ Storage cleanup failed: ${storageError.message}`));
        }
        deleteSpinner.succeed(chalk_1.default.green(`✓ Deleted version ${version} (${channel}), ${builds?.length || 0} build(s), and storage folder`));
        // Regenerate channel latest manifest if this was a published version
        if (versionData.is_published) {
            const manifestSpinner = (0, ora_1.default)(`Regenerating channel manifest for ${channel}...`).start();
            try {
                await (0, publish_js_1.generateLatestManifest)(channel);
                manifestSpinner.succeed(chalk_1.default.green(`✓ Channel manifest regenerated for ${channel}`));
            }
            catch (manifestError) {
                manifestSpinner.warn(chalk_1.default.yellow(`⚠ Channel manifest regeneration failed: ${manifestError.message}`));
            }
        }
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to delete version: ${error.message}`));
        process.exit(1);
    }
}
/**
 * Recursively list and remove all files under a storage folder prefix.
 */
async function removeStorageFolder(bucket, prefix) {
    const { data: items, error } = await index_js_1.supabase.storage
        .from(bucket)
        .list(prefix, { limit: 1000 });
    if (error)
        throw error;
    if (!items || items.length === 0)
        return;
    const filePaths = [];
    const subfolders = [];
    for (const item of items) {
        if (item.id) {
            // It's a file
            filePaths.push(`${prefix}/${item.name}`);
        }
        else {
            // It's a virtual folder
            subfolders.push(`${prefix}/${item.name}`);
        }
    }
    if (filePaths.length > 0) {
        const { error: removeError } = await index_js_1.supabase.storage.from(bucket).remove(filePaths);
        if (removeError)
            throw removeError;
    }
    for (const subfolder of subfolders) {
        await removeStorageFolder(bucket, subfolder);
    }
}
//# sourceMappingURL=version.js.map