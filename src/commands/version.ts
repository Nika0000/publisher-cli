import ora from 'ora';
import chalk from 'chalk';
import semver from 'semver';
import prompts from 'prompts';
import { supabase } from '../index.js';
import { generateLatestManifest } from './publish.js';
import {
  SUPPORTED_CHANNELS,
  buildVersionMetadataWithPolicy,
  getUpdatePolicyFromVersion,
  isSupportedChannel,
  validateSemverOrThrow,
} from '../utils/versioning.js';

interface CreateVersionOptions {
  notes?: string;
  changelog?: string;
  mandatory?: boolean;
  channel?: string;
  minSupported?: string;
  rollout?: string;
  rolloutStartAt?: string;
  rolloutEndAt?: string;
}

export async function createVersion(version: string, options: CreateVersionOptions) {
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
      channel: releaseChannel as 'stable' | 'beta' | 'alpha',
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

    if (error) throw error;

    spinner.succeed(chalk.green(`✓ Version ${version} created`));
    console.log(chalk.gray(`  ID: ${data.id}`));
    console.log(chalk.gray(`  Channel: ${releaseChannel}`));
    console.log(chalk.gray(`  Storage Prefix: ${storageKeyPrefix}`));
    console.log(chalk.gray(`  Status: Unpublished`));
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to create version: ${error.message}`));
    process.exit(1);
  }
}

interface SetVersionPolicyOptions {
  channel?: string;
  minSupported?: string;
  rollout?: string;
  rolloutStartAt?: string;
  rolloutEndAt?: string;
}

export async function setVersionPolicy(version: string, options: SetVersionPolicyOptions) {
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
    } catch (error: any) {
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
      channel: selectedChannel as 'stable' | 'beta' | 'alpha',
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

    if (updateError) throw updateError;

    spinner.succeed(chalk.green(`✓ Policy updated for ${version}`));
    console.log(chalk.gray(`  Channel: ${nextPolicy.channel}`));
    console.log(chalk.gray(`  Rollout: ${nextPolicy.rolloutPercentage}%`));
    if (nextPolicy.minSupportedVersion) {
      console.log(chalk.gray(`  Min Supported: ${nextPolicy.minSupportedVersion}`));
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to update policy: ${error.message}`));
    process.exit(1);
  }
}

interface ListVersionsOptions {
  published?: boolean;
  limit?: string;
  offset?: string;
  channel?: string;
}

