export declare const MANIFEST_SCHEMA_VERSION = 2;
export declare const MANIFEST_FILENAME = "manifest.xml";
export declare const MANIFEST_CONTENT_TYPE = "application/xml";
export type Channel = 'stable' | 'beta' | 'alpha';
export type Distribution = 'direct' | 'store';
export type BuildType = 'installer' | 'patch';
export interface UpdatePolicy {
    channel: Channel | string;
    rolloutPercentage: number;
    minSupportedVersion?: string | null;
    rolloutStartAt?: string | null;
    rolloutEndAt?: string | null;
}
export interface BuildSource {
    url: string;
    size?: number | null;
    packageName?: string | null;
    releaseDate: string;
    type: BuildType;
    distribution: Distribution;
    version?: string | null;
    sha256?: string | null;
    sha512?: string | null;
    fallbackFrom?: string | null;
    external?: boolean;
}
export interface BuildEntry extends BuildSource {
    sources?: BuildSource[];
}
export interface VariantEntry {
    name: string;
    builds: Partial<Record<BuildType, BuildEntry>>;
}
export interface ArchEntry {
    name: string;
    variants: VariantEntry[];
}
export interface PlatformEntry {
    os: string;
    archs: ArchEntry[];
}
export interface Manifest {
    schemaVersion: number;
    name: string;
    version: string;
    channel: string;
    releaseDate: string;
    mandatory: boolean;
    releaseNotes?: string | null;
    changelog?: string | null;
    updatePolicy: UpdatePolicy;
    platforms: PlatformEntry[];
}
interface RawBuild {
    os: string;
    arch: string;
    type: BuildType;
    variant?: string | null;
    distribution?: string | null;
    packageName?: string | null;
    url: string;
    size?: number | null;
    platformMetadata?: {
        fallback_from?: string;
        external?: boolean;
    } | null;
    createdAt: string;
    sha256Checksum?: string | null;
    sha512Checksum?: string | null;
    sourceVersion?: string;
}
export declare function mapBuildRow(build: any): RawBuild;
export declare function buildPlatforms(rawBuilds: RawBuild[]): PlatformEntry[];
export declare function assembleVersionManifest(versionData: any, builds: any[]): Manifest;
export declare function assembleChannelLatestManifest(versions: any[], buildsByVersionId: Map<string, any[]>): Manifest;
export declare function manifestToXml(manifest: Manifest): string;
export {};
//# sourceMappingURL=manifest.d.ts.map