import ora from 'ora';
import chalk from 'chalk';
import {
  loadConfig,
  setConfigValue,
  deleteConfigValue,
  clearConfig,
  getConfigPath,
  configExists
} from '../utils/config.js';

const VALID_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'APP_PUBLISHER_KEY', 'CDN_URL'] as const;
type ConfigKey = typeof VALID_KEYS[number];

export async function setConfig(key: string, value: string) {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    console.error(chalk.red(`Invalid config key: ${key}`));
    console.log(chalk.gray('Valid keys: ' + VALID_KEYS.join(', ')));
    process.exit(1);
  }

  const spinner = ora(`Setting ${key}...`).start();

  try {
    setConfigValue(key as ConfigKey, value);
    spinner.succeed(chalk.green(`✓ ${key} configured`));
    console.log(chalk.gray(`  Config file: ${getConfigPath()}`));
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to set config: ${error.message}`));
    process.exit(1);
  }
}

export async function getConfig(key?: string) {
  try {
    if (!configExists()) {
      console.log(chalk.yellow('No configuration found'));
      console.log(chalk.gray(`  Expected location: ${getConfigPath()}`));
      console.log(chalk.gray('  Run "config:set" to configure'));
      return;
    }

    const config = loadConfig();

    if (key) {
      if (!VALID_KEYS.includes(key as ConfigKey)) {
        console.error(chalk.red(`Invalid config key: ${key}`));
        console.log(chalk.gray('Valid keys: ' + VALID_KEYS.join(', ')));
        process.exit(1);
      }

      const value = config[key as ConfigKey];
      if (value) {
        console.log(chalk.bold(key + ':'));
        // Mask sensitive values
        if (key.includes('KEY') || key.includes('SECRET')) {
          const masked = value.substring(0, 10) + '...' + value.substring(value.length - 4);
          console.log(chalk.gray(`  ${masked}`));
        } else {
          console.log(chalk.gray(`  ${value}`));
        }
      } else {
        console.log(chalk.yellow(`${key} is not set`));
      }
    } else {
      // Show all config
      console.log(chalk.bold('Current configuration:'));
      console.log(chalk.gray(`  File: ${getConfigPath()}\n`));

      VALID_KEYS.forEach(k => {
        const value = config[k];
        if (value) {
          // Mask sensitive values
          if (k.includes('KEY') || k.includes('SECRET')) {
            const masked = value.substring(0, 10) + '...' + value.substring(value.length - 4);
            console.log(`  ${chalk.bold(k)}: ${chalk.gray(masked)}`);
          } else {
            console.log(`  ${chalk.bold(k)}: ${chalk.gray(value)}`);
          }
        } else {
          console.log(`  ${chalk.bold(k)}: ${chalk.red('not set')}`);
        }
      });
    }
  } catch (error: any) {
    console.error(chalk.red(`Failed to get config: ${error.message}`));
    process.exit(1);
  }
}

export async function deleteConfig(key: string) {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    console.error(chalk.red(`Invalid config key: ${key}`));
    console.log(chalk.gray('Valid keys: ' + VALID_KEYS.join(', ')));
    process.exit(1);
  }

  const spinner = ora(`Removing ${key}...`).start();

  try {
    deleteConfigValue(key as ConfigKey);
    spinner.succeed(chalk.green(`✓ ${key} removed`));
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to delete config: ${error.message}`));
    process.exit(1);
  }
}

export async function resetConfig() {
  const spinner = ora('Clearing all configuration...').start();

  try {
    clearConfig();
    spinner.succeed(chalk.green('✓ Configuration cleared'));
    console.log(chalk.gray(`  Config file: ${getConfigPath()}`));
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to reset config: ${error.message}`));
    process.exit(1);
  }
}
