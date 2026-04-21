import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';
import { supabase, cdnUrl } from '../index.js';
import {
  assembleVersionManifest,
  assembleChannelLatestManifest,
  manifestToXml,
  MANIFEST_FILENAME,
  MANIFEST_CONTENT_TYPE,
  Manifest,
} from '../utils/manifest.js';
import { sortVersionsDesc } from '../utils/versioning.js';

const appDb = () => supabase.schema('application');

interface ChannelOptions {
  channel?: string;
  yes?: boolean;
}

export async function publishVersion(version: string, options: ChannelOptions) {
  const channel = options.channel || 'stable';
  const spinner = ora(`Checking version ${version}...`).start();

  try {
    // Get version ID
    const { data: versionData, error: versionError } = await appDb()
      .from('versions')
      .select('id, version_name, release_channel, storage_key_prefix')
      .eq('version_name', version)
      .eq('release_channel', channel)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} (${channel}) not found`);
    }

    // Get existing builds for this version
    const { data: existingBuilds, error: buildsError } = await appDb()
      .from('builds')
      .select('os, arch, type, package_name')
      .eq('version_id', versionData.id);

    if (buildsError) throw buildsError;

    spinner.succeed(`Version ${version} found with ${existingBuilds?.length || 0} builds`);

    // required platforms (installer is required, patch is optional)
    const requiredCombinations = [
      // macOS
      { os: 'macos', arch: 'arm64', type: 'installer' },
      { os: 'macos', arch: 'x64', type: 'installer' },
      // Windows
      { os: 'windows', arch: 'x64', type: 'installer' },
      // Linux
      { os: 'linux', arch: 'x64', type: 'installer' },
      // Mobile
      { os: 'ios', arch: 'arm64', type: 'installer' },
      { os: 'android', arch: 'arm64', type: 'installer' },
    ];

    // Check for missing builds
    const missingBuilds = requiredCombinations.filter(required => {
      return !existingBuilds?.some((b: any) => 
        b.os === required.os && 
        b.arch === required.arch && 
        b.type === required.type
      );
    });

    // If there are missing builds, prompt user to select fallbacks
    if (missingBuilds.length > 0) {
      console.log(chalk.yellow(`\n⚠ Missing ${missingBuilds.length} installer build(s):`));
      missingBuilds.forEach(b => {
        console.log(chalk.gray(`  - ${b.os}/${b.arch}/${b.type}`));
      });

      console.log(chalk.blue('\nYou can assign builds from previous versions as fallbacks.'));

      const { data: channelVersions, error: channelVersionsError } = await appDb()
        .from('versions')
        .select('id, version_name')
        .eq('release_channel', channel)
        .order('created_at', { ascending: false });

      if (channelVersionsError) throw channelVersionsError;
      const channelVersionIdToName = new Map((channelVersions || []).map((v: any) => [v.id, v.version_name]));
      const channelVersionIds = (channelVersions || []).map((v: any) => v.id);
      
      for (const missing of missingBuilds) {
        if (channelVersionIds.length === 0) {
          console.log(chalk.red(`\n✗ No versions found in channel ${channel}`));
          continue;
        }

        // Find available builds for this platform combination
        const { data: availableBuilds, error: availError } = await appDb()
          .from('builds')
          .select(`
            version_id,
            os,
            arch,
            type,
            variant,
            distribution,
            package_name,
            url,
            size,
            sha256_checksum,
            sha512_checksum,
            platform_metadata
          `)
          .in('version_id', channelVersionIds)
          .eq('os', missing.os)
          .eq('arch', missing.arch)
          .eq('type', missing.type)
          .order('created_at', { ascending: false })
          .limit(10);

        if (availError) throw availError;

        if (!availableBuilds || availableBuilds.length === 0) {
          console.log(chalk.red(`\n✗ No builds found for ${missing.os}/${missing.arch}/${missing.type}`));
          console.log(chalk.gray(`  Skipping this platform...`));
          continue;
        }

        // Create choices for prompts
        const choices = availableBuilds.map((build: any) => ({
          title: `${channelVersionIdToName.get(build.version_id) || 'unknown'} - ${build.package_name}`,
          value: {
            version: channelVersionIdToName.get(build.version_id),
            package_name: build.package_name,
            ...build
          }
        }));

        choices.push({
          title: chalk.gray('Skip this platform'),
          value: null
        });

        const response = await prompts({
          type: 'select',
          name: 'build',
          message: `Select fallback build for ${chalk.bold(missing.os)}/${chalk.bold(missing.arch)}/${chalk.bold(missing.type)}:`,
          choices,
          initial: 0
        });

        if (response.build) {
          const assignSpinner = ora(`Assigning build from ${response.build.version}...`).start();

          const { error: insertError } = await appDb()
            .from('builds')
            .insert({
              version_id: versionData.id,
              os: response.build.os,
              arch: response.build.arch,
              type: response.build.type,
              variant: response.build.variant || 'default',
              distribution: response.build.distribution || 'direct',
              package_name: response.build.package_name,
              url: response.build.url,
              size: response.build.size,
              sha256_checksum: response.build.sha256_checksum,
              sha512_checksum: response.build.sha512_checksum,
              platform_metadata: {
                fallback_from: response.build.version
              }
            });

          if (insertError) {
            assignSpinner.fail(`Failed to assign build: ${insertError.message}`);
          } else {
            assignSpinner.succeed(`Assigned build from ${response.build.version}`);
          }
        } else {
          console.log(chalk.gray(`  Skipped ${missing.os}/${missing.arch}/${missing.type}`));
        }
      }
    }

    const review = await buildVersionManifest(version, channel);
    const storagePrefix = versionData.storage_key_prefix || `releases/${channel}/${version}`;

    spinner.stop();
    console.log(chalk.yellow('\n⚠ Publish Alert'));
    console.log(chalk.gray(`  Channel: ${channel}`));
    console.log(chalk.gray(`  Version Manifest: archive/${storagePrefix}/${MANIFEST_FILENAME}`));
    console.log(chalk.gray(`  Channel Manifest: archive/channels/${channel}/${MANIFEST_FILENAME}`));
    console.log(chalk.gray(`  Platforms in version manifest: ${review.manifest.platforms.length}`));
    console.log(chalk.gray(`  Mandatory: ${review.manifest.mandatory ? 'yes' : 'no'}`));

    if (!options.yes) {
      const response = await prompts({
        type: 'confirm',
        name: 'confirmPublish',
        initial: false,
        message: `Review complete. Publish ${version} to ${channel} and upload manifests?`,
      });

      if (!response.confirmPublish) {
        console.log(chalk.yellow('Publish canceled by user.'));
        return;
      }
    }

    // Now publish the version
    const publishSpinner = ora('Publishing version...').start();

    const { error: updateError } = await appDb()
      .from('versions')
      .update({ is_published: true })
      .eq('version_name', version)
      .eq('release_channel', channel);

    if (updateError) throw updateError;

    publishSpinner.text = 'Generating manifests...';

    // Generate version-specific manifest
    await generateManifest(version, { showSpinner: false, channel });

    // Generate channel-latest manifest (with latest build per platform)
    await generateLatestManifest(channel);

    publishSpinner.succeed(chalk.green(`✓ Version ${version} (${channel}) published`));
    console.log(chalk.gray(`  Manifests generated:`));
    console.log(chalk.gray(`    - archive/${storagePrefix}/${MANIFEST_FILENAME}`));
    console.log(chalk.gray(`    - archive/channels/${channel}/${MANIFEST_FILENAME}`));
  } catch (error: any) {
    console.error(chalk.red(`\nFailed to publish version: ${error.message}`));
    process.exit(1);
  }
}

export async function generateManifest(version: string, options: { showSpinner?: boolean; channel?: string } = {}) {
  const showSpinner = options.showSpinner ?? true;
  const channel = options.channel || 'stable';
  const spinner = showSpinner ? ora(`Generating manifest for ${version} (${channel})...`).start() : null;

  try {
    const { manifest, manifestPath } = await buildVersionManifest(version, channel);
    const { error: uploadError } = await supabase.storage
      .from('archive')
      .upload(manifestPath, manifestToXml(manifest), {
        contentType: MANIFEST_CONTENT_TYPE,
        upsert: true
      });

    if (uploadError) throw uploadError;

    const normalizedCdnUrl = cdnUrl.endsWith('/') ? cdnUrl : `${cdnUrl}/`;

    if (spinner) {
      spinner.succeed(chalk.green(`✓ Manifest generated for ${version}`));
      console.log(chalk.gray(`  URL: ${normalizedCdnUrl}archive/${manifestPath}`));
    }

    // Determine if this version affects the channel latest manifest.
    // It does when the version is published and is the latest published version
    // in this channel (by semantic version order).
    const { data: publishedVersions } = await appDb()
      .from('versions')
      .select('version_name')
      .eq('release_channel', channel)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (publishedVersions && publishedVersions.length > 0) {
      const sorted = sortVersionsDesc(publishedVersions, (v: any) => v.version_name);
      const latestVersionName = sorted[0]?.version_name;

      if (latestVersionName === version) {
        if (spinner) spinner.text = `Updating channel latest manifest for ${channel}...`;
        await generateLatestManifest(channel);
        if (showSpinner) {
          console.log(chalk.gray(`  Channel URL: ${normalizedCdnUrl}archive/channels/${channel}/${MANIFEST_FILENAME}`));
        }
      }
    }
  } catch (error: any) {
    if (spinner) {
      spinner.fail(chalk.red(`Failed to generate manifest: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }
}

