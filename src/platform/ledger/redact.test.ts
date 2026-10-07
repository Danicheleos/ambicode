import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactCommand } from './redact.ts';

describe('redactCommand', () => {
  it('masks token assignments, authorization headers and URL credentials', () => {
    assert.equal(redactCommand('GH_TOKEN=abc123 npm test'), 'GH_TOKEN=[redacted] npm test');
    assert.equal(redactCommand('curl -H "Authorization: Bearer xyz" u'), 'curl -H "Authorization: [redacted]" u');
    assert.equal(redactCommand('curl -H Authorization:"Bearer xyz" u'), 'curl -H Authorization:"[redacted]" u');
    assert.equal(redactCommand('git clone https://user:p@ss@host/x.git'), 'git clone https://[redacted]@host/x.git');
  });

  it('masks other secret names, flags and bare bearer tokens, several per command', () => {
    assert.equal(redactCommand('API_KEY="a b" DB_PASSWORD=x run'), 'API_KEY=[redacted] DB_PASSWORD=[redacted] run');
    assert.equal(redactCommand('login --token abc --password=def'), 'login --token [redacted] --password=[redacted]');
    assert.equal(redactCommand('echo Bearer abc.def'), 'echo Bearer [redacted]');
    assert.equal(redactCommand('TOKENIZER_MODE=fast npm test'), 'TOKENIZER_MODE=fast npm test');
  });

  it('caps at 200 characters after redacting', () => {
    assert.equal(redactCommand('npm test'), 'npm test');
    assert.equal(redactCommand('x'.repeat(200)), 'x'.repeat(200));
    assert.equal(redactCommand('x'.repeat(201)), `${'x'.repeat(199)}…`);
    const straddling = redactCommand(`${'x'.repeat(190)} GH_TOKEN=${'s'.repeat(40)}`);
    assert.ok(!straddling.includes('sss'), straddling);
  });
});
