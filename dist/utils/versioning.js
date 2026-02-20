"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_DISTRIBUTIONS = exports.SUPPORTED_CHANNELS = exports.SUPPORTED_BUILD_TYPES = exports.SUPPORTED_ARCH = exports.SUPPORTED_OS = void 0;
exports.isSupportedOs = isSupportedOs;
exports.isSupportedArch = isSupportedArch;
exports.isSupportedBuildType = isSupportedBuildType;
exports.isSupportedDistribution = isSupportedDistribution;
exports.isSupportedChannel = isSupportedChannel;
exports.assertValidPlatform = assertValidPlatform;
exports.parseVersionMetadata = parseVersionMetadata;
exports.getUpdatePolicyFromVersion = getUpdatePolicyFromVersion;
exports.buildVersionMetadataWithPolicy = buildVersionMetadataWithPolicy;
exports.validateSemverOrThrow = validateSemverOrThrow;
exports.isVersionGreater = isVersionGreater;
exports.sortVersionsDesc = sortVersionsDesc;
exports.isWithinRolloutWindow = isWithinRolloutWindow;
exports.isDeviceInRolloutBucket = isDeviceInRolloutBucket;
const semver_1 = __importDefault(require("semver"));
exports.SUPPORTED_OS = ['macos', 'windows', 'linux', 'ios', 'android'];
exports.SUPPORTED_ARCH = ['arm64', 'x64', 'x86'];
exports.SUPPORTED_BUILD_TYPES = ['patch', 'installer'];
exports.SUPPORTED_CHANNELS = ['stable', 'beta', 'alpha'];
exports.SUPPORTED_DISTRIBUTIONS = ['direct', 'store'];
function isSupportedOs(value) {
    return exports.SUPPORTED_OS.includes(value);
}
function isSupportedArch(value) {
    return exports.SUPPORTED_ARCH.includes(value);
}
function isSupportedBuildType(value) {
    return exports.SUPPORTED_BUILD_TYPES.includes(value);
}
function isSupportedDistribution(value) {
    return exports.SUPPORTED_DISTRIBUTIONS.includes(value);
}
function isSupportedChannel(value) {
    return exports.SUPPORTED_CHANNELS.includes(value);
}
function assertValidPlatform(os, arch, type) {
    if (!isSupportedOs(os)) {
        throw new Error(`Invalid os: ${os}. Supported: ${exports.SUPPORTED_OS.join(', ')}`);
    }
    if (!isSupportedArch(arch)) {
        throw new Error(`Invalid arch: ${arch}. Supported: ${exports.SUPPORTED_ARCH.join(', ')}`);
    }
    if (type && !isSupportedBuildType(type)) {
        throw new Error(`Invalid type: ${type}. Supported: ${exports.SUPPORTED_BUILD_TYPES.join(', ')}`);
    }
}
function parseVersionMetadata(metadata) {
    const raw = typeof metadata === 'object' && metadata !== null ? metadata : {};
    const rawUpdatePolicy = typeof raw.updatePolicy === 'object' && raw.updatePolicy !== null
        ? raw.updatePolicy
        : {};
    const channel = typeof rawUpdatePolicy.channel === 'string' && isSupportedChannel(rawUpdatePolicy.channel)
        ? rawUpdatePolicy.channel
        : 'stable';
    const minSupportedVersion = typeof rawUpdatePolicy.minSupportedVersion === 'string' && semver_1.default.valid(rawUpdatePolicy.minSupportedVersion)
        ? rawUpdatePolicy.minSupportedVersion
        : undefined;
    const rolloutPercentage = typeof rawUpdatePolicy.rolloutPercentage === 'number'
        ? clamp(rawUpdatePolicy.rolloutPercentage, 0, 100)
        : 100;
    const rolloutStartAt = typeof rawUpdatePolicy.rolloutStartAt === 'string'
        ? rawUpdatePolicy.rolloutStartAt
        : undefined;
    const rolloutEndAt = typeof rawUpdatePolicy.rolloutEndAt === 'string'
        ? rawUpdatePolicy.rolloutEndAt
        : undefined;
    return {
        ...raw,
        updatePolicy: {
            channel,
            minSupportedVersion,
            rolloutPercentage,
            rolloutStartAt,
            rolloutEndAt,
        },
    };
}
function getUpdatePolicyFromVersion(source) {
    const metadataPolicy = parseVersionMetadata(source.metadata).updatePolicy;
    const channel = typeof source.release_channel === 'string' && isSupportedChannel(source.release_channel)
        ? source.release_channel
        : metadataPolicy.channel;
    const minSupportedVersion = typeof source.min_supported_version === 'string' && semver_1.default.valid(source.min_supported_version)
        ? source.min_supported_version
        : metadataPolicy.minSupportedVersion;
    const rolloutPercentage = typeof source.rollout_percentage === 'number'
        ? clamp(source.rollout_percentage, 0, 100)
        : metadataPolicy.rolloutPercentage;
    const rolloutStartAt = normalizeDateLike(source.rollout_start_at) || metadataPolicy.rolloutStartAt;
    const rolloutEndAt = normalizeDateLike(source.rollout_end_at) || metadataPolicy.rolloutEndAt;
    return {
        channel,
        minSupportedVersion,
        rolloutPercentage,
        rolloutStartAt,
        rolloutEndAt,
    };
}
function buildVersionMetadataWithPolicy(existingMetadata, policy) {
    const metadata = parseVersionMetadata(existingMetadata);
    metadata.updatePolicy = policy;
    return metadata;
}
function validateSemverOrThrow(value, label) {
    if (!semver_1.default.valid(value)) {
        throw new Error(`Invalid semantic version for ${label}: ${value}`);
    }
}
function isVersionGreater(candidate, current) {
    const validCandidate = semver_1.default.valid(candidate);
    const validCurrent = semver_1.default.valid(current);
    if (!validCandidate || !validCurrent) {
        return false;
    }
    return semver_1.default.gt(validCandidate, validCurrent);
}
function sortVersionsDesc(items, pickVersion) {
    return [...items].sort((a, b) => {
        const versionA = pickVersion(a);
        const versionB = pickVersion(b);
        const validA = semver_1.default.valid(versionA);
        const validB = semver_1.default.valid(versionB);
        if (validA && validB) {
            return semver_1.default.rcompare(validA, validB);
        }
        if (validA)
            return -1;
        if (validB)
            return 1;
        return 0;
    });
}
function isWithinRolloutWindow(policy, at) {
    if (policy.rolloutStartAt) {
        const start = new Date(policy.rolloutStartAt);
        if (!Number.isNaN(start.getTime()) && at < start) {
            return false;
        }
    }
    if (policy.rolloutEndAt) {
        const end = new Date(policy.rolloutEndAt);
        if (!Number.isNaN(end.getTime()) && at > end) {
            return false;
        }
    }
    return true;
}
function isDeviceInRolloutBucket(deviceId, rolloutPercentage) {
    if (rolloutPercentage >= 100) {
        return true;
    }
    if (rolloutPercentage <= 0 || !deviceId) {
        return false;
    }
    const hash = Array.from(deviceId).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) % 1000, 0);
    const bucket = hash % 100;
    return bucket < rolloutPercentage;
}
function clamp(value, min, max) {
    if (value < min)
        return min;
    if (value > max)
        return max;
    return value;
}
function normalizeDateLike(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }
    return undefined;
}
//# sourceMappingURL=versioning.js.map