async function buildVersionManifest(version: string, channel: string): Promise<{ manifest: Manifest; manifestPath: string }> {
  const { data: versionData, error: versionError } = await appDb()
    .from('versions')
    .select('*')
    .eq('version_name', version)
    .eq('release_channel', channel)
    .single();

  if (versionError || !versionData) {
    throw new Error(`Version ${version} (${channel}) not found`);
  }

  const { data: builds, error: buildsError } = await appDb()
    .from('builds')
    .select('*')
    .eq('version_id', versionData.id)
    .order('created_at', { ascending: false });

  if (buildsError) {
    throw buildsError;
  }

  const storagePrefix = versionData.storage_key_prefix || `releases/${channel}/${version}`;

  return {
    manifest: assembleVersionManifest(versionData, builds || []),
    manifestPath: `${storagePrefix}/${MANIFEST_FILENAME}`,
  };
}

export async function generateLatestManifest(channel: string) {
  try {
    const { data: versions, error } = await appDb()
      .from('versions')
      .select('*')
      .eq('is_published', true)
      .eq('release_channel', channel)
      .order('created_at', { ascending: false });

    if (error || !versions || versions.length === 0) {
      throw new Error('No published versions found');
    }

    const versionIds = versions.map((v: any) => v.id);
    const { data: builds, error: buildsError } = await appDb()
      .from('builds')
      .select('*')
      .in('version_id', versionIds)
      .order('created_at', { ascending: false });

    if (buildsError) throw buildsError;

    const buildsByVersionId = new Map<string, any[]>();
    for (const build of builds || []) {
      const current = buildsByVersionId.get(build.version_id) || [];
      current.push(build);
      buildsByVersionId.set(build.version_id, current);
    }

    const manifest = assembleChannelLatestManifest(versions, buildsByVersionId);

    const { error: uploadError } = await supabase.storage
      .from('archive')
      .upload(`channels/${channel}/${MANIFEST_FILENAME}`, manifestToXml(manifest), {
        contentType: MANIFEST_CONTENT_TYPE,
        upsert: true
      });

    if (uploadError) throw uploadError;

  } catch (error: any) {
    throw new Error(`Failed to generate latest manifest: ${error.message}`);
  }
}
