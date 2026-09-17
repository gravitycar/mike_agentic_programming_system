/**
 * Semantic densification compressor
 * Per spec 06-compressor.md
 *
 * 3-pass rule-based compression:
 * 1. Meaning pass — remove decorative content
 * 2. Structure pass — flatten formatting
 * 3. Token pass — collapse whitespace
 *
 * Every pass is lossless. Compression is applied to every document the agents
 * read, so a rule that is wrong 1% of the time is wrong on every epic. Rules
 * that rewrite prose were removed: they changed what documents said (deleting
 * "additionally" from a MUST NOT, turning the noun "causes" into an arrow) and
 * together saved under 0.03% of a real specification.
 *
 * Code blocks are excluded from compression.
 * List structure and snake_case identifiers are preserved.
 */

interface CodeBlock {
  start: number;
  end: number;
  content: string;
}

function extractCodeBlocks(text: string): { blocks: CodeBlock[]; textWithoutCode: string } {
  const blocks: CodeBlock[] = [];
  const fencedRegex = /```[\s\S]*?```/g;

  let match;
  let textWithPlaceholders = text;
  let placeholderIndex = 0;

  // Extract fenced code blocks
  while ((match = fencedRegex.exec(text)) !== null) {
    const placeholder = `__CODE_BLOCK_${placeholderIndex}__`;
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
    });
    textWithPlaceholders = textWithPlaceholders.replace(match[0], placeholder);
    placeholderIndex++;
  }

  return { blocks, textWithoutCode: textWithPlaceholders };
}

function restoreCodeBlocks(text: string, blocks: CodeBlock[]): string {
  let result = text;
  blocks.forEach((block, index) => {
    const placeholder = `__CODE_BLOCK_${index}__`;
    result = result.replace(placeholder, block.content);
  });
  return result;
}

/**
 * Pass 1: Meaning pass — remove content that adds no meaning
 */
function meaningPass(text: string): string {
  let result = text;

  // Remove decorative emojis (but preserve text)
  result = result.replace(/[👍👎✅❌🔥💡⚠️🎯📌🚀✨💪🙏👀💯🔴🟢🟡]/g, '');

  // Reader guidance phrases ("For example,", "Note that", "As you can see,")
  // are NOT removed. "For example," marks what follows as an illustration
  // rather than a requirement, and deleting it changes what a spec demands.

  // Remove horizontal rules
  result = result.replace(/^-{3,}$/gm, '');
  result = result.replace(/^_{3,}$/gm, '');
  result = result.replace(/^\*{3,}$/gm, '');

  // Remove excessive empty lines (more than 2 consecutive)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Pass 2: Structure pass — flatten formatting
 */
function structurePass(text: string): string {
  let result = text;

  // Remove markdown emphasis (bold, italic) — content carries meaning.
  // Underscore-italic (_text_) is deliberately NOT stripped: it eats the
  // underscores inside snake_case identifiers (app_metadata, AUTH_LOGGED_IN),
  // which silently corrupts every identifier a specification names.
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold**
  result = result.replace(/\*([^*]+)\*/g, '$1'); // *italic*

  return result;
}

/**
 * Pass 3: Token pass — collapse whitespace
 *
 * Word-to-symbol substitution ("causes" → →, "less than" → <) was removed. The
 * rules matched nouns as well as verbs, so "distinguish four causes:" became
 * "distinguish four →:".
 */
function tokenPass(text: string): string {
  let result = text;

  result = result.replace(/ {2,}/g, ' '); // Multiple spaces to single
  result = result.replace(/\t/g, ' '); // Tabs to space

  return result;
}

/**
 * Main compress function
 */
export function compress(text: string): string {
  // Extract code blocks
  const { blocks, textWithoutCode } = extractCodeBlocks(text);

  // Apply 3 passes to non-code content
  let compressed = textWithoutCode;
  compressed = meaningPass(compressed);
  compressed = structurePass(compressed);
  compressed = tokenPass(compressed);

  // Restore code blocks
  compressed = restoreCodeBlocks(compressed, blocks);

  // Final cleanup: remove trailing whitespace per line. Leading whitespace is
  // kept — it is what makes a nested list item nested, and trimming it promoted
  // every sub-item to a sibling of its parent.
  compressed = compressed
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // Remove excessive blank lines again (may have been introduced)
  compressed = compressed.replace(/\n{3,}/g, '\n\n');

  return compressed.trim();
}
