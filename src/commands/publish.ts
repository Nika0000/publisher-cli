import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';
import { supabase, cdnUrl } from '../index.js';

export async function publishVersion(version: string) {
  const spinner = ora(`Checking version ${version}...`).start();

  try {
    // Get version ID
    const { data: versionData, error: versionError } = await supabase
      .from('app_versions')
      .select('id, version_name')
      .eq('version_name', version)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} not found`);
    }

    // Get existing builds for this version
    const { data: existingBuilds, error: buildsError } = await supabase
      .from('platform_builds')
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

      // Get all published versions for fallback options
      const { data: allVersions, error: versionsError } = await supabase
        .from('app_versions')
        .select('id, version_name')
        .order('created_at', { ascending: false })
        .limit(20);

      if (versionsError) throw versionsError;

      console.log(chalk.blue('\nYou can assign builds from previous versions as fallbacks.'));
      
      for (const missing of missingBuilds) {
        // Find available builds for this platform combination
        const { data: availableBuilds, error: availError } = await supabase
          .from('platform_builds')
          .select(`
            version_id,
            os,
            arch,
            type,
            package_name,
            app_versions!inner(version_name)
          `)
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
          title: `${build.app_versions.version_name} - ${build.package_name}`,
          value: {
            version: build.app_versions.version_name,
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

          const { error: insertError } = await supabase
            .from('platform_builds')
            .insert({
              version_id: versionData.id,
              os: response.build.os,
              arch: response.build.arch,
              type: response.build.type,
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

    // Now publish the version
    const publishSpinner = ora('Publishing version...').start();

    const { error: updateError } = await supabase
      .from('app_versions')
      .update({ is_published: true })
      .eq('version_name', version);

    if (updateError) throw updateError;

    publishSpinner.text = 'Generating manifests...';

    // Generate version-specific manifest
    await generateManifest(version, false);

    // Generate latest manifest (with latest build per platform)
    await generateLatestManifest();

    publishSpinner.succeed(chalk.green(`✓ Version ${version} published`));
    console.log(chalk.gray(`  Manifests generated:`));
    console.log(chalk.gray(`    - archive/${version}/manifest.json`));
    console.log(chalk.gray(`    - archive/manifest.json (latest)`));
  } catch (error: any) {
    console.error(chalk.red(`\nFailed to publish version: ${error.message}`));
    process.exit(1);
  }
}

export async function generateManifest(version: string, showSpinner = true) {
  const spinner = showSpinner ? ora(`Generating manifest for ${version}...`).start() : null;

  try {
    const { data: versionData, error: versionError } = await supabase
      .from('versions_with_platforms')
      .select('*')
      .eq('version_name', version)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} not found`);
    }

    const platforms = buildPlatformsArray(versionData.platforms);

    const manifest = {
      name: 'Spacerun',
      manifestVersion: versionData.manifest_version,
      version: versionData.version_name,
      releaseDate: versionData.release_date,
      isMandatory: versionData.is_mandatory,
      releaseNotes: versionData.release_notes,
      changelog: versionData.changelog,
      platforms
    };

    const manifestPath = `${version}/manifest.json`;
    const { error: uploadError } = await supabase.storage
      .from('archive')
      .upload(manifestPath, JSON.stringify(manifest, null, 2), {
        contentType: 'application/json',
        upsert: true
      });

    if (uploadError) throw uploadError;

    if (spinner) {
      spinner.succeed(chalk.green(`✓ Manifest generated for ${version}`));
      console.log(chalk.gray(`  URL: ${cdnUrl}archive/${manifestPath}`));
    }
  } catch (error: any) {
    if (spinner) {
      spinner.fail(chalk.red(`Failed to generate manifest: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }
}

async function generateLatestManifest() {
  try {
    // Get all published versions with their builds
    const { data: versions, error } = await supabase
      .from('versions_with_platforms')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error || !versions || versions.length === 0) {
      throw new Error('No published versions found');
    }

    // Get latest version metadata (for top-level fields)
    const latestVersion = versions[0];

    // Group builds by OS and get latest per OS
    const platformMap = new Map<string, any>();

    for (const version of versions) {
      for (const build of version.platforms || []) {
        if (!platformMap.has(build.os)) {
          platformMap.set(build.os, {
            os: build.os,
            version: version.version_name,
            builds: {}
          });
        }
        
        const platform = platformMap.get(build.os)!;
        
        // Group by arch
        if (!platform.builds[build.arch]) {
          platform.builds[build.arch] = {};
        }

        // Add build
        platform.builds[build.arch][build.type] = {
          url: build.url,
          size: build.size,
          packageName: build.packageName,
          releaseDate: build.createdAt,
          type: build.type,
          sha256: build.sha256Checksum,
          sha512: build.sha512Checksum,
          ...(build.platformMetadata?.fallback_from && {
            fallbackFrom: build.platformMetadata.fallback_from
          })
        };
      }
    }

    const manifest = {
      name: 'Spacerun',
      manifestVersion: latestVersion.manifest_version,
      version: latestVersion.version_name,
      releaseDate: latestVersion.release_date,
      isMandatory: latestVersion.is_mandatory,
      releaseNotes: latestVersion.release_notes,
      changelog: latestVersion.changelog,
      platforms: Array.from(platformMap.values())
    };

    // Upload latest manifest
    const { error: uploadError } = await supabase.storage
      .from('archive')
      .upload('manifest.json', JSON.stringify(manifest, null, 2), {
        contentType: 'application/json',
        upsert: true
      });

    if (uploadError) throw uploadError;

  } catch (error: any) {
    throw new Error(`Failed to generate latest manifest: ${error.message}`);
  }
}

function buildPlatformsArray(builds: any[]): any[] {
  const platformMap = new Map<string, any>();

  for (const build of builds) {
    if (!platformMap.has(build.os)) {
      platformMap.set(build.os, {
        os: build.os,
        builds: {}
      });
    }

    const platform = platformMap.get(build.os)!;

    if (!platform.builds[build.arch]) {
      platform.builds[build.arch] = {};
    }

    platform.builds[build.arch][build.type] = {
      url: build.url,
      size: build.size,
      packageName: build.packageName,
      releaseDate: build.createdAt,
      type: build.type,
      sha256: build.sha256Checksum,
      sha512: build.sha512Checksum,
      ...(build.platformMetadata?.fallback_from && {
        fallbackFrom: build.platformMetadata.fallback_from
      }),
      ...(build.platformMetadata?.external && {
        external: build.platformMetadata.external
      })
    };
  }

  return Array.from(platformMap.values());
}
