#!/usr/bin/env node
// Scholarium CLI
import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createLatexProject, loadProject, writeSectionFile, assembleFullPaper } from '../latex/assembler.ts';
import { compile, detectEngine } from '../latex/compiler.ts';
import type { CliCommandResult, FullPaper } from '../types/index.ts';
import { logger } from '../utils/logger.js';

const program = new Command();
program.name('scholarium').description('Scholarium — Multi-Agent Academic Paper Writing System').version('0.1.0');

program
  .command('init')
  .description('Initialize new paper project')
  .requiredOption('-d, --dir <path>', 'Project directory')
  .requiredOption('-t, --title <title>', 'Paper title')
  .option('-a, --author <authors...>', 'Authors', ['Anonymous'])
  .option('--template <id>', 'Template ID', 'default')
  .option('-j, --journal <name>', 'Target journal')
  .action((opts) => {
    try {
      const project = createLatexProject({
        rootDir: opts.dir,
        title: opts.title,
        authors: opts.author,
        templateId: opts.template,
        targetJournal: opts.journal,
      });
      logger.info(`✅ Project initialized: ${project.rootDir}`);
    } catch (err: any) {
      logger.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('write')
  .description('Write/update a section')
  .requiredOption('-d, --dir <path>', 'Project directory')
  .requiredOption('-n, --number <num>', 'Section number')
  .requiredOption('--name <name>', 'Section title')
  .option('-f, --file <path>', 'Read content from file')
  .option('-c, --content <text>', 'Direct content')
  .action((opts) => {
    try {
      const project = loadProject(opts.dir);
      const content = opts.file ? fs.readFileSync(opts.file, 'utf-8') : opts.content;
      if (!content) throw new Error('Provide --file or --content');
      writeSectionFile(project, `section-${opts.number}`, parseInt(opts.number), opts.name, content);
      logger.info(`✅ Section ${opts.number} written`);
    } catch (err: any) {
      logger.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('compile')
  .description('Compile LaTeX to PDF')
  .requiredOption('-d, --dir <path>', 'Project directory')
  .option('--engine <name>', 'Compile engine')
  .action(async (opts) => {
    try {
      const project = loadProject(opts.dir);
      if (project.sections.length === 0) throw new Error('No sections');
      const sectionContents: Record<string, string> = {};
      for (const s of project.sections) {
        const texPath = path.join(project.rootDir, s.texPath);
        if (!fs.existsSync(texPath)) throw new Error(`Missing: ${texPath}`);
        sectionContents[s.id] = fs.readFileSync(texPath, 'utf-8');
      }
      const outputDir = path.join(project.rootDir, 'output');
      fs.mkdirSync(outputDir, { recursive: true });
      assembleFullPaper(
        {
          title: project.title,
          authors: project.authors,
          sections: project.sections,
          sectionContents,
          figures: project.figures,
          appendices: project.appendices,
          templateId: project.templateId,
        },
        outputDir,
      );
      const result = await compile({ workDir: outputDir, texFile: 'main.tex', engine: opts.engine as any });
      if (result.ok) logger.info(`✅ Compiled: ${result.pdfPath}`);
      else {
        logger.error(`❌ Compile failed`);
        for (const e of result.errors) logger.error(`  - ${e.message}`);
        process.exit(1);
      }
    } catch (err: any) {
      logger.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show project status')
  .requiredOption('-d, --dir <path>', 'Project directory')
  .action((opts) => {
    try {
      const project = loadProject(opts.dir);
      logger.info(`\n\ud83d\udcc4 ${project.title}`);
      logger.info(`   Directory: ${project.rootDir}`);
      logger.info(`   Sections: ${project.sections.length}`);
      for (const s of project.sections) logger.info(`   \u23f3 \u00a7${s.number} ${s.title} [${s.status}]`);
    } catch (err: any) {
      logger.error(`\u274c ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
