"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkForUpdate = checkForUpdate;
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const semver_1 = __importDefault(require("semver"));
const index_js_1 = require("../index.js");
const versioning_js_1 = require("../utils/versioning.js");
const appDb = () => index_js_1.supabase.schema('application');
async function checkForUpdate(installedVersion, os, arch, options) {
    if (!semver_1.default.valid(installedVersion)) {
        console.error(chalk_1.default.red(`❌ Invalid installed version: ${installedVersion}`));
        process.exit(1);
    }
    try {
        (0, versioning_js_1.assertValidPlatform)(os, arch);
    }
    catch (error) {
        console.error(chalk_1.default.red(`❌ ${error.message}`));
        process.exit(1);
    }
    if (options.channel && !(0, versioning_js_1.isSupportedChannel)(options.channel)) {
        console.error(chalk_1.default.red(`❌ Invalid channel: ${options.channel}`));
        console.error(chalk_1.default.gray(`   Supported channels: ${versioning_js_1.SUPPORTED_CHANNELS.join(', ')}`));
        process.exit(1);
    }
    const spinner = (0, ora_1.default)('Checking update eligibility...').start();
    try {
        const requestedChannel = options.channel || 'stable';
        const { data: versions, error } = await appDb()
            .from('versions')
            .select('*')
            .eq('is_published', true)
            .eq('release_channel', requestedChannel)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        if (!versions || versions.length === 0) {
            spinner.stop();
            console.log(chalk_1.default.yellow('No published versions available'));
            return;
        }
        const versionIds = versions.map((version) => version.id);
        const { data: versionBuilds, error: buildsError } = await appDb()
            .from('builds')
            .select('*')
            .in('version_id', versionIds)
            .order('created_at', { ascending: false });
        if (buildsError)
            throw buildsError;
        const buildsByVersionId = new Map();
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
        const versionsWithPlatforms = versions.map((version) => ({
            ...version,
            platforms: buildsByVersionId.get(version.id) || []
        }));
        const orderedVersions = (0, versioning_js_1.sortVersionsDesc)(versionsWithPlatforms, (v) => v.version_name);
        const now = new Date();
        const eligible = orderedVersions.find((version) => {
            if (!(0, versioning_js_1.isVersionGreater)(version.version_name, installedVersion)) {
                return false;
            }
            if (!options.allowPrerelease && semver_1.default.prerelease(version.version_name)) {
                return false;
            }
            const policy = (0, versioning_js_1.getUpdatePolicyFromVersion)(version);
            if (!(0, versioning_js_1.isWithinRolloutWindow)(policy, now)) {
                return false;
            }
            if (!(0, versioning_js_1.isDeviceInRolloutBucket)(options.deviceId, policy.rolloutPercentage)) {
                return false;
            }
            const builds = Array.isArray(version.platforms) ? version.platforms : [];
            const hasCompatibleBuild = builds.some((build) => build.os === os &&
                build.arch === arch &&
                (build.type === 'installer' || build.type === 'patch'));
            return hasCompatibleBuild;
        });
        spinner.stop();
        if (!eligible) {
            console.log(chalk_1.default.green('✓ No update required'));
            console.log(chalk_1.default.gray(`  Installed version: ${installedVersion}`));
            console.log(chalk_1.default.gray(`  Channel: ${requestedChannel}`));
            return;
        }
        const policy = (0, versioning_js_1.getUpdatePolicyFromVersion)(eligible);
        const builds = Array.isArray(eligible.platforms) ? eligible.platforms : [];
        const selectedBuild = selectPreferredBuild(builds, os, arch);
        const isMinSupportedBlocked = !!policy.minSupportedVersion &&
            !!semver_1.default.valid(policy.minSupportedVersion) &&
            semver_1.default.lt(installedVersion, policy.minSupportedVersion);
        const mandatory = Boolean(eligible.is_mandatory || isMinSupportedBlocked);
        console.log(chalk_1.default.bold('\nUpdate available:'));
        console.log(chalk_1.default.gray(`  Installed: ${installedVersion}`));
        console.log(chalk_1.default.gray(`  Target: ${eligible.version_name}`));
        console.log(chalk_1.default.gray(`  Channel: ${policy.channel}`));
        console.log(chalk_1.default.gray(`  Mandatory: ${mandatory ? 'yes' : 'no'}`));
        if (policy.minSupportedVersion) {
            console.log(chalk_1.default.gray(`  Min Supported: ${policy.minSupportedVersion}`));
        }
        if (selectedBuild) {
            console.log(chalk_1.default.gray(`  Build Type: ${selectedBuild.type} (${selectedBuild.distribution || 'direct'})`));
            console.log(chalk_1.default.gray(`  URL: ${selectedBuild.url}`));
            if (selectedBuild.sha256Checksum) {
                console.log(chalk_1.default.gray(`  SHA256: ${selectedBuild.sha256Checksum}`));
            }
        }
        console.log(chalk_1.default.gray(`  Release Notes: ${eligible.release_notes || 'N/A'}`));
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to check update: ${error.message}`));
        process.exit(1);
    }
}
function selectPreferredBuild(builds, os, arch) {
    const candidates = builds.filter((build) => build.os === os &&
        build.arch === arch &&
        (build.type === 'patch' || build.type === 'installer'));
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
function rankBuildType(type) {
    return type === 'patch' ? 0 : 1;
}
function resolveDistribution(build) {
    if (build.distribution === 'store' || build.distribution === 'direct') {
        return build.distribution;
    }
    return build.platformMetadata?.external ? 'store' : 'direct';
}
function rankDistribution(distribution) {
    return distribution === 'store' ? 0 : 1;
}
//# sourceMappingURL=update.js.map