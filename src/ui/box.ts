import { theme } from './theme.js';

const BORDER = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function visibleLength(str: string): number {
  return str.replace(ANSI_RE, '').length;
}

function pad(line: string, width: number): string {
  const len = visibleLength(line);
  if (len >= width) return line;
  return line + ' '.repeat(width - len);
}

export interface PanelOptions {
  title?: string;
  color?: (s: string) => string;
  padding?: number;
  width?: number;
}

export function panel(content: string, options: PanelOptions = {}): string {
  const color = options.color ?? theme.brand;
  const padding = options.padding ?? 1;
  const lines = content.split('\n');
  const contentWidth = Math.max(
    ...lines.map(visibleLength),
    options.title ? visibleLength(options.title) + 2 : 0
  );
  const innerWidth = (options.width ?? contentWidth) + padding * 2;

  const padX = ' '.repeat(padding);

  const top = options.title
    ? color(BORDER.tl) +
      color(BORDER.h) +
      ' ' + theme.bold(options.title) + ' ' +
      color(BORDER.h.repeat(Math.max(0, innerWidth - visibleLength(options.title) - 3))) +
      color(BORDER.tr)
    : color(BORDER.tl + BORDER.h.repeat(innerWidth) + BORDER.tr);

  const body = lines.map(
    line => color(BORDER.v) + padX + pad(line, innerWidth - padding * 2) + padX + color(BORDER.v)
  );

  const bottom = color(BORDER.bl + BORDER.h.repeat(innerWidth) + BORDER.br);

  return [top, ...body, bottom].join('\n');
}

export function rule(width = 60, color: (s: string) => string = theme.muted): string {
  return color(BORDER.h.repeat(width));
}
