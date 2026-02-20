import ora from 'ora';
import chalk from 'chalk';
import semver from 'semver';
import { supabase } from '../index.js';
import { SUPPORTED_CHANNELS, buildVersionMetadataWithPolicy, getUpdatePolicyFromVersion, isSupportedChannel, validateSemverOrThrow, } from '../utils/versioning.js';
export async function createVersion(version, options) {
    if (!semver.valid(version)) {
        console.error(chalk.red(`❌ Invalid semantic version: ${version}`));
        console.error(chalk.gray('   Expected format: MAJOR.MINOR.PATCH (e.g., 1.0.0, 2.1.3-beta.1)'));
        process.exit(1);
    }
    if (options.channel && !isSupportedChannel(options.channel)) {
        console.error(chalk.red(`❌ Invalid channel: ${options.channel}`));
        console.error(chalk.gray(`   Supported channels: ${SUPPORTED_CHANNELS.join(', ')}`));
        process.exit(1);
    }
    if (options.minSupported && !semver.valid(options.minSupported)) {
        console.error(chalk.red(`❌ Invalid semantic version for --min-supported: ${options.minSupported}`));
        process.exit(1);
    }
    const rolloutPercentage = parseRolloutPercentage(options.rollout);
    if (options.rollout && rolloutPercentage === null) {
        console.error(chalk.red(`❌ Invalid rollout percentage: ${options.rollout}`));
        console.error(chalk.gray('   Expected value between 0 and 100'));
        process.exit(1);
    }
    const spinner = ora(`Creating version ${version}...`).start();
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
        const { data, error } = await supabase
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
            metadata: buildVersionMetadataWithPolicy({}, updatePolicy)
        })
            .select()
            .single();
        if (error)
            throw error;
        spinner.succeed(chalk.green(`✓ Version ${version} created`));
        console.log(chalk.gray(`  ID: ${data.id}`));
        console.log(chalk.gray(`  Channel: ${releaseChannel}`));
        console.log(chalk.gray(`  Storage Prefix: ${storageKeyPrefix}`));
        console.log(chalk.gray(`  Status: Unpublished`));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to create version: ${error.message}`));
        process.exit(1);
    }
}
export async function setVersionPolicy(version, options) {
    if (!semver.valid(version)) {
        console.error(chalk.red(`❌ Invalid semantic version: ${version}`));
        process.exit(1);
    }
    if (options.channel && !isSupportedChannel(options.channel)) {
        console.error(chalk.red(`❌ Invalid channel: ${options.channel}`));
        console.error(chalk.gray(`   Supported channels: ${SUPPORTED_CHANNELS.join(', ')}`));
        process.exit(1);
    }
    if (options.minSupported) {
        try {
            validateSemverOrThrow(options.minSupported, 'min-supported');
        }
        catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    }
    const rolloutPercentage = parseRolloutPercentage(options.rollout);
    if (options.rollout && rolloutPercentage === null) {
        console.error(chalk.red(`❌ Invalid rollout percentage: ${options.rollout}`));
        console.error(chalk.gray('   Expected value between 0 and 100'));
        process.exit(1);
    }
    const selectedChannel = options.channel || 'stable';
    const spinner = ora(`Updating policy for ${version} (${selectedChannel})...`).start();
    try {
        const { data: existing, error: fetchError } = await supabase
            .schema('application')
            .from('versions')
            .select('metadata, release_channel, min_supported_version, rollout_percentage, rollout_start_at, rollout_end_at')
            .eq('version_name', version)
            .eq('release_channel', selectedChannel)
            .single();
        if (fetchError || !existing) {
            throw new Error(`Version ${version} (${selectedChannel}) not found`);
        }
        const currentPolicy = getUpdatePolicyFromVersion(existing);
        const nextPolicy = {
            channel: selectedChannel,
            minSupportedVersion: options.minSupported ?? currentPolicy.minSupportedVersion,
            rolloutPercentage: rolloutPercentage ?? currentPolicy.rolloutPercentage,
            rolloutStartAt: options.rolloutStartAt ?? currentPolicy.rolloutStartAt,
            rolloutEndAt: options.rolloutEndAt ?? currentPolicy.rolloutEndAt,
        };
        const metadata = buildVersionMetadataWithPolicy(existing.metadata, nextPolicy);
        const { error: updateError } = await supabase
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
        spinner.succeed(chalk.green(`✓ Policy updated for ${version}`));
        console.log(chalk.gray(`  Channel: ${nextPolicy.channel}`));
        console.log(chalk.gray(`  Rollout: ${nextPolicy.rolloutPercentage}%`));
        if (nextPolicy.minSupportedVersion) {
            console.log(chalk.gray(`  Min Supported: ${nextPolicy.minSupportedVersion}`));
        }
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to update policy: ${error.message}`));
        process.exit(1);
    }
}
export async function listVersions(options) {
    const spinner = ora('Fetching versions...').start();
    try {
        const limit = options.limit ? parseInt(options.limit) : 20;
        const offset = options.offset ? parseInt(options.offset) : 0;
        if (options.channel && !isSupportedChannel(options.channel)) {
            throw new Error(`Invalid channel: ${options.channel}. Supported: ${SUPPORTED_CHANNELS.join(', ')}`);
        }
        let query = supabase
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
            console.log(chalk.yellow('No versions found'));
            return;
        }
        console.log(chalk.bold('\nVersions:'));
        console.log(chalk.gray(`Showing ${offset + 1}-${offset + data.length} of ${count || 0} total\n`));
        data.forEach((v) => {
            const status = v.is_published ? chalk.green('Published') : chalk.yellow('Draft');
            const mandatory = v.is_mandatory ? chalk.red(' [MANDATORY]') : '';
            const policy = getUpdatePolicyFromVersion(v);
            console.log(`  ${chalk.bold(v.version_name)} - ${status}${mandatory}`);
            console.log(chalk.gray(`    Created: ${new Date(v.created_at).toLocaleDateString()}`));
            console.log(chalk.gray(`    Channel: ${policy.channel} | Rollout: ${policy.rolloutPercentage}%`));
            if (policy.minSupportedVersion) {
                console.log(chalk.gray(`    Min Supported: ${policy.minSupportedVersion}`));
            }
            if (v.release_notes) {
                console.log(chalk.gray(`    Notes: ${v.release_notes.substring(0, 60)}...`));
            }
        });
        // Show pagination hints
        if (count && count > offset + data.length) {
            console.log(chalk.gray(`\n  Use --limit and --offset for pagination`));
            console.log(chalk.gray(`  Next page: --offset ${offset + limit}`));
        }
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to list versions: ${error.message}`));
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
//# sourceMappingURL=version.js.map