import { theme, icon } from './theme.js';

export const ui = {
  success(msg: string) {
    console.log(`${theme.success(icon.check)} ${msg}`);
  },
  error(msg: string) {
    console.error(`${theme.error(icon.cross)} ${msg}`);
  },
  warn(msg: string) {
    console.log(`${theme.warn(icon.warn)} ${msg}`);
  },
  info(msg: string) {
    console.log(`${theme.info(icon.info)} ${msg}`);
  },
  hint(msg: string) {
    console.log(`  ${theme.muted(msg)}`);
  },
  blank() {
    console.log('');
  },
  heading(msg: string) {
    console.log(theme.bold(msg));
  },
};
