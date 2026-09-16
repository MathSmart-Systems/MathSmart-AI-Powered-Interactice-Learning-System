/**
 * Pure parsing utilities for AI advisory feedback text.
 * Separates raw markdown into structured blocks (paragraphs, headings,
 * bullet lists, numbered lists, tables) and inline tokens (bold, italic, code).
 */

/**
 * Tokenize an inline text segment into plain text, bold, italic, and code tokens.
 *
 * @param {string} text
 * @returns {Array<{ type: "text" | "bold" | "italic" | "code", content: string }>}
 */
export function tokenizeInline(text) {
  if (!text || typeof text !== "string") return [];

  // Match **bold**, *italic*, `code`
  const rawTokens = text.split(/(\*\*.*?\*\*|\*[^*]+?\*|`[^`]+?`)/g);

  return rawTokens
    .filter(Boolean)
    .map((tok) => {
      if (tok.startsWith("**") && tok.endsWith("**") && tok.length >= 4) {
        return { type: "bold", content: tok.slice(2, -2) };
      }
      if (tok.startsWith("*") && tok.endsWith("*") && tok.length >= 2) {
        return { type: "italic", content: tok.slice(1, -1) };
      }
      if (tok.startsWith("`") && tok.endsWith("`") && tok.length >= 2) {
        return { type: "code", content: tok.slice(1, -1) };
      }
      return { type: "text", content: tok };
    });
}

/**
 * Split raw markdown advisory content into clean semantic blocks.
 *
 * @param {string} content
 * @returns {Array<
 *   | { type: "heading", level: number, text: string }
 *   | { type: "table", header: string[], rows: string[][] }
 *   | { type: "list", ordered: boolean, items: string[] }
 *   | { type: "mixed", items: Array<{ type: string, text: string, num?: string }> }
 *   | { type: "paragraph", text: string }
 * >}
 */
export function parseFeedbackBlocks(content) {
  if (!content || typeof content !== "string") return [];

  // Split on double newlines OR horizontal dividers (" --- " or "\n---\n")
  const rawSections = content
    .replace(/\r\n/g, "\n")
    .split(/(?:\s+---\s+|\n{2,}|\n\s*---\s*\n)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks = [];

  for (const raw of rawSections) {
    // Heading check: ### Heading or ## Heading
    const headingMatch = raw.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch && !raw.includes("\n")) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Markdown Table check: lines start and end with |
    const isTable =
      lines.length >= 2 && lines.every((l) => l.startsWith("|") && l.endsWith("|"));
    if (isTable) {
      const contentRows = lines
        .filter((l) => !/^\|[\s\-:|]+\|$/.test(l))
        .map((l) =>
          l
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim())
        );

      if (contentRows.length > 0) {
        const [header, ...bodyRows] = contentRows;
        blocks.push({
          type: "table",
          header,
          rows: bodyRows,
        });
        continue;
      }
    }

    // Pure bullet list
    const isAllBullets = lines.every((l) => /^[-*•]\s+/.test(l));
    if (isAllBullets && lines.length > 0) {
      blocks.push({
        type: "list",
        ordered: false,
        items: lines.map((l) => l.replace(/^[-*•]\s+/, "")),
      });
      continue;
    }

    // Pure numbered list
    const isAllNumbered = lines.every((l) => /^\d+[\.)]\s+/.test(l));
    if (isAllNumbered && lines.length > 0) {
      blocks.push({
        type: "list",
        ordered: true,
        items: lines.map((l) => l.replace(/^\d+[\.)]\s+/, "")),
      });
      continue;
    }

    // Mixed block: contains inline items, sub-headers, or bullet items
    const hasBulletsOrHeaders = lines.some(
      (l) => /^[-*•]\s+/.test(l) || /^#{1,4}\s+/.test(l) || /^\d+[\.)]\s+/.test(l)
    );

    if (hasBulletsOrHeaders && lines.length > 1) {
      const subItems = [];
      for (const line of lines) {
        if (/^#{1,4}\s+/.test(line)) {
          subItems.push({
            type: "heading",
            text: line.replace(/^#{1,4}\s+/, ""),
          });
        } else if (/^[-*•]\s+/.test(line)) {
          subItems.push({
            type: "bullet",
            text: line.replace(/^[-*•]\s+/, ""),
          });
        } else if (/^\d+[\.)]\s+/.test(line)) {
          const m = line.match(/^(\d+)[\.)]\s+(.+)$/);
          subItems.push({
            type: "numbered",
            num: m ? m[1] : "",
            text: m ? m[2] : line,
          });
        } else {
          subItems.push({
            type: "text",
            text: line,
          });
        }
      }
      blocks.push({
        type: "mixed",
        items: subItems,
      });
      continue;
    }

    // Default: paragraph
    blocks.push({
      type: "paragraph",
      text: raw,
    });
  }

  return blocks;
}
