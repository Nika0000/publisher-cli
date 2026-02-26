import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';
import { readFileSync, statSync, createReadStream } from 'fs';
import { basename } from 'path';
import { createHash } from 'crypto';
import mime from 'mime-types';
import { supabase, cdnUrl } from '../index.js';
import { generateManifest, generateLatestManifest } from './publish.js';
import { assertValidPlatform, isSupportedDistribution, isValidVariant, SUPPORTED_DISTRIBUTIONS, DEFAULT_VARIANT } from '../utils/versioning.js';

interface UploadBuildOptions {
  os?: string;
  arch?: string;
  type?: string;
  channel?: string;
  distribution?: string;
  variant?: string;
}

function parseFilename(filename: string): { os: string; arch: string; type: string } | null {
  const match = filename.match(/^spacerun-[0-9A-Za-z.+-]+-([A-Za-z0-9_]+)-([A-Za-z0-9_]+)\.(tar\.gz|zip|dmg|msi|AppImage|deb|rpm|apk)$/);
  
  if (!match) return null;

  const arch = match[1];
  const os = match[2];
  const ext = match[3];

  const type = ['tar.gz', 'zip'].includes(ext) ? 'patch' : 'installer';

  return { os, arch, type };
}

function calculateChecksum(filePath: string, algorithm: 'sha256' | 'sha512' = 'sha256'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);
    
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function getContentType(filePath: string): string {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.msi')) return 'application/x-msi';
  if (lower.endsWith('.appimage')) return 'application/x-appimage';
  if (lower.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (lower.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (lower.endsWith('.tar.gz')) return 'application/gzip';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.rpm')) return 'application/octet-stream';
  if (lower.endsWith('.deb')) return 'application/octet-stream';

  return mime.lookup(filePath) || 'application/octet-stream';
}

function buildCdnUrl(baseUrl: string, storagePath: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}archive/${storagePath}`;
}

export async function uploadBuild(version: string, filePath: string, options: UploadBuildOptions) {
  const spinner = ora('Uploading build...').start();

  try {
    const channel = options.channel || 'stable';
    const distribution = options.distribution || 'direct';
    const variant = options.variant || DEFAULT_VARIANT;

    if (!isSupportedDistribution(distribution)) {
      throw new Error(`Invalid distribution: ${distribution}. Supported: ${SUPPORTED_DISTRIBUTIONS.join(', ')}`);
    }

    if (!isValidVariant(variant)) {
      throw new Error(`Invalid variant: "${variant}". Must be alphanumeric, hyphens and underscores only (max 50 chars).`);
    }

    // Get version ID
    const { data: versionData, error: versionError } = await supabase
      .schema('application')
      .from('versions')
      .select('id, release_channel, storage_key_prefix')
      .eq('version_name', version)
      .eq('release_channel', channel)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} (${channel}) not found`);
    }

    const filename = basename(filePath);
    const fileBuffer = readFileSync(filePath);
    const fileSize = statSync(filePath).size;
    const mimeType = getContentType(filePath);

    // Calculate checksums
    spinner.text = 'Calculating checksums...';
    const sha256 = await calculateChecksum(filePath, 'sha256');
    const sha512 = await calculateChecksum(filePath, 'sha512');

    // Parse filename or use options
    const parsed = parseFilename(filename);
    const os = options.os || parsed?.os;
    const arch = options.arch || parsed?.arch;
    const type = options.type || parsed?.type;

    if (!os || !arch || !type) {
      throw new Error(
        'Could not determine os/arch/type from filename. Please specify with --os, --arch, --type options.\n' +
        'Expected filename format: spacerun-{version}-{arch}-{os}.{ext}'
      );
    }

    assertValidPlatform(os, arch, type);

    spinner.text = `Uploading ${filename} to storage...`;

    // Upload to storage
    const storagePrefix = versionData.storage_key_prefix || `releases/${versionData.release_channel}/${version}`;
    const storagePath = `${storagePrefix}/${os}/${arch}/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from('archive')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) throw uploadError;

    spinner.text = 'Updating database...';

    // Insert/update platform build record
    const buildUrl = buildCdnUrl(cdnUrl, storagePath);
    const { error: dbError } = await supabase
      .schema('application')
      .from('builds')
      .upsert({
        version_id: versionData.id,
        os,
        arch,
        type,
        distribution,
        variant,
        package_name: filename,
        url: buildUrl,
        size: fileSize,
        sha256_checksum: sha256,
        sha512_checksum: sha512
      }, {
        onConflict: 'version_id,os,arch,type,distribution,variant'
      });

    if (dbError) throw dbError;

    spinner.succeed(chalk.green(`✓ Build uploaded successfully`));
    console.log(chalk.gray(`  Version: ${version}`));
    console.log(chalk.gray(`  Channel: ${versionData.release_channel}`));
    console.log(chalk.gray(`  Platform: ${os}/${arch}`));
    console.log(chalk.gray(`  Type: ${type} (${distribution}) [variant: ${variant}]`));
    console.log(chalk.gray(`  Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`));
    console.log(chalk.gray(`  SHA256: ${sha256}`));
    console.log(chalk.gray(`  SHA512: ${sha512.substring(0, 32)}...`));
    console.log(chalk.gray(`  URL: ${buildUrl}`));
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to upload build: ${error.message}`));
    process.exit(1);
  }
}

