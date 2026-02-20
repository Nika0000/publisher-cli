"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.deleteConfig = deleteConfig;
exports.resetConfig = resetConfig;
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const config_js_1 = require("../utils/config.js");
const VALID_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'APP_PUBLISHER_KEY', 'CDN_URL'];
async function setConfig(key, value) {
    if (!VALID_KEYS.includes(key)) {
        console.error(chalk_1.default.red(`Invalid config key: ${key}`));
        console.log(chalk_1.default.gray('Valid keys: ' + VALID_KEYS.join(', ')));
        process.exit(1);
    }
    const spinner = (0, ora_1.default)(`Setting ${key}...`).start();
    try {
        (0, config_js_1.setConfigValue)(key, value);
        spinner.succeed(chalk_1.default.green(`✓ ${key} configured`));
        console.log(chalk_1.default.gray(`  Config file: ${(0, config_js_1.getConfigPath)()}`));
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to set config: ${error.message}`));
        process.exit(1);
    }
}
async function getConfig(key) {
    try {
        if (!(0, config_js_1.configExists)()) {
            console.log(chalk_1.default.yellow('No configuration found'));
            console.log(chalk_1.default.gray(`  Expected location: ${(0, config_js_1.getConfigPath)()}`));
            console.log(chalk_1.default.gray('  Run "config:set" to configure'));
            return;
        }
        const config = (0, config_js_1.loadConfig)();
        if (key) {
            if (!VALID_KEYS.includes(key)) {
                console.error(chalk_1.default.red(`Invalid config key: ${key}`));
                console.log(chalk_1.default.gray('Valid keys: ' + VALID_KEYS.join(', ')));
                process.exit(1);
            }
            const value = config[key];
            if (value) {
                console.log(chalk_1.default.bold(key + ':'));
                // Mask sensitive values
                if (key.includes('KEY') || key.includes('SECRET')) {
                    const masked = value.substring(0, 10) + '...' + value.substring(value.length - 4);
                    console.log(chalk_1.default.gray(`  ${masked}`));
                }
                else {
                    console.log(chalk_1.default.gray(`  ${value}`));
                }
            }
            else {
                console.log(chalk_1.default.yellow(`${key} is not set`));
            }
        }
        else {
            // Show all config
            console.log(chalk_1.default.bold('Current configuration:'));
            console.log(chalk_1.default.gray(`  File: ${(0, config_js_1.getConfigPath)()}\n`));
            VALID_KEYS.forEach(k => {
                const value = config[k];
                if (value) {
                    // Mask sensitive values
                    if (k.includes('KEY') || k.includes('SECRET')) {
                        const masked = value.substring(0, 10) + '...' + value.substring(value.length - 4);
                        console.log(`  ${chalk_1.default.bold(k)}: ${chalk_1.default.gray(masked)}`);
                    }
                    else {
                        console.log(`  ${chalk_1.default.bold(k)}: ${chalk_1.default.gray(value)}`);
                    }
                }
                else {
                    console.log(`  ${chalk_1.default.bold(k)}: ${chalk_1.default.red('not set')}`);
                }
            });
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Failed to get config: ${error.message}`));
        process.exit(1);
    }
}
async function deleteConfig(key) {
    if (!VALID_KEYS.includes(key)) {
        console.error(chalk_1.default.red(`Invalid config key: ${key}`));
        console.log(chalk_1.default.gray('Valid keys: ' + VALID_KEYS.join(', ')));
        process.exit(1);
    }
    const spinner = (0, ora_1.default)(`Removing ${key}...`).start();
    try {
        (0, config_js_1.deleteConfigValue)(key);
        spinner.succeed(chalk_1.default.green(`✓ ${key} removed`));
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to delete config: ${error.message}`));
        process.exit(1);
    }
}
async function resetConfig() {
    const spinner = (0, ora_1.default)('Clearing all configuration...').start();
    try {
        (0, config_js_1.clearConfig)();
        spinner.succeed(chalk_1.default.green('✓ Configuration cleared'));
        console.log(chalk_1.default.gray(`  Config file: ${(0, config_js_1.getConfigPath)()}`));
    }
    catch (error) {
        spinner.fail(chalk_1.default.red(`Failed to reset config: ${error.message}`));
        process.exit(1);
    }
}
//# sourceMappingURL=config.js.map