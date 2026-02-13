/**
 * Semantic densification compressor
 * Per spec 06-compressor.md
 *
 * 4-pass rule-based compression:
 * 1. Meaning pass — remove decorative content
 * 2. Structure pass — flatten formatting
 * 3. Language pass — shorten prose
 * 4. Token pass — symbolic optimization
 *
 * Target: 30-50% token reduction
 * Code blocks are excluded from compression
 */

interface CodeBlock {
  start: number;
  end: number;
  content: string;
}

function extractCodeBlocks(text: string): { blocks: CodeBlock[]; textWithoutCode: string } {
  const blocks: CodeBlock[] = [];
  const fencedRegex = /```[\s\S]*?```/g;
  const indentedRegex = /(?:^|\n)((?:[ ]{4}|\t).*(?:\n(?:[ ]{4}|\t).*)*)/g;

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

  // Remove reader guidance phrases
  const guidancePhrases = [
    /In this section,?\s*/gi,
    /The following example shows\s*/gi,
    /As mentioned above,?\s*/gi,
    /It is important to note that\s*/gi,
    /Please note that\s*/gi,
    /Keep in mind that\s*/gi,
    /As you can see,?\s*/gi,
    /For example,?\s*/gi,
    /Note that\s*/gi,
  ];

  for (const phrase of guidancePhrases) {
    result = result.replace(phrase, '');
  }

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

  // Remove markdown emphasis (bold, italic) — content carries meaning
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold**
  result = result.replace(/\*([^*]+)\*/g, '$1'); // *italic*
  result = result.replace(/__([^_]+)__/g, '$1'); // __bold__
  result = result.replace(/_([^_]+)_/g, '$1'); // _italic_

  // Collapse simple bullet lists into inline comma-separated lists
  // Match bullet lists (-, *, +) that are on consecutive lines
  result = result.replace(/(?:^|\n)((?:[-*+] [^\n]+\n)+)/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line) => line.replace(/^[-*+]\s+/, '').trim());
    return items.join(', ') + '\n';
  });

  return result;
}

/**
 * Pass 3: Language pass — shorten prose
 */
function languagePass(text: string): string {
  let result = text;

  // Convert verbose sentences to dense assertions
  const verbosePatterns: [RegExp, string][] = [
    [/The system is designed to\s+/gi, 'System: '],
    [/This (component|module|function) is responsible for\s+/gi, '$1: '],
    [/In order to\s+/gi, 'To '],
    [/It should be noted that\s+/gi, ''],
    [/It is worth mentioning that\s+/gi, ''],
  ];

  for (const [pattern, replacement] of verbosePatterns) {
    result = result.replace(pattern, replacement);
  }

  // Remove transitional phrases
  result = result.replace(/\b(however|furthermore|moreover|additionally),?\s*/gi, '');

  return result;
}

/**
 * Pass 4: Token pass — symbolic optimization
 */
function tokenPass(text: string): string {
  let result = text;

  // Replace common words with symbols where LLMs understand well
  result = result.replace(/\bleads to\b/gi, '→');
  result = result.replace(/\bresults in\b/gi, '→');
  result = result.replace(/\bcauses\b/gi, '→');
  result = result.replace(/\bequals\b/gi, '=');
  result = result.replace(/\bgreater than\b/gi, '>');
  result = result.replace(/\bless than\b/gi, '<');

  // Collapse remaining unnecessary whitespace
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

  // Apply 4 passes to non-code content
  let compressed = textWithoutCode;
  compressed = meaningPass(compressed);
  compressed = structurePass(compressed);
  compressed = languagePass(compressed);
  compressed = tokenPass(compressed);

  // Restore code blocks
  compressed = restoreCodeBlocks(compressed, blocks);

  // Final cleanup: remove leading/trailing whitespace per line
  compressed = compressed
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  // Remove excessive blank lines again (may have been introduced)
  compressed = compressed.replace(/\n{3,}/g, '\n\n');

  return compressed.trim();
}
