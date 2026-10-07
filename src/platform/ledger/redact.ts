const MAX = 200;
const VALUE = String.raw`("[^"]*"|'[^']*'|\S+)`;
const RULES: [RegExp, string][] = [
  [new RegExp(String.raw`(\b[\w.-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY)\s*=\s*)${VALUE}`, 'gi'), '$1[redacted]'],
  [new RegExp(String.raw`(--(?:token|password|secret|api-key)(?:=|\s+))${VALUE}`, 'gi'), '$1[redacted]'],
  [/(\b(?:Authorization|x-api-key)\s*:\s*["']?)(?:(?:Bearer|Basic|Token)\s+)?[^\s"']+/gi, '$1[redacted]'],
  [/(\bBearer\s+)(?!\[redacted\])[^\s"']+/g, '$1[redacted]'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/]+@/gi, '$1[redacted]@'],
];

/** Redacts secret-looking values, then caps the text at 200 characters. */
export function redactCommand(text: string): string {
  const clean = RULES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
  return clean.length > MAX ? `${clean.slice(0, MAX - 1)}…` : clean;
}
