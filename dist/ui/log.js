"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ui = void 0;
const theme_js_1 = require("./theme.js");
exports.ui = {
    success(msg) {
        console.log(`${theme_js_1.theme.success(theme_js_1.icon.check)} ${msg}`);
    },
    error(msg) {
        console.error(`${theme_js_1.theme.error(theme_js_1.icon.cross)} ${msg}`);
    },
    warn(msg) {
        console.log(`${theme_js_1.theme.warn(theme_js_1.icon.warn)} ${msg}`);
    },
    info(msg) {
        console.log(`${theme_js_1.theme.info(theme_js_1.icon.info)} ${msg}`);
    },
    hint(msg) {
        console.log(`  ${theme_js_1.theme.muted(msg)}`);
    },
    blank() {
        console.log('');
    },
    heading(msg) {
        console.log(theme_js_1.theme.bold(msg));
    },
};
//# sourceMappingURL=log.js.map