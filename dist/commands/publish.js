import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';
import { supabase, cdnUrl } from '../index.js';
import { getUpdatePolicyFromVersion, sortVersionsDesc } from '../utils/versioning.js';
const appDb = () => supabase.schema('application');
export async function publishVersion(version, options) {
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
        if (buildsError)
            throw buildsError;
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
            return !existingBuilds?.some((b) => b.os === required.os &&
                b.arch === required.arch &&
                b.type === required.type);
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
            if (channelVersionsError)
                throw channelVersionsError;
            const channelVersionIdToName = new Map((channelVersions || []).map((v) => [v.id, v.version_name]));
            const channelVersionIds = (channelVersions || []).map((v) => v.id);
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
                if (availError)
                    throw availError;
                if (!availableBuilds || availableBuilds.length === 0) {
                    console.log(chalk.red(`\n✗ No builds found for ${missing.os}/${missing.arch}/${missing.type}`));
                    console.log(chalk.gray(`  Skipping this platform...`));
                    continue;
                }
                // Create choices for prompts
                const choices = availableBuilds.map((build) => ({
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
                    }
                    else {
                        assignSpinner.succeed(`Assigned build from ${response.build.version}`);
                    }
                }
                else {
                    console.log(chalk.gray(`  Skipped ${missing.os}/${missing.arch}/${missing.type}`));
                }
            }
        }
        const review = await buildVersionManifest(version, channel);
        const storagePrefix = versionData.storage_key_prefix || `releases/${channel}/${version}`;
        spinner.stop();
        console.log(chalk.yellow('\n⚠ Publish Alert'));
        console.log(chalk.gray(`  Channel: ${channel}`));
        console.log(chalk.gray(`  Version Manifest: archive/${storagePrefix}/manifest.json`));
        console.log(chalk.gray(`  Channel Manifest: archive/channels/${channel}/manifest.json`));
        console.log(chalk.gray(`  Platforms in version manifest: ${review.manifest.platforms.length}`));
        console.log(chalk.gray(`  Mandatory: ${review.manifest.isMandatory ? 'yes' : 'no'}`));
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
        if (updateError)
            throw updateError;
        publishSpinner.text = 'Generating manifests...';
        // Generate version-specific manifest
        await generateManifest(version, { showSpinner: false, channel });
        // Generate channel-latest manifest (with latest build per platform)
        await generateLatestManifest(channel);
        publishSpinner.succeed(chalk.green(`✓ Version ${version} (${channel}) published`));
        console.log(chalk.gray(`  Manifests generated:`));
        console.log(chalk.gray(`    - archive/${storagePrefix}/manifest.json`));
        console.log(chalk.gray(`    - archive/channels/${channel}/manifest.json`));
    }
    catch (error) {
        console.error(chalk.red(`\nFailed to publish version: ${error.message}`));
        process.exit(1);
    }
}
export async function generateManifest(version, options = {}) {
    const showSpinner = options.showSpinner ?? true;
    const channel = options.channel || 'stable';
    const spinner = showSpinner ? ora(`Generating manifest for ${version} (${channel})...`).start() : null;
    try {
        const { manifest, manifestPath } = await buildVersionManifest(version, channel);
        const { error: uploadError } = await supabase.storage
            .from('archive')
            .upload(manifestPath, JSON.stringify(manifest, null, 2), {
            contentType: 'application/json',
            upsert: true
        });
        if (uploadError)
            throw uploadError;
        if (spinner) {
            spinner.succeed(chalk.green(`✓ Manifest generated for ${version}`));
            const normalizedCdnUrl = cdnUrl.endsWith('/') ? cdnUrl : `${cdnUrl}/`;
            console.log(chalk.gray(`  URL: ${normalizedCdnUrl}archive/${manifestPath}`));
        }
    }
    catch (error) {
        if (spinner) {
            spinner.fail(chalk.red(`Failed to generate manifest: ${error.message}`));
            process.exit(1);
        }
        throw error;
    }
}
async function buildVersionManifest(version, channel) {
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
    const platforms = buildPlatformsArray((builds || []).map(mapBuildRowToPlatformPayload));
    const updatePolicy = getUpdatePolicyFromVersion(versionData);
    const storagePrefix = versionData.storage_key_prefix || `releases/${channel}/${version}`;
    const manifest = {
        name: 'App',
        manifestVersion: versionData.manifest_version,
        version: versionData.version_name,
        channel: versionData.release_channel,
        releaseDate: versionData.release_date,
        isMandatory: versionData.is_mandatory,
        releaseNotes: versionData.release_notes,
        changelog: versionData.changelog,
        updatePolicy,
        platforms
    };
    return {
        manifest,
        manifestPath: `${storagePrefix}/manifest.json`,
    };
}
async function generateLatestManifest(channel) {
    try {
        // Get all published versions
        const { data: versions, error } = await appDb()
            .from('versions')
            .select('*')
            .eq('is_published', true)
            .eq('release_channel', channel)
            .order('created_at', { ascending: false });
        if (error || !versions || versions.length === 0) {
            throw new Error('No published versions found');
        }
        const versionIds = versions.map((v) => v.id);
        const { data: builds, error: buildsError } = await appDb()
            .from('builds')
            .select('*')
            .in('version_id', versionIds)
            .order('created_at', { ascending: false });
        if (buildsError)
            throw buildsError;
        const buildsByVersionId = new Map();
        for (const build of builds || []) {
            const current = buildsByVersionId.get(build.version_id) || [];
            current.push(mapBuildRowToPlatformPayload(build));
            buildsByVersionId.set(build.version_id, current);
        }
        const versionsWithPlatforms = versions.map((version) => ({
            ...version,
            platforms: buildsByVersionId.get(version.id) || []
        }));
        // Prefer semantic version order to avoid created_at drift
        const orderedVersions = sortVersionsDesc(versionsWithPlatforms, (v) => v.version_name);
        const latestVersion = orderedVersions[0];
        const latestPolicy = getUpdatePolicyFromVersion(latestVersion);
        // Pick latest build per os/arch/type based on semantic version order
        const selectedBuildBySource = new Map();
        for (const version of orderedVersions) {
            for (const build of version.platforms || []) {
                const distribution = resolveDistribution(build);
                const comboKey = `${build.os}::${build.arch}::${build.type}::${distribution}`;
                if (!selectedBuildBySource.has(comboKey)) {
                    selectedBuildBySource.set(comboKey, {
                        ...build,
                        sourceVersion: version.version_name,
                        distribution,
                    });
                }
            }
        }
        const latestPlatforms = buildPlatformsArray(Array.from(selectedBuildBySource.values()));
        const manifest = {
            name: 'App',
            manifestVersion: latestVersion.manifest_version,
            version: latestVersion.version_name,
            channel: latestVersion.release_channel,
            releaseDate: latestVersion.release_date,
            isMandatory: latestVersion.is_mandatory,
            releaseNotes: latestVersion.release_notes,
            changelog: latestVersion.changelog,
            updatePolicy: latestPolicy,
            platforms: latestPlatforms
        };
        // Upload channel latest manifest
        const { error: uploadError } = await supabase.storage
            .from('archive')
            .upload(`channels/${channel}/manifest.json`, JSON.stringify(manifest, null, 2), {
            contentType: 'application/json',
            upsert: true
        });
        if (uploadError)
            throw uploadError;
    }
    catch (error) {
        throw new Error(`Failed to generate latest manifest: ${error.message}`);
    }
}
function buildPlatformsArray(builds) {
    const platformMap = new Map();
    for (const build of builds) {
        if (!platformMap.has(build.os)) {
            platformMap.set(build.os, {
                os: build.os,
                builds: {}
            });
        }
        const platform = platformMap.get(build.os);
        if (!platform.builds[build.arch]) {
            platform.builds[build.arch] = {};
        }
        if (!platform.builds[build.arch][build.type]) {
            platform.builds[build.arch][build.type] = {
                sources: []
            };
        }
        const typeEntry = platform.builds[build.arch][build.type];
        const distribution = resolveDistribution(build);
        const source = {
            url: build.url,
            size: build.size,
            packageName: build.packageName,
            releaseDate: build.createdAt,
            type: build.type,
            distribution,
            ...(build.sourceVersion && {
                version: build.sourceVersion
            }),
            sha256: build.sha256Checksum,
            sha512: build.sha512Checksum,
            ...(build.platformMetadata?.fallback_from && {
                fallbackFrom: build.platformMetadata.fallback_from
            }),
            ...(build.platformMetadata?.external && {
                external: build.platformMetadata.external
            })
        };
        typeEntry.sources.push(source);
    }
    // Choose primary source per build type and keep alternatives
    for (const platform of platformMap.values()) {
        for (const arch of Object.keys(platform.builds)) {
            for (const type of Object.keys(platform.builds[arch])) {
                const typeEntry = platform.builds[arch][type];
                const sortedSources = [...typeEntry.sources].sort((a, b) => {
                    const byDistribution = rankDistribution(a.distribution) - rankDistribution(b.distribution);
                    if (byDistribution !== 0) {
                        return byDistribution;
                    }
                    const aTs = new Date(a.releaseDate || 0).getTime();
                    const bTs = new Date(b.releaseDate || 0).getTime();
                    return bTs - aTs;
                });
                const primary = sortedSources[0];
                platform.builds[arch][type] = {
                    ...primary,
                    ...(sortedSources.length > 1 && { sources: sortedSources })
                };
            }
        }
    }
    return Array.from(platformMap.values());
}
function resolveDistribution(build) {
    const distribution = build.distribution;
    if (distribution === 'store' || distribution === 'direct') {
        return distribution;
    }
    return build.platformMetadata?.external ? 'store' : 'direct';
}
function rankDistribution(distribution) {
    return distribution === 'store' ? 0 : 1;
}
function mapBuildRowToPlatformPayload(build) {
    return {
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
    };
}
//# sourceMappingURL=publish.js.map