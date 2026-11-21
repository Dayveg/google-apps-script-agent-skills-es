#!/usr/bin/env node
// Copyright 2026 Dayana Vega (@Dayveg)
// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview Validador de integridad del catálogo de skills, manifiestos y evaluaciones.
 * Uso: node scripts/validate-skills.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Extrae name y description básicos del frontmatter YAML de un SKILL.md.
 * @param {string} content
 * @returns {{ name: string|null, description: string|null, hasFrontmatter: boolean }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { name: null, description: null, hasFrontmatter: false };
  }
  const fm = match[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : null;

  const descIndex = fm.search(/^description:/m);
  let description = null;
  if (descIndex !== -1) {
    description = fm.slice(descIndex);
  }
  return { name, description, hasFrontmatter: true };
}

/**
 * Valida el repositorio de skills y retorna lista de errores.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function validateRepo(rootDir) {
  const errors = [];

  // 1. Validar plugin.json
  const pluginPath = path.join(rootDir, 'plugin.json');
  if (!fs.existsSync(pluginPath)) {
    errors.push('Falta plugin.json en la raíz.');
    return errors;
  }

  const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
  const declaredSkills = new Set();

  if (!Array.isArray(plugin.skills) || plugin.skills.length === 0) {
    errors.push('plugin.json no declara un arreglo válido en "skills".');
  } else {
    for (const relSkillDir of plugin.skills) {
      const fullSkillDir = path.resolve(rootDir, relSkillDir);
      const skillMdPath = path.join(fullSkillDir, 'SKILL.md');
      const dirName = path.basename(fullSkillDir);
      declaredSkills.add(dirName);

      if (!fs.existsSync(skillMdPath)) {
        errors.push(`Skill declarada en plugin.json sin SKILL.md: ${relSkillDir}`);
        continue;
      }

      const content = fs.readFileSync(skillMdPath, 'utf8');
      const { name, description, hasFrontmatter } = parseFrontmatter(content);

      if (!hasFrontmatter) {
        errors.push(`${dirName}/SKILL.md carece de frontmatter YAML.`);
        continue;
      }
      if (name !== dirName) {
        errors.push(`${dirName}/SKILL.md tiene name="${name}", debe coincidir con "${dirName}".`);
      }
      if (!description || !/Usar cuando:/i.test(description) || !/NO usar cuando:/i.test(description)) {
        errors.push(`${dirName}/SKILL.md debe incluir triggers "Usar cuando:" y "NO usar cuando:" en description.`);
      }

      // Validar enlaces relativos locales [texto](./ruta)
      const linkRegex = /\[[^\]]+\]\((\.[^)]+)\)/g;
      let linkMatch;
      while ((linkMatch = linkRegex.exec(content)) !== null) {
        const targetRel = linkMatch[1].split('#')[0];
        const targetAbs = path.resolve(fullSkillDir, targetRel);
        if (!fs.existsSync(targetAbs)) {
          errors.push(`${dirName}/SKILL.md contiene enlace roto: ${linkMatch[1]}`);
        }
      }
    }
  }

  // 2. Validar evals/evals.json
  const evalsPath = path.join(rootDir, 'evals', 'evals.json');
  if (fs.existsSync(evalsPath)) {
    const evals = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    if (Array.isArray(evals.cases)) {
      for (const c of evals.cases) {
        for (const s of c.expected_skills || []) {
          if (!declaredSkills.has(s)) {
            errors.push(`evals.json (${c.id}) referencia skill inexistente: ${s}`);
          }
        }
        for (const s of c.must_not_trigger || []) {
          if (!declaredSkills.has(s)) {
            errors.push(`evals.json (${c.id}) referencia must_not_trigger inexistente: ${s}`);
          }
        }
      }
    }
  } else {
    errors.push('Falta evals/evals.json.');
  }

  return errors;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const rootDir = process.cwd();
  const errors = validateRepo(rootDir);
  if (errors.length === 0) {
    console.log('validate-skills: Catálogo válido (0 errores).');
  } else {
    for (const err of errors) {
      console.error(`ERROR: ${err}`);
    }
    process.exit(1);
  }
}
