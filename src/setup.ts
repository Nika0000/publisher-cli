import readline from 'readline';
import { Writable } from 'stream';
import { loadConfig, setConfigValue, getConfigPath } from './utils/config.js';
import { theme, icon } from './ui/theme.js';
import { panel } from './ui/box.js';
import { ui } from './ui/log.js';

interface FieldDef {
  key: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'APP_PUBLISHER_KEY' | 'CDN_URL';
  label: string;
  hint?: string;
  secret?: boolean;
  optional?: boolean;
  validate?: (v: string) => string | null;
}

const FIELDS: FieldDef[] = [
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

function maskedWriter(refMuted: { muted: boolean }): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      if (refMuted.muted) {
        // swallow echoed chars; we draw a single * per keypress instead
        process.stdout.write('');
      } else {
        process.stdout.write(chunk);
      }
      cb();
    },
  });
}

function ask(question: string, opts: { secret?: boolean; defaultValue?: string } = {}): Promise<string> {
  return new Promise((resolve) => {
    const muteRef = { muted: false };
    const output = opts.secret ? maskedWriter(muteRef) : process.stdout;
    const rl = readline.createInterface({
      input: process.stdin,
      output: output as any,
      terminal: true,
    });
    process.stdout.write(question);
    if (opts.secret) muteRef.muted = true;
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

export async function runSetupWizard(opts: { reason?: 'missing' | 'manual' } = {}): Promise<boolean> {
  const reason = opts.reason ?? 'manual';
  const existing = loadConfig();

  console.log('');
  console.log(panel(
    `${theme.brandBold('Setup')}  ${theme.muted('—')} ${reason === 'missing'
      ? theme.muted('credentials are required to use Publisher CLI.')
      : theme.muted('reconfigure your Publisher CLI credentials.')}\n` +
    `${theme.muted('Config file:')} ${theme.accent(getConfigPath())}\n` +
    `${theme.muted('Press Ctrl+C to abort.')}`,
    { color: theme.brand, padding: 1 }
  ));
  console.log('');

  try {
    for (const field of FIELDS) {
      const current = existing[field.key];
      const displayDefault = current
        ? field.secret
          ? current.substring(0, 6) + '…' + current.slice(-4)
          : current
        : '';

      const label = `${theme.accent(icon.prompt)} ${theme.bold(field.label)}`;
      const hintLine = field.hint ? `\n  ${theme.muted(field.hint)}` : '';
      const defaultLine = displayDefault ? `\n  ${theme.muted('current:')} ${theme.dim(displayDefault)}` : '';
      const skipLine = field.optional || current
        ? `\n  ${theme.muted(current ? 'press Enter to keep current' : 'press Enter to skip')}`
        : '';

      console.log(`${label}${hintLine}${defaultLine}${skipLine}`);

      let value = '';
      while (true) {
        value = await ask(`  ${theme.dim('›')} `, { secret: field.secret, defaultValue: current });

        if (!value && current) { value = current; break; }
        if (!value && field.optional) break;
        if (!value) {
          ui.warn('This value is required.');
          continue;
        }
        if (field.validate) {
          const err = field.validate(value);
          if (err) { ui.warn(err); continue; }
        }
        break;
      }

      if (value) {
        setConfigValue(field.key, value);
        ui.success(`${field.key} saved`);
      } else if (field.optional) {
        ui.hint(`${field.key} skipped`);
      }
      console.log('');
    }

    console.log(panel(
      `${theme.brandBold('All set!')} ${theme.muted('Credentials saved to config.')}`,
      { color: theme.brand, padding: 1 }
    ));
    console.log('');
    return true;
  } catch (err: any) {
    ui.error(`Setup aborted: ${err?.message ?? err}`);
    return false;
  }
}
