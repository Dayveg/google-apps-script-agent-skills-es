#!/usr/bin/env node
/**
 * @fileoverview Escáner estático determinista de antipatrones en Google Apps Script (gas-scan).
 * Uso: node scripts/gas-scan.mjs <ruta> [--json]
 */

import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'coverage', 'dist', 'build']);
const CODE_EXTS = new Set(['.js', '.gs']);
const HTML_EXTS = new Set(['.html', '.htm']);

const BROAD_SCOPES = new Map([
  ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/spreadsheets.currentonly'],
  ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'],
  ['https://mail.google.com/', 'https://www.googleapis.com/auth/script.send_mail']
]);

/**
 * Recorre recursivamente un directorio retornando rutas de archivos relevantes.
 * @param {string} targetPath
 * @returns {string[]}
 */
function collectFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }

  const results = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (
      CODE_EXTS.has(path.extname(entry.name)) ||
      HTML_EXTS.has(path.extname(entry.name)) ||
      entry.name === 'appsscript.json'
    ) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Elimina comentarios de línea y bloque preservando saltos de línea para mantener números de línea.
 * @param {string} source
 * @returns {string}
 */
function stripCommentsPreserveLines(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

/**
 * Escanea archivos .js / .gs.
 * @param {string} filePath
 * @param {string} raw
 * @returns {Array<Object>}
 */
function scanCodeFile(filePath, raw) {
  const findings = [];
  const clean = stripCommentsPreserveLines(raw);
  const lines = clean.split(/\r?\n/);

  let loopDepth = 0;
  let braceBalanceInLoop = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // GAS001: uso de var
    if (/\bvar\s+[A-Za-z_$]/.test(line)) {
      findings.push({
        ruleId: 'GAS001',
        severity: 'error',
        file: filePath,
        line: lineNum,
        message: 'Uso de "var" prohibido en V8; usar "const" o "let" para evitar hoisting/fugas.',
        skill: 'gas-architecture-v8'
      });
    }

    // Seguimiento heurístico de bucles
    const opensLoop = /\b(for|while)\s*\(/.test(line) || /\.(forEach|map)\s*\(/.test(line);
    if (opensLoop) {
      loopDepth++;
      braceBalanceInLoop = 0;
    }

    if (loopDepth > 0) {
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceBalanceInLoop += openBraces - closeBraces;

      // GAS002: I/O de Sheets dentro de bucles
      if (/\.(getValue|setValue|appendRow|getValues|setValues)\s*\(/.test(line)) {
        findings.push({
          ruleId: 'GAS002',
          severity: 'error',
          file: filePath,
          line: lineNum,
          message: 'Operación I/O de Sheets dentro de bucle; usar lectura/escritura en lote (getValues/setValues) fuera del bucle.',
          skill: 'gas-architecture-v8'
        });
      }

      if (braceBalanceInLoop <= 0 && closeBraces > 0) {
        loopDepth = Math.max(0, loopDepth - 1);
      }
    }

    // GAS003: índices estáticos de columna (ej. row[3], fila[2])
    if (/\b(?:row|fila|registro|values\[[a-z]\])\s*\[\s*[1-9]\d*\s*\]/.test(line)) {
      findings.push({
        ruleId: 'GAS003',
        severity: 'warning',
        file: filePath,
        line: lineNum,
        message: 'Posible acoplamiento a índice estático de columna; verificar que provenga de mapa dinámico de encabezados.',
        skill: 'gas-architecture-v8'
      });
    }

    // GAS005: waitLock sin tryLock
    if (/\.waitLock\s*\(/.test(line)) {
      findings.push({
        ruleId: 'GAS005',
        severity: 'warning',
        file: filePath,
        line: lineNum,
        message: 'Uso de waitLock() detectado; preferir tryLock() con reintentos (Decorrelated Jitter) y liberación en finally.',
        skill: 'gas-concurrency-chunking'
      });
    }

    // GAS007: posibles API keys o webhooks quemados
    if (/AIza[0-9A-Za-z\-_]{20,}/.test(line) || /https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^\s'"]+/.test(line)) {
      findings.push({
        ruleId: 'GAS007',
        severity: 'error',
        file: filePath,
        line: lineNum,
        message: 'Posible credencial o webhook hardcodeado; mover a PropertiesService.getScriptProperties().',
        skill: 'gas-security-owasp'
      });
    }

    // GAS009: servicios retirados por Google (2025-2026)
    if (/\b(?:ContactsApp|Area120Tables|AnalyticsReporting)\b/.test(line)) {
      findings.push({
        ruleId: 'GAS009',
        severity: 'error',
        file: filePath,
        line: lineNum,
        message: 'Uso de servicio retirado (ContactsApp/Area120Tables/AnalyticsReporting); migrar a People API o APIs vigentes.',
        skill: 'gas-libraries-ecosystem'
      });
    }
  }

  // Verificar releaseLock si usa LockService
  if (/LockService\./.test(clean) && !/releaseLock\s*\(/.test(clean)) {
    findings.push({
      ruleId: 'GAS005B',
      severity: 'error',
      file: filePath,
      line: 1,
      message: 'Uso de LockService sin llamada visible a releaseLock() en bloque finally.',
      skill: 'gas-concurrency-chunking'
    });
  }

  return findings;
}

/**
 * Escanea archivos HTML de HtmlService.
 * @param {string} filePath
 * @param {string} raw
 * @returns {Array<Object>}
 */
function scanHtmlFile(filePath, raw) {
  const findings = [];
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/<\?!=/.test(line) && !/<\?!=\s*include\s*\(/.test(line)) {
      findings.push({
        ruleId: 'GAS004',
        severity: 'warning',
        file: filePath,
        line: i + 1,
        message: 'Scriptlet sin escapar "<?!=" detectado; usar "<?= ?>" salvo para includes HTML estáticos confiables.',
        skill: 'gas-security-owasp'
      });
    }
  }
  return findings;
}

/**
 * Escanea appsscript.json.
 * @param {string} filePath
 * @param {string} raw
 * @returns {Array<Object>}
 */
function scanManifest(filePath, raw) {
  const findings = [];
  try {
    const json = JSON.parse(raw);
    if (json.runtimeVersion !== 'V8') {
      findings.push({
        ruleId: 'GAS008',
        severity: 'error',
        file: filePath,
        line: 1,
        message: `runtimeVersion es "${json.runtimeVersion || 'ausente'}"; debe ser "V8".`,
        skill: 'gas-architecture-v8'
      });
    }

    if (Array.isArray(json.oauthScopes)) {
      for (const scope of json.oauthScopes) {
        if (BROAD_SCOPES.has(scope)) {
          findings.push({
            ruleId: 'GAS006',
            severity: 'warning',
            file: filePath,
            line: 1,
            message: `Scope amplio "${scope}"; evaluar menor privilegio con "${BROAD_SCOPES.get(scope)}".`,
            skill: 'gas-security-owasp'
          });
        }
      }
    }
  } catch (err) {
    findings.push({
      ruleId: 'GAS000',
      severity: 'error',
      file: filePath,
      line: 1,
      message: `JSON inválido en appsscript.json: ${err.message}`,
      skill: 'gas-architecture-v8'
    });
  }
  return findings;
}

/**
 * Ejecuta el escaneo sobre una ruta y retorna hallazgos.
 * @param {string} targetPath
 * @returns {Array<Object>}
 */
export function scanTarget(targetPath) {
  const files = collectFiles(targetPath);
  const allFindings = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const base = path.basename(file);
    if (base === 'appsscript.json') {
      allFindings.push(...scanManifest(file, raw));
    } else if (HTML_EXTS.has(path.extname(file))) {
      allFindings.push(...scanHtmlFile(file, raw));
    } else if (CODE_EXTS.has(path.extname(file))) {
      allFindings.push(...scanCodeFile(file, raw));
    }
  }
  return allFindings;
}

// Ejecución CLI directa
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const target = args.find((a) => !a.startsWith('-')) || '.';

  if (!fs.existsSync(target)) {
    console.error(`Ruta no encontrada: ${target}`);
    process.exit(2);
  }

  const findings = scanTarget(target);
  if (jsonMode) {
    console.log(JSON.stringify({ total: findings.length, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log('gas-scan: 0 hallazgos detectados.');
  } else {
    for (const f of findings) {
      console.log(`[${f.severity.toUpperCase()}] ${f.ruleId} (${f.skill}) ${f.file}:${f.line} - ${f.message}`);
    }
    console.log(`\nTotal hallazgos: ${findings.length}`);
  }
}
