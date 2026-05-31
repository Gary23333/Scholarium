export function latexToMarkdown(tex: string): string {
  return tex
    .replace(/\\subsubsection\{([^}]*)\}/g, '### $1')
    .replace(/\\subsection\{([^}]*)\}/g, '## $1')
    .replace(/\\section\{([^}]*)\}/g, '# $1')
    .replace(/\\textbf\{([^}]*)\}/g, '**$1**')
    .replace(/\\textit\{([^}]*)\}/g, '*$1*')
    .replace(/\\emph\{([^}]*)\}/g, '*$1*')
    .replace(/\\cite\{([^}]*)\}/g, '[$1]')
    .replace(/\\citep\{([^}]*)\}/g, '[$1]')
    .replace(/\\citet\{([^}]*)\}/g, '$1')
    .replace(/\\begin\{equation\*\}/g, '$$\n')
    .replace(/\\end\{equation\*\}/g, '\n$$')
    .replace(/\\begin\{equation\}/g, '$$\n')
    .replace(/\\end\{equation\}/g, '\n$$')
    .replace(/\\begin\{align\*\}/g, '$$\n\\begin{aligned}')
    .replace(/\\end\{align\*\}/g, '\\end{aligned}\n$$')
    .replace(/\\begin\{align\}/g, '$$\n\\begin{aligned}')
    .replace(/\\end\{align\}/g, '\\end{aligned}\n$$')
    .replace(/\\begin\{itemize\}/g, '')
    .replace(/\\end\{itemize\}/g, '')
    .replace(/\\begin\{enumerate\}/g, '')
    .replace(/\\end\{enumerate\}/g, '')
    .replace(/\\item\s*/g, '- ')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\ref\{[^}]*\}/g, '')
    .replace(/\\%/g, '%')
    .replace(/%[^\n]*/g, '')
    .replace(/\n{4,}/g, '\n\n')
    .trim();
}

export function stripLatex(tex: string): string {
  return latexToMarkdown(tex)
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/---/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
