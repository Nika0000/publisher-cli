"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureConfigDir = ensureConfigDir;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.getConfigValue = getConfigValue;
exports.setConfigValue = setConfigValue;
exports.deleteConfigValue = deleteConfigValue;
exports.clearConfig = clearConfig;
exports.getConfigPath = getConfigPath;
exports.configExists = configExists;
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const chalk_1 = __importDefault(require("chalk"));
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), '.spacerun-archive');
const CONFIG_FILE = (0, path_1.join)(CONFIG_DIR, 'config.json');
function ensureConfigDir() {
    if (!(0, fs_1.existsSync)(CONFIG_DIR)) {
        (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
    }
}
function loadConfig() {
    try {
        if (!(0, fs_1.existsSync)(CONFIG_FILE)) {
            return {};
        }
        const content = (0, fs_1.readFileSync)(CONFIG_FILE, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        console.error(chalk_1.default.yellow('Warning: Could not load config file, using empty config'));
        return {};
    }
}
function saveConfig(config) {
    ensureConfigDir();
    (0, fs_1.writeFileSync)(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
function getConfigValue(key) {
    const config = loadConfig();
    return config[key];
}
function setConfigValue(key, value) {
    const config = loadConfig();
    config[key] = value;
    saveConfig(config);
}
function deleteConfigValue(key) {
    const config = loadConfig();
    delete config[key];
    saveConfig(config);
}
function clearConfig() {
    saveConfig({});
}
function getConfigPath() {
    return CONFIG_FILE;
}
function configExists() {
    return (0, fs_1.existsSync)(CONFIG_FILE);
}
//# sourceMappingURL=config.js.map