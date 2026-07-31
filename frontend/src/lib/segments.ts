/** Splice `replacement` into `content` at [start, end) — raw-content offsets. */
export function spliceSegment(content: string, start: number, end: number, replacement: string): string {
  return content.slice(0, start) + replacement + content.slice(end);
}

/** Compute the character offset of (container, offset) relative to `root`'s text content. */
export function offsetInRoot(root: Node, container: Node, offset: number): number {
  if (container === root) return offset;
  let acc = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    if (n === container) return acc + offset;
    acc += (n.textContent ?? '').length;
    n = walker.nextNode();
  }
  return acc + offset;
}
