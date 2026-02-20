interface UploadBuildOptions {
    os?: string;
    arch?: string;
    type?: string;
    channel?: string;
    distribution?: string;
}
export declare function uploadBuild(version: string, filePath: string, options: UploadBuildOptions): Promise<void>;
export declare function createBuild(version: string, os: string, arch: string, type: string, url: string, options: {
    size?: number;
    sha256?: string;
    sha512?: string;
    packageName?: string;
    channel?: string;
    distribution?: string;
}): Promise<void>;
export declare function listBuilds(version: string, options: {
    channel?: string;
}): Promise<void>;
export {};
//# sourceMappingURL=build.d.ts.map