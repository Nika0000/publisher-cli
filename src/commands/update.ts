import ora from 'ora';
import chalk from 'chalk';
import semver from 'semver';
import { supabase } from '../index.js';
import {
  assertValidPlatform,
  getUpdatePolicyFromVersion,
  isDeviceInRolloutBucket,
  isSupportedChannel,
  isVersionGreater,
  isWithinRolloutWindow,
  sortVersionsDesc,
  SUPPORTED_CHANNELS,
} from '../utils/versioning.js';

const appDb = () => supabase.schema('application');

interface CheckUpdateOptions {
  channel?: string;
  deviceId?: string;
  allowPrerelease?: boolean;
}

export async function checkForUpdate(
  installedVersion: string,
  os: string,
  arch: string,
  options: CheckUpdateOptions
) {
  if (!semver.valid(installedVersion)) {
    console.error(chalk.red(`❌ Invalid installed version: ${installedVersion}`));
    process.exit(1);
  }

  try {
    assertValidPlatform(os, arch);
  } catch (error: any) {
    console.error(chalk.red(`❌ ${error.message}`));
    process.exit(1);
  }

  if (options.channel && !isSupportedChannel(options.channel)) {
    console.error(chalk.red(`❌ Invalid channel: ${options.channel}`));
    console.error(chalk.gray(`   Supported channels: ${SUPPORTED_CHANNELS.join(', ')}`));
    process.exit(1);
  }

  const spinner = ora('Checking update eligibility...').start();

  try {
    const requestedChannel = options.channel || 'stable';

    const { data: versions, error } = await appDb()
      .from('versions')
      .select('*')
      .eq('is_published', true)
      .eq('release_channel', requestedChannel)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!versions || versions.length === 0) {
      spinner.stop();
      console.log(chalk.yellow('No published versions available'));
      return;
    }

    const versionIds = versions.map((version: any) => version.id);
    const { data: versionBuilds, error: buildsError } = await appDb()
      .from('builds')
      .select('*')
      .in('version_id', versionIds)
      .order('created_at', { ascending: false });

    if (buildsError) throw buildsError;

    const buildsByVersionId = new Map<string, any[]>();
    for (const build of versionBuilds || []) {
      const current = buildsByVersionId.get(build.version_id) || [];
      current.push({
        os: build.os,
        arch: build.arch,
        type: build.type,
        distribution: build.distribution,
        packageName: build.package_name,
        url: build.url,
        size: build.size,
        platformMetadata: build.platform_metadata,
        createdAt: build.created_at,
        sha256Checksum: build.sha256_checksum,
        sha512Checksum: build.sha512_checksum
      });
      buildsByVersionId.set(build.version_id, current);
    }

    const versionsWithPlatforms = versions.map((version: any) => ({
      ...version,
      platforms: buildsByVersionId.get(version.id) || []
    }));

    const orderedVersions = sortVersionsDesc(versionsWithPlatforms, (v: any) => v.version_name);
    const now = new Date();

    const eligible = orderedVersions.find((version: any) => {
      if (!isVersionGreater(version.version_name, installedVersion)) {
        return false;
      }

      if (!options.allowPrerelease && semver.prerelease(version.version_name)) {
        return false;
      }

      const policy = getUpdatePolicyFromVersion(version);

      if (!isWithinRolloutWindow(policy, now)) {
        return false;
      }

      if (!isDeviceInRolloutBucket(options.deviceId, policy.rolloutPercentage)) {
        return false;
      }

      const builds = Array.isArray(version.platforms) ? version.platforms : [];
      const hasCompatibleBuild = builds.some((build: any) =>
        build.os === os &&
        build.arch === arch &&
        (build.type === 'installer' || build.type === 'patch')
      );

      return hasCompatibleBuild;
    });

    spinner.stop();

    if (!eligible) {
      console.log(chalk.green('✓ No update required'));
      console.log(chalk.gray(`  Installed version: ${installedVersion}`));
      console.log(chalk.gray(`  Channel: ${requestedChannel}`));
      return;
    }

    const policy = getUpdatePolicyFromVersion(eligible);
    const builds = Array.isArray(eligible.platforms) ? eligible.platforms : [];
    const selectedBuild = selectPreferredBuild(builds, os, arch);

    const isMinSupportedBlocked =
      !!policy.minSupportedVersion &&
      !!semver.valid(policy.minSupportedVersion) &&
      semver.lt(installedVersion, policy.minSupportedVersion);

    const mandatory = Boolean(eligible.is_mandatory || isMinSupportedBlocked);

    console.log(chalk.bold('\nUpdate available:'));
    console.log(chalk.gray(`  Installed: ${installedVersion}`));
    console.log(chalk.gray(`  Target: ${eligible.version_name}`));
    console.log(chalk.gray(`  Channel: ${policy.channel}`));
    console.log(chalk.gray(`  Mandatory: ${mandatory ? 'yes' : 'no'}`));

    if (policy.minSupportedVersion) {
      console.log(chalk.gray(`  Min Supported: ${policy.minSupportedVersion}`));
    }

    if (selectedBuild) {
      console.log(chalk.gray(`  Build Type: ${selectedBuild.type} (${selectedBuild.distribution || 'direct'})`));
      console.log(chalk.gray(`  URL: ${selectedBuild.url}`));
      if (selectedBuild.sha256Checksum) {
        console.log(chalk.gray(`  SHA256: ${selectedBuild.sha256Checksum}`));
      }
    }

    console.log(chalk.gray(`  Release Notes: ${eligible.release_notes || 'N/A'}`));
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to check update: ${error.message}`));
    process.exit(1);
  }
}

function selectPreferredBuild(builds: any[], os: string, arch: string) {
  const candidates = builds.filter((build: any) =>
    build.os === os &&
    build.arch === arch &&
    (build.type === 'patch' || build.type === 'installer')
  );

  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => {
    const typeOrder = rankBuildType(a.type) - rankBuildType(b.type);
    if (typeOrder !== 0) {
      return typeOrder;
    }

    const distributionOrder = rankDistribution(resolveDistribution(a)) - rankDistribution(resolveDistribution(b));
    if (distributionOrder !== 0) {
      return distributionOrder;
    }

    const aTs = new Date(a.createdAt || 0).getTime();
    const bTs = new Date(b.createdAt || 0).getTime();
    return bTs - aTs;
  });

  return {
    ...sorted[0],
    distribution: resolveDistribution(sorted[0]),
  };
}

function rankBuildType(type: string): number {
  return type === 'patch' ? 0 : 1;
}

function resolveDistribution(build: any): 'direct' | 'store' {
  if (build.distribution === 'store' || build.distribution === 'direct') {
    return build.distribution;
  }

  return build.platformMetadata?.external ? 'store' : 'direct';
}

function rankDistribution(distribution: 'direct' | 'store'): number {
  return distribution === 'store' ? 0 : 1;
}