export async function createBuild(
  version: string,
  os: string,
  arch: string,
  type: string,
  url: string,
  options: { size?: number; sha256?: string; sha512?: string; packageName?: string; channel?: string; distribution?: string; variant?: string }
) {
  const spinner = ora('Creating build record...').start();

  try {
    const channel = options.channel || 'stable';
    const distribution = options.distribution || 'store';
    const variant = options.variant || DEFAULT_VARIANT;

    if (!isSupportedDistribution(distribution)) {
      throw new Error(`Invalid distribution: ${distribution}. Supported: ${SUPPORTED_DISTRIBUTIONS.join(', ')}`);
    }

    if (!isValidVariant(variant)) {
      throw new Error(`Invalid variant: "${variant}". Must be alphanumeric, hyphens and underscores only (max 50 chars).`);
    }

    // Get version ID
    const { data: versionData, error: versionError } = await supabase
      .schema('application')
      .from('versions')
      .select('id, release_channel')
      .eq('version_name', version)
      .eq('release_channel', channel)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} (${channel}) not found`);
    }

    // Validate required fields
    if (!os || !arch || !type || !url) {
      throw new Error('Missing required fields: os, arch, type, url');
    }

    assertValidPlatform(os, arch, type);

    // Generate package name if not provided
    const packageName = options.packageName || `${os}-${arch}-${type}-external`;

    spinner.text = 'Inserting build record...';

    // Insert build record
    const { error: dbError } = await supabase
      .schema('application')
      .from('builds')
      .upsert({
        version_id: versionData.id,
        os,
        arch,
        type,
        distribution,
        variant,
        package_name: packageName,
        url,
        size: options.size || 0,
        sha256_checksum: options.sha256 || '',
        sha512_checksum: options.sha512 || '',
        platform_metadata: {
          external: distribution === 'store',
          source: 'manual'
        }
      }, {
        onConflict: 'version_id,os,arch,type,distribution,variant'
      });

    if (dbError) throw dbError;

    spinner.succeed(chalk.green(`✓ Build record created successfully`));
    console.log(chalk.gray(`  Version: ${version}`));
    console.log(chalk.gray(`  Channel: ${versionData.release_channel}`));
    console.log(chalk.gray(`  Platform: ${os}/${arch}`));
    console.log(chalk.gray(`  Type: ${type} (${distribution}) [variant: ${variant}]`));
    console.log(chalk.gray(`  Package: ${packageName}`));
    console.log(chalk.gray(`  URL: ${url}`));
    if (options.size) {
      console.log(chalk.gray(`  Size: ${(options.size / 1024 / 1024).toFixed(2)} MB`));
    }
    if (options.sha256) {
      console.log(chalk.gray(`  SHA256: ${options.sha256}`));
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to create build: ${error.message}`));
    process.exit(1);
  }
}

export async function listBuilds(version: string, options: { channel?: string }) {
  const spinner = ora(`Fetching builds for ${version}...`).start();

  try {
    const channel = options.channel || 'stable';

    const { data: versionData, error: versionError } = await supabase
      .schema('application')
      .from('versions')
      .select('id, release_channel')
      .eq('version_name', version)
      .eq('release_channel', channel)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} (${channel}) not found`);
    }

    const { data, error } = await supabase
      .schema('application')
      .from('builds')
      .select('*')
      .eq('version_id', versionData.id)
      .order('os', { ascending: true })
      .order('distribution', { ascending: true });

    if (error) throw error;

    spinner.stop();

    if (!data || data.length === 0) {
      console.log(chalk.yellow(`No builds found for version ${version}`));
      return;
    }

    console.log(chalk.bold(`\nBuilds for ${version} (${versionData.release_channel}):`));
    data.forEach((build: any) => {
      const external = build.platform_metadata?.external ? chalk.blue(' [EXTERNAL]') : '';
      const sizeMB = build.size ? (build.size / 1024 / 1024).toFixed(2) : '0.00';
      const variantLabel = build.variant && build.variant !== 'default' ? chalk.cyan(` [${build.variant}]`) : '';
      console.log(`  ${chalk.bold(`${build.os}/${build.arch}`)} (${build.type}/${build.distribution || 'direct'})${variantLabel}${external}`);
      console.log(chalk.gray(`    Package: ${build.package_name}`));
      console.log(chalk.gray(`    Size: ${sizeMB} MB`));
      console.log(chalk.gray(`    URL: ${build.url}`));
    });
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to list builds: ${error.message}`));
    process.exit(1);
  }
}

