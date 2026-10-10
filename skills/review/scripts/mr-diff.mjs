// The merge-request call list for the model: the project path and iid come from the URL, nothing else is fetched here.
import { readFileSync } from 'node:fs';

const { args } = JSON.parse(readFileSync(0, 'utf8'));
const url = args?.target?.mr ?? '';
const match = /^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/.exec(url) ?? /^https?:\/\/[^/]+\/(.+?)\/merge_requests\/(\d+)/.exec(url);
if (match === null) {
  process.stdout.write(JSON.stringify({ failed: { code: 'bad-argument', message: `Not a merge-request URL: ${url}` } }));
} else {
  const payload = [
    `Call your GitLab MCP server for project "${match[1]}", merge request ${match[2]}:`,
    '1. get_merge_request',
    '2. get_merge_request_diffs, or the diff tool of your GitLab MCP server (every page of it)',
    'The hook records the diff from the second response.',
  ].join('\n');
  process.stdout.write(JSON.stringify({ payload }));
}
