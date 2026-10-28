import fs from 'node:fs';

// Grava/atualiza uma chave no arquivo .env
export function setEnvValue(key, value, file = '.env') {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, () => line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(file, text);
}