export async function deleteBuild(
  version: string,
  os: string,
  arch: string,
  type: string,
  options: { channel?: string; distribution?: string; variant?: string; yes?: boolean }
) {
  const channel = options.channel || 'stable';
  const spinner = ora(`Looking up build ${os}/${arch}/${type} for ${version} (${channel})...`).start();

  try {
    // Resolve version record
    const { data: versionData, error: versionError } = await supabase
      .schema('application')
      .from('versions')
      .select('id, version_name, release_channel, is_published')
      .eq('version_name', version)
      .eq('release_channel', channel)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} (${channel}) not found`);
    }

    // Find the matching build(s)
    let query = supabase
      .schema('application')
      .from('builds')
      .select('*')
      .eq('version_id', versionData.id)
      .eq('os', os)
      .eq('arch', arch)
      .eq('type', type);

    if (options.distribution) {
      query = query.eq('distribution', options.distribution);
    }

    if (options.variant) {
      query = query.eq('variant', options.variant);
    }

    const { data: builds, error: buildsError } = await query;
    if (buildsError) throw buildsError;

    if (!builds || builds.length === 0) {
      spinner.fail(chalk.red(`No matching build found for ${os}/${arch}/${type} in ${version} (${channel})`));
      process.exit(1);
    }

    spinner.stop();

    // Conflict check: are any of these builds referenced as fallbacks by other versions?
    const { data: dependentBuilds, error: depError } = await supabase
      .schema('application')
      .from('builds')
      .select('version_id, os, arch, type, distribution, platform_metadata')
      .filter('platform_metadata->>fallback_from', 'eq', version);

    if (depError) throw depError;

    // Filter only those that match the specific os/arch/type being deleted
    const conflicts = (dependentBuilds || []).filter((b: any) =>
      b.os === os && b.arch === arch && b.type === type
    );

    if (conflicts.length > 0) {
      console.log(chalk.red(`\n✗ Conflict: This build is referenced as a fallback by ${conflicts.length} build(s) in other versions:`));
      conflicts.forEach((b: any) => {
        console.log(chalk.gray(`  - version_id=${b.version_id} | ${b.os}/${b.arch}/${b.type}/${b.distribution || 'direct'}`));
      });
      console.log(chalk.yellow('\n  Delete or reassign those fallback builds before deleting this build.'));
      process.exit(1);
    }

    if (versionData.is_published) {
      console.log(chalk.yellow(`\n⚠ Warning: Version ${version} is published. Deleting a build may break active manifests.`));
    }

    // Show summary
    console.log(chalk.bold(`\nAbout to delete ${builds.length} build(s):`));
    builds.forEach((b: any) => {
      const external = b.platform_metadata?.external ? chalk.blue(' [EXTERNAL]') : '';
      console.log(chalk.gray(`  - ${b.os}/${b.arch}/${b.type} (${b.distribution || 'direct'})${external} — ${b.package_name}`));
    });

    if (!options.yes) {
      const response = await prompts({
        type: 'confirm',
        name: 'confirm',
        initial: false,
        message: `Delete ${builds.length} build(s) from version ${version}?`,
      });

      if (!response.confirm) {
        console.log(chalk.yellow('Deletion canceled.'));
        return;
      }
    }

    const deleteSpinner = ora(`Deleting ${builds.length} build(s)...`).start();

    for (const build of builds) {
      // Remove from CDN storage unless the build is external
      if (!build.platform_metadata?.external && build.url) {
        try {
          const archiveMatch = build.url.match(/\/archive\/(.+)$/);
          if (archiveMatch) {
            await supabase.storage.from('archive').remove([archiveMatch[1]]);
          }
        } catch {
          // Non-fatal: continue even if storage delete fails
        }
      }

      const { error: deleteError } = await supabase
        .schema('application')
        .from('builds')
        .delete()
        .eq('id', build.id);

      if (deleteError) throw deleteError;
    }

    deleteSpinner.succeed(chalk.green(`✓ Deleted ${builds.length} build(s) from ${version} (${channel})`));

    if (versionData.is_published) {
      const regenSpinner = ora('Regenerating manifests...').start();
      try {
        await generateManifest(version, { showSpinner: false, channel });
        await generateLatestManifest(channel);
        regenSpinner.succeed(chalk.green(`✓ Manifests regenerated for ${channel} channel`));
      } catch (regenError: any) {
        regenSpinner.warn(chalk.yellow(`⚠ Build deleted but manifest regeneration failed: ${regenError.message}`));
        console.log(chalk.gray('  Run: publisher manifest:generate ' + version + ' --channel ' + channel));
      }
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to delete build: ${error.message}`));
    process.exit(1);
  }
}
