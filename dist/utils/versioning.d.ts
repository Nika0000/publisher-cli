export declare const SUPPORTED_OS: readonly ["macos", "windows", "linux", "ios", "android"];
export declare const SUPPORTED_ARCH: readonly ["arm64", "x64", "x86"];
export declare const SUPPORTED_BUILD_TYPES: readonly ["patch", "installer"];
export declare const SUPPORTED_CHANNELS: readonly ["stable", "beta", "alpha"];
export declare const SUPPORTED_DISTRIBUTIONS: readonly ["direct", "store"];
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
export declare function isSupportedOs(value: string): value is SupportedOs;
export declare function isSupportedArch(value: string): value is SupportedArch;
export declare function isSupportedBuildType(value: string): value is SupportedBuildType;
export declare function isSupportedDistribution(value: string): value is SupportedDistribution;
export declare function isSupportedChannel(value: string): value is SupportedChannel;
export declare function assertValidPlatform(os: string, arch: string, type?: string): void;
export declare function parseVersionMetadata(metadata: unknown): VersionMetadata;
export declare function getUpdatePolicyFromVersion(source: VersionPolicySource): UpdatePolicy;
export declare function buildVersionMetadataWithPolicy(existingMetadata: unknown, policy: UpdatePolicy): VersionMetadata;
export declare function validateSemverOrThrow(value: string, label: string): void;
export declare function isVersionGreater(candidate: string, current: string): boolean;
export declare function sortVersionsDesc<T>(items: T[], pickVersion: (item: T) => string): T[];
export declare function isWithinRolloutWindow(policy: UpdatePolicy, at: Date): boolean;
export declare function isDeviceInRolloutBucket(deviceId: string | undefined, rolloutPercentage: number): boolean;
//# sourceMappingURL=versioning.d.ts.map