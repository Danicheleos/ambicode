// Runners that plan what a run would do: none of them starts a model.
/** The arguments of a dry run: a runner never starts a model, so the run flag is always `--dry-run`. */
export function dryRunArgs(base, rest) {
  const has = (flag) => rest.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  return [...base, '--dry-run', ...(has('--model') ? [] : ['--model', 'claude-sonnet-5-5']), ...(has('--max-cost-usd') ? [] : ['--max-cost-usd', '1']), ...rest.filter((arg) => arg !== '--dry-run')];
}
