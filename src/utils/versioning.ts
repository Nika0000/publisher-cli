import semver from 'semver';

export const SUPPORTED_OS = ['macos', 'windows', 'linux', 'ios', 'android'] as const;
export const SUPPORTED_ARCH = ['arm64', 'x64', 'x86'] as const;
export const SUPPORTED_BUILD_TYPES = ['patch', 'installer'] as const;
export const SUPPORTED_CHANNELS = ['stable', 'beta', 'alpha'] as const;
export const SUPPORTED_DISTRIBUTIONS = ['direct', 'store'] as const;

export type SupportedOs = typeof SUPPORTED_OS[number];
export type SupportedArch = typeof SUPPORTED_ARCH[number];
export type SupportedBuildType = typeof SUPPORTED_BUILD_TYPES[number];
export type SupportedChannel = typeof SUPPORTED_CHANNELS[number];
export type SupportedDistribution = typeof SUPPORTED_DISTRIBUTIONS[number];

export interface UpdatePolicy {
  channel: SupportedChannel;
  minSupportedVersion?: string;
  rolloutPercentage: number;
  rolloutStartAt?: string;
  rolloutEndAt?: string;
}

export interface VersionMetadata {
  updatePolicy: UpdatePolicy;
  [key: string]: unknown;
}

export interface VersionPolicySource {
  metadata?: unknown;
  release_channel?: unknown;
  min_supported_version?: unknown;
  rollout_percentage?: unknown;
  rollout_start_at?: unknown;
  rollout_end_at?: unknown;
}

export function isSupportedOs(value: string): value is SupportedOs {
  return SUPPORTED_OS.includes(value as SupportedOs);
}

export function isSupportedArch(value: string): value is SupportedArch {
  return SUPPORTED_ARCH.includes(value as SupportedArch);
}

export function isSupportedBuildType(value: string): value is SupportedBuildType {
  return SUPPORTED_BUILD_TYPES.includes(value as SupportedBuildType);
}

export function isSupportedDistribution(value: string): value is SupportedDistribution {
  return SUPPORTED_DISTRIBUTIONS.includes(value as SupportedDistribution);
}

export function isSupportedChannel(value: string): value is SupportedChannel {
  return SUPPORTED_CHANNELS.includes(value as SupportedChannel);
}

export function assertValidPlatform(os: string, arch: string, type?: string): void {
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

export function parseVersionMetadata(metadata: unknown): VersionMetadata {
  const raw = typeof metadata === 'object' && metadata !== null ? metadata as Record<string, unknown> : {};
  const rawUpdatePolicy = typeof raw.updatePolicy === 'object' && raw.updatePolicy !== null
    ? raw.updatePolicy as Record<string, unknown>
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

export function getUpdatePolicyFromVersion(source: VersionPolicySource): UpdatePolicy {
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

export function buildVersionMetadataWithPolicy(existingMetadata: unknown, policy: UpdatePolicy): VersionMetadata {
  const metadata = parseVersionMetadata(existingMetadata);
  metadata.updatePolicy = policy;
  return metadata;
}

export function validateSemverOrThrow(value: string, label: string): void {
  if (!semver.valid(value)) {
    throw new Error(`Invalid semantic version for ${label}: ${value}`);
  }
}

export function isVersionGreater(candidate: string, current: string): boolean {
  const validCandidate = semver.valid(candidate);
  const validCurrent = semver.valid(current);

  if (!validCandidate || !validCurrent) {
    return false;
  }

  return semver.gt(validCandidate, validCurrent);
}

export function sortVersionsDesc<T>(items: T[], pickVersion: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const versionA = pickVersion(a);
    const versionB = pickVersion(b);
    const validA = semver.valid(versionA);
    const validB = semver.valid(versionB);

    if (validA && validB) {
      return semver.rcompare(validA, validB);
    }

    if (validA) return -1;
    if (validB) return 1;
    return 0;
  });
}

export function isWithinRolloutWindow(policy: UpdatePolicy, at: Date): boolean {
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

export function isDeviceInRolloutBucket(deviceId: string | undefined, rolloutPercentage: number): boolean {
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

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeDateLike(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return undefined;
}