// Default LaTeX template
import type { LatexTemplate } from '../types/index.ts';

export const defaultTemplate: LatexTemplate = {
  id: 'default',
  name: 'Default Academic Paper',
  description: 'Generic academic paper template',
  builtin: true,
  documentClass: { name: 'article', options: '11pt,a4paper' },
  preamble: `\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{setspace}
\\onehalfspacing
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue]{hyperref}
\\usepackage{cleveref}
\\usepackage[backend=bibtex,style=ieee,sorting=none]{biblatex}
\\addbibresource{references.bib}
\\usepackage{xcolor}
\\title{{title}}
\\author{{authors}}
\\date{}`,
  titlePageTemplate: `\\maketitle
\\begin{abstract}
{abstract}
\\end{abstract}`,
  sectionIncludeTemplate: `\\input{{texPath}}`,
  bibliographyTemplate: `\\printbibliography`,
  figureTemplate: `\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width={width}]{{filePath}}
  \\caption{{caption}}
  \\label{{label}}
\\end{figure}`,
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyTemplateVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`(?<![a-zA-Z\\\\])\\{${escapeRegExp(key)}\\}`, 'g'), value);
  }
  return result;
}

export function getBuiltinTemplates(): LatexTemplate[] { return [defaultTemplate]; }
export function getTemplate(id: string): LatexTemplate | undefined { return getBuiltinTemplates().find(t => t.id === id); }
