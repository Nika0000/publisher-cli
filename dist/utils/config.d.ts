interface Config {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    APP_PUBLISHER_KEY?: string;
    CDN_URL?: string;
}
export declare function ensureConfigDir(): void;
export declare function loadConfig(): Config;
export declare function saveConfig(config: Config): void;
export declare function getConfigValue(key: keyof Config): string | undefined;
export declare function setConfigValue(key: keyof Config, value: string): void;
export declare function deleteConfigValue(key: keyof Config): void;
export declare function clearConfig(): void;
export declare function getConfigPath(): string;
export declare function configExists(): boolean;
export {};
//# sourceMappingURL=config.d.ts.map