"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBanner = renderBanner;
exports.renderWelcome = renderWelcome;
const theme_js_1 = require("./theme.js");
const box_js_1 = require("./box.js");
const ART = [
    '  ____        _     _ _     _               ',
    ' |  _ \\ _   _| |__ | (_)___| |__   ___ _ __ ',
    ' | |_) | | | | \'_ \\| | / __| \'_ \\ / _ \\ \'__|',
    ' |  __/| |_| | |_) | | \\__ \\ | | |  __/ |   ',
    ' |_|    \\__,_|_.__/|_|_|___/_| |_|\\___|_|   ',
];
function renderBanner(version) {
    const art = ART.map(l => theme_js_1.theme.brand(l)).join('\n');
    const tagline = theme_js_1.theme.muted('  Versions • Builds • Channels • Manifests');
    const meta = `  ${theme_js_1.theme.dim('v' + version)}   ${theme_js_1.theme.dim(theme_js_1.icon.spark + ' interactive mode')}`;
    return `${art}\n${tagline}\n${meta}`;
}
function renderWelcome(version, channel) {
    const lines = [
        `${theme_js_1.theme.brandBold('Publisher CLI')}  ${theme_js_1.theme.dim('v' + version)}`,
        '',
        `${theme_js_1.theme.muted('Type a command, or')} ${theme_js_1.theme.accent('/help')} ${theme_js_1.theme.muted('to see what you can do.')}`,
        `${theme_js_1.theme.muted('Press')} ${theme_js_1.theme.accent('Tab')} ${theme_js_1.theme.muted('to autocomplete · suggestions appear as you type.')}`,
        `${theme_js_1.theme.muted('Channel context:')} ${theme_js_1.theme.accent(channel)}   ${theme_js_1.theme.muted('(change with')} ${theme_js_1.theme.accent('/channel <name>')}${theme_js_1.theme.muted(')')}`,
        `${theme_js_1.theme.muted('Exit with')} ${theme_js_1.theme.accent('/exit')} ${theme_js_1.theme.muted('or')} ${theme_js_1.theme.accent('Ctrl+D')}`,
    ].join('\n');
    return (0, box_js_1.panel)(lines, { color: theme_js_1.theme.brand, padding: 1 });
}
//# sourceMappingURL=banner.js.map