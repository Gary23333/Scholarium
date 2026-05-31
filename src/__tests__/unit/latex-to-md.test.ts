import { describe, it, expect } from 'vitest';
import { latexToMarkdown, stripLatex } from '../../server/utils/latex-to-md.ts';

describe('latexToMarkdown()', () => {
  describe('section headers', () => {
    it('should convert \\section to h1', () => {
      expect(latexToMarkdown('\\section{Introduction}')).toBe('# Introduction');
    });

    it('should convert \\subsection to h2', () => {
      expect(latexToMarkdown('\\subsection{Background}')).toBe('## Background');
    });

    it('should convert \\subsubsection to h3', () => {
      expect(latexToMarkdown('\\subsubsection{Details}')).toBe('### Details');
    });

    it('should convert multiple sections in one string', () => {
      const input = '\\section{Intro}\\subsection{Sub}\\subsubsection{Detail}';
      expect(latexToMarkdown(input)).toBe('# Intro## Sub### Detail');
    });
  });

  describe('text formatting', () => {
    it('should convert \\textbf to bold', () => {
      expect(latexToMarkdown('\\textbf{important}')).toBe('**important**');
    });

    it('should convert \\textit to italic', () => {
      expect(latexToMarkdown('\\textit{emphasis}')).toBe('*emphasis*');
    });

    it('should convert \\emph to italic', () => {
      expect(latexToMarkdown('\\emph{emphasis}')).toBe('*emphasis*');
    });
  });

  describe('citation conversion', () => {
    it('should convert \\cite to bracket citation', () => {
      expect(latexToMarkdown('\\cite{smith2020}')).toBe('[smith2020]');
    });

    it('should convert \\citep to bracket citation', () => {
      expect(latexToMarkdown('\\citep{doe2021}')).toBe('[doe2021]');
    });

    it('should convert \\citet to plain text', () => {
      expect(latexToMarkdown('\\citet{jones2022}')).toBe('jones2022');
    });
  });

  describe('equation conversion', () => {
    it('should convert equation environment to display math', () => {
      const input = '\\begin{equation}E=mc^2\\end{equation}';
      const result = latexToMarkdown(input);
      expect(result).toContain('E=mc^2');
      expect(result).toBe('$\nE=mc^2\n$');
    });

    it('should convert equation* environment to display math', () => {
      const input = '\\begin{equation*}E=mc^2\\end{equation*}';
      const result = latexToMarkdown(input);
      expect(result).toContain('E=mc^2');
      expect(result).toBe('$\nE=mc^2\n$');
    });

    it('should convert align environment with aligned wrapper', () => {
      const input = '\\begin{align}a &= b\\\\c &= d\\end{align}';
      const result = latexToMarkdown(input);
      expect(result).toContain('\\begin{aligned}');
      expect(result).toContain('\\end{aligned}');
    });

    it('should convert align* environment with aligned wrapper', () => {
      const input = '\\begin{align*}a &= b\\end{align*}';
      const result = latexToMarkdown(input);
      expect(result).toContain('\\begin{aligned}');
      expect(result).toContain('\\end{aligned}');
    });
  });

  describe('list conversion', () => {
    it('should convert itemize to markdown list', () => {
      const input = '\\begin{itemize}\\item First\\item Second\\end{itemize}';
      expect(latexToMarkdown(input)).toBe('- First- Second');
    });

    it('should remove enumerate environment tags', () => {
      const input = '\\begin{enumerate}\\item First\\item Second\\end{enumerate}';
      expect(latexToMarkdown(input)).toBe('- First- Second');
    });
  });

  describe('label and ref removal', () => {
    it('should remove \\label', () => {
      expect(latexToMarkdown('\\label{sec:intro}')).toBe('');
    });

    it('should remove \\ref (trailing space trimmed)', () => {
      expect(latexToMarkdown('see \\ref{fig:1}')).toBe('see');
    });
  });

  describe('comment removal', () => {
    it('should remove LaTeX comments (trailing space trimmed)', () => {
      expect(latexToMarkdown('hello % this is a comment')).toBe('hello');
    });

    it('should handle escaped percent followed by comment pattern', () => {
      const result = latexToMarkdown('50\\% complete');
      expect(result).toContain('50');
    });
  });

  describe('excessive newlines', () => {
    it('should collapse 4+ newlines to 2', () => {
      expect(latexToMarkdown('hello\n\n\n\nworld')).toBe('hello\n\nworld');
    });
  });
});

describe('stripLatex()', () => {
  it('should strip bold markdown formatting', () => {
    expect(stripLatex('\\textbf{hello}')).toBe('hello');
  });

  it('should strip italic markdown formatting', () => {
    expect(stripLatex('\\textit{hello}')).toBe('hello');
  });

  it('should strip both bold and italic', () => {
    expect(stripLatex('\\textbf{bold} and \\textit{italic}')).toBe('bold and italic');
  });

  it('should remove code blocks', () => {
    const result = stripLatex('some `code` here');
    expect(result).toBe('some  here');
  });

  it('should remove horizontal rules', () => {
    expect(stripLatex('before---after')).toBe('beforeafter');
  });

  it('should collapse excessive newlines', () => {
    expect(stripLatex('hello\n\n\n\nworld')).toBe('hello\n\nworld');
  });
});
