export interface PanelOptions {
    title?: string;
    color?: (s: string) => string;
    padding?: number;
    width?: number;
}
export declare function panel(content: string, options?: PanelOptions): string;
export declare function rule(width?: number, color?: (s: string) => string): string;
//# sourceMappingURL=box.d.ts.map