import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
const CONFIG_DIR = join(homedir(), '.spacerun-archive');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export function ensureConfigDir() {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }
}
export function loadConfig() {
    try {
        if (!existsSync(CONFIG_FILE)) {
            return {};
        }
        const content = readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        console.error(chalk.yellow('Warning: Could not load config file, using empty config'));
        return {};
    }
}
export function saveConfig(config) {
    ensureConfigDir();
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
export function getConfigValue(key) {
    const config = loadConfig();
    return config[key];
}
export function setConfigValue(key, value) {
    const config = loadConfig();
    config[key] = value;
    saveConfig(config);
}
export function deleteConfigValue(key) {
    const config = loadConfig();
    delete config[key];
    saveConfig(config);
}
export function clearConfig() {
    saveConfig({});
}
export function getConfigPath() {
    return CONFIG_FILE;
}
export function configExists() {
    return existsSync(CONFIG_FILE);
}
//# sourceMappingURL=config.js.map