import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanTarget } from '../scripts/gas-scan.mjs';

test('detecta antipatrones GAS comunes y respeta codigo limpio', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-scan-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'bad.js'),
      [
        'var x = 1;',
        'function testLoop(sheet) {',
        '  for (let i = 0; i < 10; i++) {',
        '    sheet.getRange(i + 1, 1).setValue("ok");',
        '  }',
        '}',
        'function lockTest() {',
        '  const lock = LockService.getScriptLock();',
        '  lock.waitLock(5000);',
        '  return ContactsApp.getContacts();',
        '}'
      ].join('\n')
    );

    fs.writeFileSync(
      path.join(tmpDir, 'view.html'),
      '<div><?!= userInput ?></div>\n<div><?!= include("Styles") ?></div>\n'
    );

    fs.writeFileSync(
      path.join(tmpDir, 'appsscript.json'),
      JSON.stringify({
        runtimeVersion: 'DEPRECATED_ES5',
        oauthScopes: ['https://www.googleapis.com/auth/spreadsheets']
      })
    );

    const findings = scanTarget(tmpDir);
    const rules = new Set(findings.map((f) => f.ruleId));

    assert.ok(rules.has('GAS001'), 'Debe detectar var');
    assert.ok(rules.has('GAS002'), 'Debe detectar setValue en bucle');
    assert.ok(rules.has('GAS004'), 'Debe detectar <?!= sin include');
    assert.ok(rules.has('GAS005'), 'Debe detectar waitLock');
    assert.ok(rules.has('GAS005B'), 'Debe detectar falta de releaseLock');
    assert.ok(rules.has('GAS006'), 'Debe detectar scope amplio');
    assert.ok(rules.has('GAS008'), 'Debe detectar runtimeVersion distinto de V8');
    assert.ok(rules.has('GAS009'), 'Debe detectar servicios retirados');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
