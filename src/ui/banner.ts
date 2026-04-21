import { theme, icon } from './theme.js';
import { panel } from './box.js';

const ART = [
  '  ____        _     _ _     _               ',
  ' |  _ \\ _   _| |__ | (_)___| |__   ___ _ __ ',
  ' | |_) | | | | \'_ \\| | / __| \'_ \\ / _ \\ \'__|',
  ' |  __/| |_| | |_) | | \\__ \\ | | |  __/ |   ',
  ' |_|    \\__,_|_.__/|_|_|___/_| |_|\\___|_|   ',
];

export function renderBanner(version: string): string {
  const art = ART.map(l => theme.brand(l)).join('\n');
  const tagline = theme.muted('  Versions • Builds • Channels • Manifests');
  const meta = `  ${theme.dim('v' + version)}   ${theme.dim(icon.spark + ' interactive mode')}`;
  return `${art}\n${tagline}\n${meta}`;
}

export function renderWelcome(version: string, channel: string): string {
  const lines = [
    `${theme.brandBold('Publisher CLI')}  ${theme.dim('v' + version)}`,
    '',
    `${theme.muted('Type a command, or')} ${theme.accent('/help')} ${theme.muted('to see what you can do.')}`,
    `${theme.muted('Press')} ${theme.accent('Tab')} ${theme.muted('to autocomplete · suggestions appear as you type.')}`,
    `${theme.muted('Channel context:')} ${theme.accent(channel)}   ${theme.muted('(change with')} ${theme.accent('/channel <name>')}${theme.muted(')')}`,
    `${theme.muted('Exit with')} ${theme.accent('/exit')} ${theme.muted('or')} ${theme.accent('Ctrl+D')}`,
  ].join('\n');
  return panel(lines, { color: theme.brand, padding: 1 });
}
