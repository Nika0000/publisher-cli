import readline from 'readline';
import { Command } from 'commander';
import semver from 'semver';
import { theme, icon } from './ui/theme.js';
import { panel } from './ui/box.js';
import { renderBanner, renderWelcome } from './ui/banner.js';
import { ui } from './ui/log.js';
import { runSetupWizard } from './setup.js';

interface ReplState {
  channel: string;
  version: string | null;
  reinitSupabase?: () => boolean;
}

const SLASH_COMMANDS = ['/help', '/channel', '/version', '/clear', '/setup', '/config', '/exit', '/quit'];
const CHANNELS = ['stable', 'beta', 'alpha'];

const COMMAND_GROUPS: Record<string, string[]> = {
  version: ['create', 'list', 'policy', 'delete'],
  build: ['upload', 'create', 'list', 'delete'],
  publish: [],
  manifest: ['generate'],
  update: ['check'],
  config: ['set', 'get', 'delete', 'reset'],
};

// Capture once at module load so close handlers always have the real exit
// even if a runCommand override is still in flight.
const ORIGINAL_PROCESS_EXIT = process.exit.bind(process);

class ReplExitError extends Error {
  constructor(public code: number) {
    super(`exit:${code}`);
  }
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (const ch of input) {
    if (escape) {
      buf += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function injectChannel(args: string[], channel: string): string[] {
  if (args.includes('--channel')) return args;
  return [...args, '--channel', channel];
}

function injectVersion(args: string[], command: string, version: string): string[] {
  const cmdsWithVersionArg = [
    'version:create', 'version:policy', 'version:delete',
    'build:upload', 'build:create', 'build:list', 'build:delete',
    'publish', 'manifest:generate',
  ];
  if (!cmdsWithVersionArg.includes(command)) return args;
  // Skip injection if the user already passed a semver as the first positional
  const afterCmd = args.slice(1);
  const firstPositional = afterCmd.find(a => !a.startsWith('-'));
  if (firstPositional && semver.valid(firstPositional)) return args;
  // Prepend the version context as the first positional arg
  return [args[0], version, ...args.slice(1)];
}

function resolveSlashCommand(tokens: string[]): string[] {
  // Convert "/build list 1.0.0" → "build:list 1.0.0"
  // Convert "/publish 1.0.0" → "publish 1.0.0"
  const group = tokens[0];
  if (!(group in COMMAND_GROUPS)) return tokens;
  const subcommands = COMMAND_GROUPS[group];
  if (subcommands.length === 0) {
    // Group itself is the command (e.g. "publish")
    return tokens;
  }
  const sub = tokens[1];
  if (sub && subcommands.includes(sub)) {
    return [`${group}:${sub}`, ...tokens.slice(2)];
  }
  return tokens;
}

async function runCommand(program: Command, argv: string[]): Promise<void> {
  const originalExit = process.exit;
  (process as any).exit = (code?: number) => {
    throw new ReplExitError(code ?? 0);
  };
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err: any) {
    if (err instanceof ReplExitError) {
      if (err.code !== 0) {
        ui.hint(`exit code ${err.code}`);
      }
      return;
    }
    if (err && err.code && typeof err.code === 'string' && err.code.startsWith('commander.')) {
      // commander already printed help/version/error
      return;
    }
    ui.error(err?.message ?? String(err));
  } finally {
    (process as any).exit = originalExit;
  }
}

function printHelp(state: ReplState) {
  const versionCtx = state.version ? theme.accent(state.version) : theme.muted('none');
  const slash = [
    [`/help`, 'Show this help'],
    [`/channel <name>`, `Set channel context (currently: ${state.channel})`],
    [`/version <ver>`, `Set version context (currently: ${versionCtx})`],
    [`/version clear`, 'Clear version context'],
    [`/setup`, 'Configure Supabase credentials interactively'],
    [`/clear`, 'Clear the screen'],
    [`/exit`, 'Exit interactive mode'],
  ];
  const cmds = [
    ['/version create <ver>', 'Create a new version'],
    ['/version list', 'List versions'],
    ['/version policy <ver>', 'Update release policy'],
    ['/version delete <ver>', 'Delete a version and its builds'],
    ['/build upload <ver> <file>', 'Upload a build artifact'],
    ['/build create <ver> <os> <arch> <type> <url>', 'Register an external build'],
    ['/build list <ver>', 'List builds for a version'],
    ['/build delete <ver> <os> <arch> <type>', 'Delete a build'],
    ['/publish <ver>', 'Publish a version and generate manifests'],
    ['/manifest generate <ver>', 'Regenerate the version manifest'],
    ['/update check <installed> <os> <arch>', 'Check if an update is available'],
    ['/config get | set | delete | reset', 'Manage CLI config'],
  ];

  const fmtTable = (rows: string[][]) => {
    const w = Math.max(...rows.map(r => r[0].length));
    return rows
      .map(([cmd, desc]) => `  ${theme.accent(cmd.padEnd(w))}  ${theme.muted(desc)}`)
      .join('\n');
  };

  ui.blank();
  ui.heading('Slash commands');
  console.log(fmtTable(slash));
  ui.blank();
  ui.heading('Publisher commands');
  console.log(fmtTable(cmds));
  ui.blank();
  ui.hint('Tip: --channel is auto-applied from your channel context unless you pass it explicitly.');
  ui.hint('Tip: version context auto-fills <ver> when set. Use /version <ver> to set it.');
  ui.hint('Tip: use slash style (/build list) or colon style (build:list) — both work.');
  ui.blank();
}

function buildPrompt(state: ReplState): string {
  const parts = [state.channel];
  if (state.version) parts.push(state.version);
  return `${theme.brand(icon.prompt)} ${theme.dim('[' + parts.join(':') + ']')} `;
}

function handleSlash(line: string, state: ReplState): { handled: boolean; exit?: boolean; async?: Promise<void> } {
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  switch (cmd) {
    case 'help':
    case '?':
      printHelp(state);
      return { handled: true };
    case 'exit':
    case 'quit':
    case 'q':
      return { handled: true, exit: true };
    case 'clear':
    case 'cls':
      console.clear();
      return { handled: true };
    case 'setup': {
      const async = (async () => {
        const ok = await runSetupWizard({ reason: 'manual' });
        if (ok && state.reinitSupabase) {
          const ready = state.reinitSupabase();
          if (ready) ui.success('Credentials reloaded — you\'re ready to go.');
        }
      })();
      return { handled: true, async };
    }
    case 'config': {
      const sub = rest[0];
      if (sub && COMMAND_GROUPS['config'].includes(sub)) {
        return { handled: false };
      }
      // No subcommand — launch setup wizard
      const async = (async () => {
        const ok = await runSetupWizard({ reason: 'manual' });
        if (ok && state.reinitSupabase) {
          const ready = state.reinitSupabase();
          if (ready) ui.success('Credentials reloaded — you\'re ready to go.');
        }
      })();
      return { handled: true, async };
    }
    case 'channel': {
      const next = rest[0];
      if (!next) {
        ui.warn('Usage: /channel <stable|beta|alpha>');
        return { handled: true };
      }
      if (!['stable', 'beta', 'alpha'].includes(next)) {
        ui.error(`Unknown channel: ${next}`);
        ui.hint('Supported: stable, beta, alpha');
        return { handled: true };
      }
      state.channel = next;
      ui.success(`Channel context set to ${theme.accent(next)}`);
      return { handled: true };
    }
    case 'version': {
      const next = rest[0];
      if (!next) {
        if (state.version) {
          ui.info(`Current version context: ${theme.accent(state.version)}`);
          ui.hint('Usage: /version <semver> or /version clear');
        } else {
          ui.warn('No version context set.');
          ui.hint('Usage: /version <semver> — sets version context so you don\'t have to pass it every time.');
        }
        return { handled: true };
      }
      // If next word is a known subcommand, fall through to command routing
      if (COMMAND_GROUPS['version'].includes(next)) {
        return { handled: false };
      }
      if (next === 'clear' || next === 'none' || next === 'reset') {
        state.version = null;
        ui.success('Version context cleared.');
        return { handled: true };
      }
      state.version = next;
      ui.success(`Version context set to ${theme.accent(next)}`);
      ui.hint('Commands that need a version will use this automatically. Pass one explicitly to override.');
      return { handled: true };
    }
    default:
      // Check if this is a command-style slash (e.g. /build list, /publish 1.0.0)
      if (cmd && cmd in COMMAND_GROUPS) {
        return { handled: false };
      }
      ui.error(`Unknown slash command: /${cmd}`);
      ui.hint('Type /help for a list.');
      return { handled: true };
  }
}

function getSuggestions(line: string, program: Command): string[] {
  if (!line) return [];

  const commandNames = program.commands
    .map(c => c.name())
    .filter(n => n !== 'chat' && n !== 'interactive')
    .sort();

  if (line.startsWith('/')) {
    if (line.startsWith('/channel ')) {
      const partial = line.slice('/channel '.length);
      return CHANNELS.filter(c => c.startsWith(partial)).map(c => '/channel ' + c);
    }
    // Suggest subcommands for groups: /build → /build list, /build upload, etc.
    for (const [group, subs] of Object.entries(COMMAND_GROUPS)) {
      const prefix = `/${group} `;
      if (line.startsWith(prefix) && subs.length > 0) {
        const partial = line.slice(prefix.length);
        return subs.filter(s => s.startsWith(partial)).map(s => prefix + s);
      }
    }
    // Suggest group names alongside built-in slash commands
    const slashGroups = Object.keys(COMMAND_GROUPS).map(g => '/' + g);
    const all = [...SLASH_COMMANDS, ...slashGroups];
    return [...new Set(all)].filter(c => c.startsWith(line));
  }

  const tokens = line.split(/\s+/);

  // First token: suggest publisher commands (prefix match, then substring)
  if (tokens.length === 1) {
    const partial = tokens[0];
    const prefixHits = commandNames.filter(c => c.startsWith(partial));
    if (prefixHits.length) return prefixHits;
    return commandNames.filter(c => c !== partial && c.includes(partial));
  }

  const cmd = program.commands.find(c => c.name() === tokens[0]);
  if (!cmd) return [];

  const last = tokens[tokens.length - 1];

  // Channel value after --channel
  if (tokens[tokens.length - 2] === '--channel') {
    return CHANNELS.filter(c => c.startsWith(last));
  }

  // Flag completion
  if (last.startsWith('-')) {
    const opts = (cmd as any).options
      .map((o: any) => o.long || o.short)
      .filter((l: string | undefined): l is string => Boolean(l));
    return opts.filter((o: string) => o.startsWith(last));
  }

  return [];
}

function buildCompleter(program: Command) {
  return (line: string): [string[], string] => {
    const hits = getSuggestions(line, program);
    if (!hits.length) return [[], line];

    if (line.startsWith('/')) {
      if (line.startsWith('/channel ')) {
        return [hits, line];
      }
      return [hits, line];
    }

    const tokens = line.split(/\s+/);
    if (tokens.length === 1) return [hits, tokens[0]];
    return [hits, tokens[tokens.length - 1]];
  };
}

function isKnownCommand(program: Command, name: string): boolean {
  return program.commands.some(c => c.name() === name || c.aliases().includes(name));
}

interface GhostController {
  refresh: () => void;
  clear: () => void;
}

function attachGhostText(rl: readline.Interface, program: Command): GhostController {
  const out = process.stdout;
  let currentGhost = '';

  const clear = () => {
    if (currentGhost) {
      out.write('\x1B[K');
      currentGhost = '';
    }
  };

  const refresh = () => {
    // Always clear previous ghost first; readline's redraw will overwrite
    // visible chars but not anything after the cursor.
    if (currentGhost) {
      out.write('\x1B[K');
      currentGhost = '';
    }

    const line = rl.line;
    const cursor = rl.cursor;
    if (!line || cursor !== line.length) return;

    const matches = getSuggestions(line, program);
    const best = matches.find(m => m.startsWith(line) && m !== line);
    if (!best) return;

    const suffix = best.slice(line.length);
    currentGhost = suffix;
    out.write(theme.dim(suffix));
    out.write(`\x1B[${suffix.length}D`);
  };

  process.stdin.on('keypress', (_str, key) => {
    if (!key) return;
    // Don't render after Enter (line is being submitted) — just clear
    if (key.name === 'return' || key.name === 'enter') {
      clear();
      return;
    }
    // Tab will trigger readline's completer; clear ghost so it doesn't double-render
    if (key.name === 'tab') {
      clear();
      return;
    }
    // Re-render after readline finishes processing this key
    setImmediate(refresh);
  });

  return { refresh, clear };
}

export async function startRepl(
  program: Command,
  version: string,
  opts: { reinitSupabase?: () => boolean; needsSetup?: boolean } = {}
): Promise<void> {
  const state: ReplState = { channel: 'stable', version: null, reinitSupabase: opts.reinitSupabase };

  console.log(renderBanner(version));
  console.log('');
  console.log(renderWelcome(version, state.channel));
  console.log('');

  if (opts.needsSetup) {
    ui.warn('No credentials configured yet — let\'s set them up.');
    ui.hint('You can re-run this anytime with /setup.');
    console.log('');
    const ok = await runSetupWizard({ reason: 'missing' });
    if (ok && opts.reinitSupabase) {
      const ready = opts.reinitSupabase();
      if (!ready) {
        ui.warn('Some credentials are still missing. Run /setup to retry.');
      } else {
        ui.success('You\'re ready to go.');
      }
    }
    console.log('');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: buildPrompt(state),
    terminal: true,
    completer: buildCompleter(program),
  });

  const ghost = attachGhostText(rl, program);

  rl.prompt();

  // Serialize line processing so concurrent input doesn't cause overlapping
  // process.exit overrides or interleaved output.
  let busy: Promise<void> = Promise.resolve();
  const processLine = async (raw: string) => {
    ghost.clear();
    const line = raw.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    if (line.startsWith('/')) {
      const result = handleSlash(line, state);
      if (result.handled) {
        if (result.async) await result.async;
        if (result.exit) {
          rl.close();
          return;
        }
        rl.setPrompt(buildPrompt(state));
        rl.prompt();
        return;
      }
      // Not a built-in slash command — treat as a command-style slash
      // Strip the leading "/" and continue processing as a normal command
    }

    // Strip leading "/" for slash-style commands (e.g. /build list → build list)
    const normalized = line.startsWith('/') ? line.slice(1) : line;
    const tokens = tokenize(normalized);
    if (tokens.length === 0) {
      rl.prompt();
      return;
    }

    if (tokens[0] === 'publisher') tokens.shift();

    if (tokens[0] === 'exit' || tokens[0] === 'quit') {
      rl.close();
      return;
    }

    // Resolve slash-style subcommands: "build list" → "build:list"
    const resolved = resolveSlashCommand(tokens);

    // "Did you mean" for unknown commands
    if (!isKnownCommand(program, resolved[0])) {
      ui.error(`Unknown command: ${theme.accent(resolved[0])}`);
      const matches = getSuggestions(resolved[0], program);
      if (matches.length) {
        const list = matches.slice(0, 6).map(m => theme.accent(m)).join(theme.muted(', '));
        ui.hint(`Did you mean: ${list}?`);
      } else {
        ui.hint('Type /help to see available commands.');
      }
      console.log('');
      rl.setPrompt(buildPrompt(state));
      rl.prompt();
      return;
    }

    // Inject version context if set and command expects a version argument
    let argv = state.version ? injectVersion(resolved, resolved[0], state.version) : resolved;
    argv = injectChannel(argv, state.channel);

    try {
      await runCommand(program, argv);
    } catch (err: any) {
      ui.error(err?.message ?? String(err));
    }

    console.log('');
    rl.setPrompt(buildPrompt(state));
    rl.prompt();
  };

  rl.on('line', (raw) => {
    busy = busy.then(() => processLine(raw)).catch((e) => {
      ui.error(e?.message ?? String(e));
    });
  });

  rl.on('close', () => {
    console.log('');
    console.log(panel(
      `${theme.brandBold('Goodbye')} ${theme.muted('— see you on the next release.')}`,
      { color: theme.brand, padding: 1 }
    ));
    ORIGINAL_PROCESS_EXIT(0);
  });

  rl.on('SIGINT', () => {
    console.log('');
    ui.hint('(Ctrl+C) — type /exit or press Ctrl+D to quit.');
    rl.prompt();
  });
}
