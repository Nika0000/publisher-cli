interface CreateVersionOptions {
    notes?: string;
    changelog?: string;
    mandatory?: boolean;
    channel?: string;
    minSupported?: string;
    rollout?: string;
    rolloutStartAt?: string;
    rolloutEndAt?: string;
}
export declare function createVersion(version: string, options: CreateVersionOptions): Promise<void>;
interface SetVersionPolicyOptions {
    channel?: string;
    minSupported?: string;
    rollout?: string;
    rolloutStartAt?: string;
    rolloutEndAt?: string;
}
export declare function setVersionPolicy(version: string, options: SetVersionPolicyOptions): Promise<void>;
interface ListVersionsOptions {
    published?: boolean;
    limit?: string;
    offset?: string;
    channel?: string;
}
export declare function listVersions(options: ListVersionsOptions): Promise<void>;
export declare function deleteVersion(version: string, options: {
    channel?: string;
    yes?: boolean;
    force?: boolean;
}): Promise<void>;
export {};
//# sourceMappingURL=version.d.ts.map