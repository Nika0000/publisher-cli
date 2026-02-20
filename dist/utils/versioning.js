import semver from 'semver';
export const SUPPORTED_OS = ['macos', 'windows', 'linux', 'ios', 'android'];
export const SUPPORTED_ARCH = ['arm64', 'x64', 'x86'];
export const SUPPORTED_BUILD_TYPES = ['patch', 'installer'];
export const SUPPORTED_CHANNELS = ['stable', 'beta', 'alpha'];
export const SUPPORTED_DISTRIBUTIONS = ['direct', 'store'];
export function isSupportedOs(value) {
    return SUPPORTED_OS.includes(value);
}
export function isSupportedArch(value) {
    return SUPPORTED_ARCH.includes(value);
}
export function isSupportedBuildType(value) {
    return SUPPORTED_BUILD_TYPES.includes(value);
}
export function isSupportedDistribution(value) {
    return SUPPORTED_DISTRIBUTIONS.includes(value);
}
export function isSupportedChannel(value) {
    return SUPPORTED_CHANNELS.includes(value);
}
export function assertValidPlatform(os, arch, type) {
    if (!isSupportedOs(os)) {
        throw new Error(`Invalid os: ${os}. Supported: ${SUPPORTED_OS.join(', ')}`);
    }
    if (!isSupportedArch(arch)) {
        throw new Error(`Invalid arch: ${arch}. Supported: ${SUPPORTED_ARCH.join(', ')}`);
    }
    if (type && !isSupportedBuildType(type)) {
        throw new Error(`Invalid type: ${type}. Supported: ${SUPPORTED_BUILD_TYPES.join(', ')}`);
    }
}
export function parseVersionMetadata(metadata) {
    const raw = typeof metadata === 'object' && metadata !== null ? metadata : {};
    const rawUpdatePolicy = typeof raw.updatePolicy === 'object' && raw.updatePolicy !== null
        ? raw.updatePolicy
        : {};
    const channel = typeof rawUpdatePolicy.channel === 'string' && isSupportedChannel(rawUpdatePolicy.channel)
        ? rawUpdatePolicy.channel
        : 'stable';
    const minSupportedVersion = typeof rawUpdatePolicy.minSupportedVersion === 'string' && semver.valid(rawUpdatePolicy.minSupportedVersion)
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
export function getUpdatePolicyFromVersion(source) {
    const metadataPolicy = parseVersionMetadata(source.metadata).updatePolicy;
    const channel = typeof source.release_channel === 'string' && isSupportedChannel(source.release_channel)
        ? source.release_channel
        : metadataPolicy.channel;
    const minSupportedVersion = typeof source.min_supported_version === 'string' && semver.valid(source.min_supported_version)
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
export function buildVersionMetadataWithPolicy(existingMetadata, policy) {
    const metadata = parseVersionMetadata(existingMetadata);
    metadata.updatePolicy = policy;
    return metadata;
}
export function validateSemverOrThrow(value, label) {
    if (!semver.valid(value)) {
        throw new Error(`Invalid semantic version for ${label}: ${value}`);
    }
}
export function isVersionGreater(candidate, current) {
    const validCandidate = semver.valid(candidate);
    const validCurrent = semver.valid(current);
    if (!validCandidate || !validCurrent) {
        return false;
    }
    return semver.gt(validCandidate, validCurrent);
}
export function sortVersionsDesc(items, pickVersion) {
    return [...items].sort((a, b) => {
        const versionA = pickVersion(a);
        const versionB = pickVersion(b);
        const validA = semver.valid(versionA);
        const validB = semver.valid(versionB);
        if (validA && validB) {
            return semver.rcompare(validA, validB);
        }
        if (validA)
            return -1;
        if (validB)
            return 1;
        return 0;
    });
}
export function isWithinRolloutWindow(policy, at) {
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
export function isDeviceInRolloutBucket(deviceId, rolloutPercentage) {
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