export async function listVersions(options: ListVersionsOptions) {
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

    if (error) throw error;

    spinner.stop();

    if (!data || data.length === 0) {
      console.log(chalk.yellow('No versions found'));
      return;
    }

    console.log(chalk.bold('\nVersions:'));
    console.log(chalk.gray(`Showing ${offset + 1}-${offset + data.length} of ${count || 0} total\n`));
    
    data.forEach((v: any) => {
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
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to list versions: ${error.message}`));
    process.exit(1);
  }
}

function parseRolloutPercentage(value?: string): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

export async function deleteVersion(
  version: string,
  options: { channel?: string; yes?: boolean; force?: boolean }
) {
  const channel = options.channel || 'stable';
  const spinner = ora(`Looking up version ${version} (${channel})...`).start();

  try {
    // Resolve version record
    const { data: versionData, error: versionError } = await supabase
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
    const { data: builds, error: buildsError } = await supabase
      .schema('application')
      .from('builds')
      .select('*')
      .eq('version_id', versionData.id);

    if (buildsError) throw buildsError;

    spinner.stop();

    // Conflict check: are any builds in other versions referencing this version as a fallback?
    const { data: dependentBuilds, error: depError } = await supabase
      .schema('application')
      .from('builds')
      .select('version_id, os, arch, type, distribution, platform_metadata')
      .filter('platform_metadata->>fallback_from', 'eq', version);

    if (depError) throw depError;

    if (dependentBuilds && dependentBuilds.length > 0) {
      console.log(chalk.red(`\n✗ Conflict: ${dependentBuilds.length} build(s) in other versions reference ${version} as a fallback:`));
      dependentBuilds.forEach((b: any) => {
        console.log(chalk.gray(`  - version_id=${b.version_id} | ${b.os}/${b.arch}/${b.type}/${b.distribution || 'direct'}`));
      });
      console.log(chalk.yellow('\n  Delete or reassign those fallback builds before deleting this version.'));
      if (!options.force) {
        process.exit(1);
      }
      console.log(chalk.yellow('  --force specified, proceeding anyway...'));
    }

    // Block deletion of published versions unless --force
    if (versionData.is_published && !options.force) {
      console.log(chalk.red(`\n✗ Version ${version} is currently published.`));
      console.log(chalk.gray('  Unpublish it first, or use --force to delete a published version.'));
      process.exit(1);
    }

    if (versionData.is_published) {
      console.log(chalk.yellow(`\n⚠ Warning: Version ${version} is published. Deleting it will break active manifests.`));
    }

    // Show summary
    console.log(chalk.bold(`\nAbout to delete:`));
    console.log(chalk.gray(`  Version : ${version} (${channel})`));
    console.log(chalk.gray(`  Builds  : ${builds?.length || 0}`));
    console.log(chalk.gray(`  Published: ${versionData.is_published ? chalk.red('yes') : 'no'}`));

    if (!options.yes) {
      const response = await prompts({
        type: 'confirm',
        name: 'confirm',
        initial: false,
        message: `Delete version ${version} and all ${builds?.length || 0} associated build(s)?`,
      });

      if (!response.confirm) {
        console.log(chalk.yellow('Deletion canceled.'));
        return;
      }
    }

    const deleteSpinner = ora('Deleting version and builds...').start();

    // Delete all builds from database first
    if (builds && builds.length > 0) {
      const { error: deleteBuildsError } = await supabase
        .schema('application')
        .from('builds')
        .delete()
        .eq('version_id', versionData.id);

      if (deleteBuildsError) throw deleteBuildsError;
    }

    // Delete the version itself
    const { error: deleteVersionError } = await supabase
      .schema('application')
      .from('versions')
      .delete()
      .eq('id', versionData.id);

    if (deleteVersionError) throw deleteVersionError;

    // Remove entire storage folder (builds + manifest.json + any leftover files)
    const storagePrefix = versionData.storage_key_prefix || `releases/${channel}/${version}`;
    deleteSpinner.text = `Removing storage folder ${storagePrefix}...`;
    try {
      await removeStorageFolder('archive', storagePrefix);
    } catch (storageError: any) {
      // Non-fatal — DB records are already cleaned up
      console.log(chalk.yellow(`\n  ⚠ Storage cleanup failed: ${storageError.message}`));
    }

    deleteSpinner.succeed(
      chalk.green(`✓ Deleted version ${version} (${channel}), ${builds?.length || 0} build(s), and storage folder`)
    );

    // Regenerate channel latest manifest if this was a published version
    if (versionData.is_published) {
      const manifestSpinner = ora(`Regenerating channel manifest for ${channel}...`).start();
      try {
        await generateLatestManifest(channel);
        manifestSpinner.succeed(chalk.green(`✓ Channel manifest regenerated for ${channel}`));
      } catch (manifestError: any) {
        manifestSpinner.warn(chalk.yellow(`⚠ Channel manifest regeneration failed: ${manifestError.message}`));
      }
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to delete version: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Recursively list and remove all files under a storage folder prefix.
 */
async function removeStorageFolder(bucket: string, prefix: string): Promise<void> {
  const { data: items, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });

  if (error) throw error;
  if (!items || items.length === 0) return;

  const filePaths: string[] = [];
  const subfolders: string[] = [];

  for (const item of items) {
    if (item.id) {
      // It's a file
      filePaths.push(`${prefix}/${item.name}`);
    } else {
      // It's a virtual folder
      subfolders.push(`${prefix}/${item.name}`);
    }
  }

  if (filePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(bucket).remove(filePaths);
    if (removeError) throw removeError;
  }

  for (const subfolder of subfolders) {
    await removeStorageFolder(bucket, subfolder);
  }
}
