"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.icon = exports.theme = void 0;
const chalk_1 = __importDefault(require("chalk"));
exports.theme = {
    brand: chalk_1.default.hex('#a371f7'),
    brandBold: chalk_1.default.hex('#a371f7').bold,
    accent: chalk_1.default.cyan,
    muted: chalk_1.default.gray,
    dim: chalk_1.default.dim,
    success: chalk_1.default.green,
    warn: chalk_1.default.yellow,
    error: chalk_1.default.red,
    info: chalk_1.default.cyan,
    bold: chalk_1.default.bold,
    inverse: chalk_1.default.inverse,
};
exports.icon = {
    prompt: '❯',
    bullet: '•',
    arrow: '→',
    check: '✓',
    cross: '✗',
    warn: '⚠',
    info: 'ℹ',
    spark: '✦',
};
//# sourceMappingURL=theme.js.map