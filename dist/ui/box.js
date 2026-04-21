"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.panel = panel;
exports.rule = rule;
const theme_js_1 = require("./theme.js");
const BORDER = {
    tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
};
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function visibleLength(str) {
    return str.replace(ANSI_RE, '').length;
}
function pad(line, width) {
    const len = visibleLength(line);
    if (len >= width)
        return line;
    return line + ' '.repeat(width - len);
}
function panel(content, options = {}) {
    const color = options.color ?? theme_js_1.theme.brand;
    const padding = options.padding ?? 1;
    const lines = content.split('\n');
    const contentWidth = Math.max(...lines.map(visibleLength), options.title ? visibleLength(options.title) + 2 : 0);
    const innerWidth = (options.width ?? contentWidth) + padding * 2;
    const padX = ' '.repeat(padding);
    const top = options.title
        ? color(BORDER.tl) +
            color(BORDER.h) +
            ' ' + theme_js_1.theme.bold(options.title) + ' ' +
            color(BORDER.h.repeat(Math.max(0, innerWidth - visibleLength(options.title) - 3))) +
            color(BORDER.tr)
        : color(BORDER.tl + BORDER.h.repeat(innerWidth) + BORDER.tr);
    const body = lines.map(line => color(BORDER.v) + padX + pad(line, innerWidth - padding * 2) + padX + color(BORDER.v));
    const bottom = color(BORDER.bl + BORDER.h.repeat(innerWidth) + BORDER.br);
    return [top, ...body, bottom].join('\n');
}
function rule(width = 60, color = theme_js_1.theme.muted) {
    return color(BORDER.h.repeat(width));
}
//# sourceMappingURL=box.js.map