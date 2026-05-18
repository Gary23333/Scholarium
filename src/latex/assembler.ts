// LaTeX assembler — assembles sections into main.tex
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FullPaper, LatexProject, SectionRef, ScholariumProjectConfig } from '../types/index.ts';
import { getTemplate, applyTemplateVariables } from './templates.ts';

export function assembleFullPaper(paper: FullPaper, outputDir: string): string {
  const template = getTemplate(paper.templateId ?? 'default');
  if (!template) throw new Error(`Unknown template: ${paper.templateId}`);

  const sectionsDir = path.join(outputDir, 'sections');
  fs.mkdirSync(sectionsDir, { recursive: true });

  for (const section of paper.sections) {
    const content = paper.sectionContents[section.id];
    if (!content) throw new Error(`Section "${section.id}" missing content`);
    const cleaned = content.replace(/\\begin\{document\}/g, '').replace(/\\end\{document\}/g, '').replace(/\\maketitle/g, '').replace(/\\documentclass(\[.*?\])?\{.*?\}/g, '').replace(/\\usepackage(\[.*?\])?\{.*?\}/g, '').trim();
    const texPath = path.join(sectionsDir, `section_${section.number}.tex`);
    fs.writeFileSync(texPath, cleaned, 'utf-8');
    section.texPath = path.relative(outputDir, texPath);
  }

  const authorsStr = paper.authors.join(' \\and ');
  const preamble = applyTemplateVariables(template.preamble, { title: escapeLatex(paper.title), authors: escapeLatex(authorsStr) });
  const sectionIncludes = paper.sections.map(s => applyTemplateVariables(template.sectionIncludeTemplate, { texPath: s.texPath.replaceAll('\\', '/') })).join('\n');
  const bibSection = paper.bibFilePath ? applyTemplateVariables(template.bibliographyTemplate, { bibPath: paper.bibFilePath }) : '% No bibliography';

  const mainTex = [
    `\\documentclass[${template.documentClass.options}]{${template.documentClass.name}}`,
    '', preamble, '', '\\begin{document}', '',
    applyTemplateVariables(template.titlePageTemplate, { abstract: '' }),
    '', sectionIncludes, '', bibSection, '', '\\end{document}',
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, 'main.tex'), mainTex, 'utf-8');
  return mainTex;
}

export function createLatexProject(config: { rootDir: string; title: string; authors: string[]; templateId?: string; targetJournal?: string }): LatexProject {
  const template = getTemplate(config.templateId ?? 'default');
  if (!template) throw new Error('Unknown template');
  for (const dir of ['sections', 'figures', 'output', 'logs']) fs.mkdirSync(path.join(config.rootDir, dir), { recursive: true });
  const projConfig: ScholariumProjectConfig = { paperId: `paper-${Date.now()}`, title: config.title, authors: config.authors, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), templateId: config.templateId ?? 'default' };
  fs.writeFileSync(path.join(config.rootDir, 'scholarium.json'), JSON.stringify(projConfig, null, 2), 'utf-8');
  return { rootDir: config.rootDir, title: config.title, authors: config.authors, targetJournal: config.targetJournal, documentClass: template.documentClass, sections: [], figures: [], appendices: [], templateId: config.templateId ?? 'default', config: projConfig };
}

export function loadProject(rootDir: string): LatexProject {
  const configPath = path.join(rootDir, 'scholarium.json');
  if (!fs.existsSync(configPath)) throw new Error(`Config not found: ${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const template = getTemplate(config.templateId ?? 'default');
  if (!template) throw new Error('Unknown template');
  const sectionsDir = path.join(rootDir, 'sections');
  const sections: SectionRef[] = [];
  if (fs.existsSync(sectionsDir)) {
    for (const file of fs.readdirSync(sectionsDir).filter(f => f.startsWith('section_') && f.endsWith('.tex'))) {
      const match = file.match(/section_(\d+)\.tex/);
      if (match) sections.push({ id: `section-${match[1]}`, number: parseInt(match[1], 10), title: `Section ${match[1]}`, texPath: `sections/${file}`, status: 'drafting', version: 1 });
    }
  }
  sections.sort((a, b) => a.number - b.number);
  return { rootDir, title: config.title ?? 'Untitled', authors: config.authors ?? [], targetJournal: config.targetJournal, documentClass: template.documentClass, sections, figures: [], appendices: [], templateId: config.templateId ?? 'default', config };
}

export function writeSectionFile(project: LatexProject, sectionId: string, sectionNumber: number, title: string, content: string): SectionRef {
  const sectionsDir = path.join(project.rootDir, 'sections');
  fs.mkdirSync(sectionsDir, { recursive: true });
  const fileName = `section_${sectionNumber}.tex`;
  fs.writeFileSync(path.join(sectionsDir, fileName), content, 'utf-8');
  const ref: SectionRef = { id: sectionId, number: sectionNumber, title, texPath: `sections/${fileName}`, status: 'drafting', version: 1 };
  const idx = project.sections.findIndex(s => s.id === sectionId);
  if (idx >= 0) project.sections[idx] = ref; else project.sections.push(ref);
  project.sections.sort((a, b) => a.number - b.number);
  return ref;
}

function escapeLatex(text: string): string {
  return text.replace(/[&%$#_{}]/g, '\\$&').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
}
