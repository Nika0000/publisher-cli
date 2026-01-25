import ora from 'ora';
import chalk from 'chalk';
import { readFileSync, statSync, createReadStream } from 'fs';
import { basename } from 'path';
import { createHash } from 'crypto';
import mime from 'mime-types';
import { supabase, cdnUrl } from '../index.js';

interface UploadBuildOptions {
  os?: string;
  arch?: string;
  type?: string;
}

function parseFilename(filename: string): { os: string; arch: string; type: string } | null {
  // Expected format: spacerun-1.0.0-arm64-macos.tar.gz
  const match = filename.match(/^spacerun-[\d.]+-(\w+)-(\w+)\.(tar\.gz|zip|dmg|msi|AppImage|deb|rpm|apk)$/);
  
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

export async function uploadBuild(version: string, filePath: string, options: UploadBuildOptions) {
  const spinner = ora('Uploading build...').start();

  try {
    // Get version ID
    const { data: versionData, error: versionError } = await supabase
      .from('app_versions')
      .select('id')
      .eq('version_name', version)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} not found`);
    }

    const filename = basename(filePath);
    const fileBuffer = readFileSync(filePath);
    const fileSize = statSync(filePath).size;
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

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

    spinner.text = `Uploading ${filename} to storage...`;

    // Upload to storage
    const storagePath = `${version}/${os}/${arch}/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from('archive')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) throw uploadError;

    spinner.text = 'Updating database...';

    // Insert/update platform build record
    const buildUrl = `${cdnUrl}archive/${storagePath}`;
    const { error: dbError } = await supabase
      .from('platform_builds')
      .upsert({
        version_id: versionData.id,
        os,
        arch,
        type,
        package_name: filename,
        url: buildUrl,
        size: fileSize,
        sha256_checksum: sha256,
        sha512_checksum: sha512
      }, {
        onConflict: 'version_id,os,arch,type'
      });

    if (dbError) throw dbError;

    spinner.succeed(chalk.green(`✓ Build uploaded successfully`));
    console.log(chalk.gray(`  Version: ${version}`));
    console.log(chalk.gray(`  Platform: ${os}/${arch}`));
    console.log(chalk.gray(`  Type: ${type}`));
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
  options: { size?: number; sha256?: string; sha512?: string; packageName?: string }
) {
  const spinner = ora('Creating build record...').start();

  try {
    // Get version ID
    const { data: versionData, error: versionError } = await supabase
      .from('app_versions')
      .select('id')
      .eq('version_name', version)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} not found`);
    }

    // Validate required fields
    if (!os || !arch || !type || !url) {
      throw new Error('Missing required fields: os, arch, type, url');
    }

    // Generate package name if not provided
    const packageName = options.packageName || `${os}-${arch}-${type}-external`;

    spinner.text = 'Inserting build record...';

    // Insert build record
    const { error: dbError } = await supabase
      .from('platform_builds')
      .upsert({
        version_id: versionData.id,
        os,
        arch,
        type,
        package_name: packageName,
        url,
        size: options.size || 0,
        sha256_checksum: options.sha256 || '',
        sha512_checksum: options.sha512 || '',
        platform_metadata: {
          external: true,
          source: 'manual'
        }
      }, {
        onConflict: 'version_id,os,arch,type'
      });

    if (dbError) throw dbError;

    spinner.succeed(chalk.green(`✓ Build record created successfully`));
    console.log(chalk.gray(`  Version: ${version}`));
    console.log(chalk.gray(`  Platform: ${os}/${arch}`));
    console.log(chalk.gray(`  Type: ${type}`));
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

export async function listBuilds(version: string) {
  const spinner = ora(`Fetching builds for ${version}...`).start();

  try {
    const { data: versionData, error: versionError } = await supabase
      .from('app_versions')
      .select('id')
      .eq('version_name', version)
      .single();

    if (versionError || !versionData) {
      throw new Error(`Version ${version} not found`);
    }

    const { data, error } = await supabase
      .from('platform_builds')
      .select('*')
      .eq('version_id', versionData.id)
      .order('os', { ascending: true });

    if (error) throw error;

    spinner.stop();

    if (!data || data.length === 0) {
      console.log(chalk.yellow(`No builds found for version ${version}`));
      return;
    }

    console.log(chalk.bold(`\nBuilds for ${version}:`));
    data.forEach((build: any) => {
      const external = build.platform_metadata?.external ? chalk.blue(' [EXTERNAL]') : '';
      const sizeMB = build.size ? (build.size / 1024 / 1024).toFixed(2) : '0.00';
      console.log(`  ${chalk.bold(`${build.os}/${build.arch}`)} (${build.type})${external}`);
      console.log(chalk.gray(`    Package: ${build.package_name}`));
      console.log(chalk.gray(`    Size: ${sizeMB} MB`));
      console.log(chalk.gray(`    URL: ${build.url}`));
    });
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to list builds: ${error.message}`));
    process.exit(1);
  }
}
