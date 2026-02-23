interface ChannelOptions {
    channel?: string;
    yes?: boolean;
}
export declare function publishVersion(version: string, options: ChannelOptions): Promise<void>;
export declare function generateManifest(version: string, options?: {
    showSpinner?: boolean;
    channel?: string;
}): Promise<void>;
export declare function generateLatestManifest(channel: string): Promise<void>;
export {};
//# sourceMappingURL=publish.d.ts.map