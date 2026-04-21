"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSetupWizard = runSetupWizard;
const readline_1 = __importDefault(require("readline"));
const stream_1 = require("stream");
const config_js_1 = require("./utils/config.js");
const theme_js_1 = require("./ui/theme.js");
const box_js_1 = require("./ui/box.js");
const log_js_1 = require("./ui/log.js");
const FIELDS = [
    {
        key: 'SUPABASE_URL',
        label: 'Supabase project URL',
        hint: 'e.g. https://xxxxx.supabase.co',
        validate: (v) => /^https?:\/\//.test(v) ? null : 'Must start with http:// or https://',
    },
    {
        key: 'SUPABASE_ANON_KEY',
        label: 'Supabase anon key',
        hint: 'public anon key from project settings',
        secret: true,
    },
    {
        key: 'APP_PUBLISHER_KEY',
        label: 'App publisher key',
        hint: 'service-side publisher token',
        secret: true,
    },
    {
        key: 'CDN_URL',
        label: 'CDN URL (optional)',
        hint: 'leave blank to derive from SUPABASE_URL',
        optional: true,
    },
];
function maskedWriter(refMuted) {
    return new stream_1.Writable({
        write(chunk, _enc, cb) {
            if (refMuted.muted) {
                // swallow echoed chars; we draw a single * per keypress instead
                process.stdout.write('');
            }
            else {
                process.stdout.write(chunk);
            }
            cb();
        },
    });
}
function ask(question, opts = {}) {
    return new Promise((resolve) => {
        const muteRef = { muted: false };
        const output = opts.secret ? maskedWriter(muteRef) : process.stdout;
        const rl = readline_1.default.createInterface({
            input: process.stdin,
            output: output,
            terminal: true,
        });
        process.stdout.write(question);
        if (opts.secret)
            muteRef.muted = true;
        rl.question('', (answer) => {
            if (opts.secret) {
                muteRef.muted = false;
                process.stdout.write('\n');
            }
            rl.close();
            resolve(answer.trim() || opts.defaultValue || '');
        });
    });
}
async function runSetupWizard(opts = {}) {
    const reason = opts.reason ?? 'manual';
    const existing = (0, config_js_1.loadConfig)();
    console.log('');
    console.log((0, box_js_1.panel)(`${theme_js_1.theme.brandBold('Setup')}  ${theme_js_1.theme.muted('—')} ${reason === 'missing'
        ? theme_js_1.theme.muted('credentials are required to use Publisher CLI.')
        : theme_js_1.theme.muted('reconfigure your Publisher CLI credentials.')}\n` +
        `${theme_js_1.theme.muted('Config file:')} ${theme_js_1.theme.accent((0, config_js_1.getConfigPath)())}\n` +
        `${theme_js_1.theme.muted('Press Ctrl+C to abort.')}`, { color: theme_js_1.theme.brand, padding: 1 }));
    console.log('');
    try {
        for (const field of FIELDS) {
            const current = existing[field.key];
            const displayDefault = current
                ? field.secret
                    ? current.substring(0, 6) + '…' + current.slice(-4)
                    : current
                : '';
            const label = `${theme_js_1.theme.accent(theme_js_1.icon.prompt)} ${theme_js_1.theme.bold(field.label)}`;
            const hintLine = field.hint ? `\n  ${theme_js_1.theme.muted(field.hint)}` : '';
            const defaultLine = displayDefault ? `\n  ${theme_js_1.theme.muted('current:')} ${theme_js_1.theme.dim(displayDefault)}` : '';
            const skipLine = field.optional || current
                ? `\n  ${theme_js_1.theme.muted(current ? 'press Enter to keep current' : 'press Enter to skip')}`
                : '';
            console.log(`${label}${hintLine}${defaultLine}${skipLine}`);
            let value = '';
            while (true) {
                value = await ask(`  ${theme_js_1.theme.dim('›')} `, { secret: field.secret, defaultValue: current });
                if (!value && current) {
                    value = current;
                    break;
                }
                if (!value && field.optional)
                    break;
                if (!value) {
                    log_js_1.ui.warn('This value is required.');
                    continue;
                }
                if (field.validate) {
                    const err = field.validate(value);
                    if (err) {
                        log_js_1.ui.warn(err);
                        continue;
                    }
                }
                break;
            }
            if (value) {
                (0, config_js_1.setConfigValue)(field.key, value);
                log_js_1.ui.success(`${field.key} saved`);
            }
            else if (field.optional) {
                log_js_1.ui.hint(`${field.key} skipped`);
            }
            console.log('');
        }
        console.log((0, box_js_1.panel)(`${theme_js_1.theme.brandBold('All set!')} ${theme_js_1.theme.muted('Credentials saved to config.')}`, { color: theme_js_1.theme.brand, padding: 1 }));
        console.log('');
        return true;
    }
    catch (err) {
        log_js_1.ui.error(`Setup aborted: ${err?.message ?? err}`);
        return false;
    }
}
//# sourceMappingURL=setup.js.map