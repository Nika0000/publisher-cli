import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

const CONFIG_DIR = join(homedir(), '.spacerun-archive');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface Config {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  APP_PUBLISHER_KEY?: string;
  CDN_URL?: string;
}

export function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(chalk.yellow('Warning: Could not load config file, using empty config'));
    return {};
  }
}

export function saveConfig(config: Config) {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigValue(key: keyof Config): string | undefined {
  const config = loadConfig();
  return config[key];
}

export function setConfigValue(key: keyof Config, value: string) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

export function deleteConfigValue(key: keyof Config) {
  const config = loadConfig();
  delete config[key];
  saveConfig(config);
}

export function clearConfig() {
  saveConfig({});
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}
