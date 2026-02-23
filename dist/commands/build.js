"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBuild = uploadBuild;
exports.createBuild = createBuild;
exports.listBuilds = listBuilds;
exports.deleteBuild = deleteBuild;
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const prompts_1 = __importDefault(require("prompts"));
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const mime_types_1 = __importDefault(require("mime-types"));
const index_js_1 = require("../index.js");
const publish_js_1 = require("./publish.js");
const versioning_js_1 = require("../utils/versioning.js");
function parseFilename(filename) {
    const match = filename.match(/^spacerun-[0-9A-Za-z.+-]+-([A-Za-z0-9_]+)-([A-Za-z0-9_]+)\.(tar\.gz|zip|dmg|msi|AppImage|deb|rpm|apk)$/);
    if (!match)
        return null;
    const arch = match[1];
    const os = match[2];
    const ext = match[3];
    const type = ['tar.gz', 'zip'].includes(ext) ? 'patch' : 'installer';
    return { os, arch, type };
}
function calculateChecksum(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
        const hash = (0, crypto_1.createHash)(algorithm);
        const stream = (0, fs_1.createReadStream)(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}
function getContentType(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.msi'))
        return 'application/x-msi';
    if (lower.endsWith('.appimage'))
        return 'application/x-appimage';
    if (lower.endsWith('.dmg'))
        return 'application/x-apple-diskimage';
    if (lower.endsWith('.apk'))
        return 'application/vnd.android.package-archive';
    if (lower.endsWith('.tar.gz'))
        return 'application/gzip';
    if (lower.endsWith('.zip'))
        return 'application/zip';
    if (lower.endsWith('.rpm'))
        return 'application/octet-stream';
    if (lower.endsWith('.deb'))
        return 'application/octet-stream';
    return mime_types_1.default.lookup(filePath) || 'application/octet-stream';
}
function buildCdnUrl(baseUrl, storagePath) {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${normalizedBase}archive/${storagePath}`;
}
async function uploadBuild(version, filePath, options) {
    const spinner = (0, ora_1.default)('Uploading build...').start();
    try {
        const channel = options.channel || 'stable';
        const distribution = options.distribution || 'direct';
        if (!(0, versioning_js_1.isSupportedDistribution)(distribution)) {
            throw new Error(`Invalid distribution: ${distribution}. Supported: ${versioning_js_1.SUPPORTED_DISTRIBUTIONS.join(', ')}`);
        }
        // Get version ID
        const { data: versionData, error: versionError } = await index_js_1.supabase
            .schema('application')
            .from('versions')
            .select('id, release_channel, storage_key_prefix')
            .eq('version_name', version)
            .eq('release_channel', channel)
            .single();
        if (versionError || !versionData) {
            throw new Error(`Version ${version} (${channel}) not found`);
        }
        const filename = (0, path_1.basename)(filePath);
        const fileBuffer = (0, fs_1.readFileSync)(filePath);
        const fileSize = (0, fs_1.statSync)(filePath).size;
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
            throw new Error('Could not determine os/arch/type from filename. Please specify with --os, --arch, --type options.\n' +
                'Expected filename format: spacerun-{version}-{arch}-{os}.{ext}');
        }
        (0, versioning_js_1.assertValidPlatform)(os, arch, type);
        spinner.text = `Uploading ${filename} to storage...`;
        // Upload to storage
        const storagePrefix = versionData.storage_key_prefix || `releases/${versionData.release_channel}/${version}`;
        const storagePath = `${storagePrefix}/${os}/${arch}/${filename}`;
        const { error: uploadError } = await index_js_1.supabase.storage
            .from('archive')
            .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            upsert: true
        });
        if (uploadError)
            throw uploadError;
        spinner.text = 'Updating database...';
        // Insert/update platform build record
        const buildUrl = buildCdnUrl(index_js_1.cdnUrl, storagePath);
        const { error: dbError } = await index_js_1.supabase
            .schema('application')
            .from('builds')
            .upsert({
            version_id: versionData.id,
            os,
            arch,
            type,
            distribution,
            package_name: filename,
            url: buildUrl,
            size: fileSize,
            sha256_checksum: sha256,
            sha512_checksum: sha512
        }, {
            onConflict: 'version_id,os,arch,type,distribution'
        });
        if (dbError)
            throw dbError;
        spinner.succeed(chalk_1.default.green(`✓ Build uploaded successfully`));
        console.log(chalk_1.default.gray(`  Version: ${version}`));
        console.log(chalk_1.default.gray(`  Channel: ${versionData.release_channel}`));
        console.log(chalk_1.default.gray(`  Platform: ${os}/${arch}`));
        console.log(chalk_1.default.gray(`  Type: ${type} (${distribution})`));
        console.log(chalk_1.default.gray(`  Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`));
        console.log(chalk_1.default.gray(`  SHA256: ${sha256}`));
        console.log(chalk_1.default.gray(`  SHA512: ${sha512.substring(0, 32)}...`));
        console.log(chalk_1.default.gray(`  URL: ${buildUrl}`));
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to upload build: ${error.message}`));
        process.exit(1);
    }
}
async function createBuild(version, os, arch, type, url, options) {
    const spinner = (0, ora_1.default)('Creating build record...').start();
    try {
        const channel = options.channel || 'stable';
        const distribution = options.distribution || 'store';
        if (!(0, versioning_js_1.isSupportedDistribution)(distribution)) {
            throw new Error(`Invalid distribution: ${distribution}. Supported: ${versioning_js_1.SUPPORTED_DISTRIBUTIONS.join(', ')}`);
        }
        // Get version ID
        const { data: versionData, error: versionError } = await index_js_1.supabase
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
        (0, versioning_js_1.assertValidPlatform)(os, arch, type);
        // Generate package name if not provided
        const packageName = options.packageName || `${os}-${arch}-${type}-external`;
        spinner.text = 'Inserting build record...';
        // Insert build record
        const { error: dbError } = await index_js_1.supabase
            .schema('application')
            .from('builds')
            .upsert({
            version_id: versionData.id,
            os,
            arch,
            type,
            distribution,
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
            onConflict: 'version_id,os,arch,type,distribution'
        });
        if (dbError)
            throw dbError;
        spinner.succeed(chalk_1.default.green(`✓ Build record created successfully`));
        console.log(chalk_1.default.gray(`  Version: ${version}`));
        console.log(chalk_1.default.gray(`  Channel: ${versionData.release_channel}`));
        console.log(chalk_1.default.gray(`  Platform: ${os}/${arch}`));
        console.log(chalk_1.default.gray(`  Type: ${type} (${distribution})`));
        console.log(chalk_1.default.gray(`  Package: ${packageName}`));
        console.log(chalk_1.default.gray(`  URL: ${url}`));
        if (options.size) {
            console.log(chalk_1.default.gray(`  Size: ${(options.size / 1024 / 1024).toFixed(2)} MB`));
        }
        if (options.sha256) {
            console.log(chalk_1.default.gray(`  SHA256: ${options.sha256}`));
        }
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to create build: ${error.message}`));
        process.exit(1);
    }
}
async function listBuilds(version, options) {
    const spinner = (0, ora_1.default)(`Fetching builds for ${version}...`).start();
    try {
        const channel = options.channel || 'stable';
        const { data: versionData, error: versionError } = await index_js_1.supabase
            .schema('application')
            .from('versions')
            .select('id, release_channel')
            .eq('version_name', version)
            .eq('release_channel', channel)
            .single();
        if (versionError || !versionData) {
            throw new Error(`Version ${version} (${channel}) not found`);
        }
        const { data, error } = await index_js_1.supabase
            .schema('application')
            .from('builds')
            .select('*')
            .eq('version_id', versionData.id)
            .order('os', { ascending: true })
            .order('distribution', { ascending: true });
        if (error)
            throw error;
        spinner.stop();
        if (!data || data.length === 0) {
            console.log(chalk_1.default.yellow(`No builds found for version ${version}`));
            return;
        }
        console.log(chalk_1.default.bold(`\nBuilds for ${version} (${versionData.release_channel}):`));
        data.forEach((build) => {
            const external = build.platform_metadata?.external ? chalk_1.default.blue(' [EXTERNAL]') : '';
            const sizeMB = build.size ? (build.size / 1024 / 1024).toFixed(2) : '0.00';
            console.log(`  ${chalk_1.default.bold(`${build.os}/${build.arch}`)} (${build.type}/${build.distribution || 'direct'})${external}`);
            console.log(chalk_1.default.gray(`    Package: ${build.package_name}`));
            console.log(chalk_1.default.gray(`    Size: ${sizeMB} MB`));
            console.log(chalk_1.default.gray(`    URL: ${build.url}`));
        });
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to list builds: ${error.message}`));
        process.exit(1);
    }
}
async function deleteBuild(version, os, arch, type, options) {
    const channel = options.channel || 'stable';
    const spinner = (0, ora_1.default)(`Looking up build ${os}/${arch}/${type} for ${version} (${channel})...`).start();
    try {
        // Resolve version record
        const { data: versionData, error: versionError } = await index_js_1.supabase
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
        let query = index_js_1.supabase
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
        const { data: builds, error: buildsError } = await query;
        if (buildsError)
            throw buildsError;
        if (!builds || builds.length === 0) {
            spinner.fail(chalk_1.default.red(`No matching build found for ${os}/${arch}/${type} in ${version} (${channel})`));
            process.exit(1);
        }
        spinner.stop();
        // Conflict check: are any of these builds referenced as fallbacks by other versions?
        const { data: dependentBuilds, error: depError } = await index_js_1.supabase
            .schema('application')
            .from('builds')
            .select('version_id, os, arch, type, distribution, platform_metadata')
            .filter('platform_metadata->>fallback_from', 'eq', version);
        if (depError)
            throw depError;
        // Filter only those that match the specific os/arch/type being deleted
        const conflicts = (dependentBuilds || []).filter((b) => b.os === os && b.arch === arch && b.type === type);
        if (conflicts.length > 0) {
            console.log(chalk_1.default.red(`\n✗ Conflict: This build is referenced as a fallback by ${conflicts.length} build(s) in other versions:`));
            conflicts.forEach((b) => {
                console.log(chalk_1.default.gray(`  - version_id=${b.version_id} | ${b.os}/${b.arch}/${b.type}/${b.distribution || 'direct'}`));
            });
            console.log(chalk_1.default.yellow('\n  Delete or reassign those fallback builds before deleting this build.'));
            process.exit(1);
        }
        if (versionData.is_published) {
            console.log(chalk_1.default.yellow(`\n⚠ Warning: Version ${version} is published. Deleting a build may break active manifests.`));
        }
        // Show summary
        console.log(chalk_1.default.bold(`\nAbout to delete ${builds.length} build(s):`));
        builds.forEach((b) => {
            const external = b.platform_metadata?.external ? chalk_1.default.blue(' [EXTERNAL]') : '';
            console.log(chalk_1.default.gray(`  - ${b.os}/${b.arch}/${b.type} (${b.distribution || 'direct'})${external} — ${b.package_name}`));
        });
        if (!options.yes) {
            const response = await (0, prompts_1.default)({
                type: 'confirm',
                name: 'confirm',
                initial: false,
                message: `Delete ${builds.length} build(s) from version ${version}?`,
            });
            if (!response.confirm) {
                console.log(chalk_1.default.yellow('Deletion canceled.'));
                return;
            }
        }
        const deleteSpinner = (0, ora_1.default)(`Deleting ${builds.length} build(s)...`).start();
        for (const build of builds) {
            // Remove from CDN storage unless the build is external
            if (!build.platform_metadata?.external && build.url) {
                try {
                    const archiveMatch = build.url.match(/\/archive\/(.+)$/);
                    if (archiveMatch) {
                        await index_js_1.supabase.storage.from('archive').remove([archiveMatch[1]]);
                    }
                }
                catch {
                    // Non-fatal: continue even if storage delete fails
                }
            }
            const { error: deleteError } = await index_js_1.supabase
                .schema('application')
                .from('builds')
                .delete()
                .eq('id', build.id);
            if (deleteError)
                throw deleteError;
        }
        deleteSpinner.succeed(chalk_1.default.green(`✓ Deleted ${builds.length} build(s) from ${version} (${channel})`));
        if (versionData.is_published) {
            const regenSpinner = (0, ora_1.default)('Regenerating manifests...').start();
            try {
                await (0, publish_js_1.generateManifest)(version, { showSpinner: false, channel });
                await (0, publish_js_1.generateLatestManifest)(channel);
                regenSpinner.succeed(chalk_1.default.green(`✓ Manifests regenerated for ${channel} channel`));
            }
            catch (regenError) {
                regenSpinner.warn(chalk_1.default.yellow(`⚠ Build deleted but manifest regeneration failed: ${regenError.message}`));
                console.log(chalk_1.default.gray('  Run: publisher manifest:generate ' + version + ' --channel ' + channel));
            }
        }
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to delete build: ${error.message}`));
        process.exit(1);
    }
}
//# sourceMappingURL=build.js.map