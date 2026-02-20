interface CheckUpdateOptions {
    channel?: string;
    deviceId?: string;
    allowPrerelease?: boolean;
}
export declare function checkForUpdate(installedVersion: string, os: string, arch: string, options: CheckUpdateOptions): Promise<void>;
export {};
//# sourceMappingURL=update.d.ts.map