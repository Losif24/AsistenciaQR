import { localTime } from './time.js';

const COLORS = { info: '\x1b[36m', ok: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function line(level, label, message) {
  const color = useColor ? COLORS[level] || '' : '';
  const end = useColor ? RESET : '';
  return `${color}[${localTime()}] ${label}${end} ${message}`;
}

export const log = {
  info: (msg) => console.log(line('info', 'INFO ', msg)),
  ok: (msg) => console.log(line('ok', 'OK   ', msg)),
  warn: (msg) => console.warn(line('warn', 'AVISO', msg)),
  error: (msg, err) => {
    console.error(line('error', 'ERROR', msg));
    if (err?.stack) console.error(err.stack);
  },
};
