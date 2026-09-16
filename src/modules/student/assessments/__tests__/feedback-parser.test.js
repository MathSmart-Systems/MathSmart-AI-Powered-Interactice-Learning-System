import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseFeedbackBlocks,
  tokenizeInline,
} from "../utils/feedback-parser.js";

describe("tokenizeInline", () => {
  it("tokenizes plain text with no markers", () => {
    const tokens = tokenizeInline("Hello world");
    assert.deepEqual(tokens, [{ type: "text", content: "Hello world" }]);
  });

  it("tokenizes bold phrases", () => {
    const tokens = tokenizeInline("Nice work **getting started!** Good job.");
    assert.equal(tokens.length, 3);
    assert.equal(tokens[0].type, "text");
    assert.equal(tokens[1].type, "bold");
    assert.equal(tokens[1].content, "getting started!");
    assert.equal(tokens[2].type, "text");
  });

  it("tokenizes italic and code phrases", () => {
    const tokens = tokenizeInline("Check *this rule* and `score: 50`.");
    assert.equal(tokens.length, 5);
    assert.equal(tokens[1].type, "italic");
    assert.equal(tokens[1].content, "this rule");
    assert.equal(tokens[3].type, "code");
    assert.equal(tokens[3].content, "score: 50");
  });

  it("handles null and empty input safely", () => {
    assert.deepEqual(tokenizeInline(null), []);
    assert.deepEqual(tokenizeInline(""), []);
  });
});

describe("parseFeedbackBlocks", () => {
  it("splits paragraphs on double newlines and horizontal rules", () => {
    const text = "Paragraph one.\n\n---\n\nParagraph two.";
    const blocks = parseFeedbackBlocks(text);

    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].type, "paragraph");
    assert.equal(blocks[0].text, "Paragraph one.");
    assert.equal(blocks[1].type, "paragraph");
    assert.equal(blocks[1].text, "Paragraph two.");
  });

  it("splits sections on inline ' --- ' dividers", () => {
    const text = "Introduction text. --- Next steps summary.";
    const blocks = parseFeedbackBlocks(text);

    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].text, "Introduction text.");
    assert.equal(blocks[1].text, "Next steps summary.");
  });

  it("identifies markdown headings correctly", () => {
    const text = "### What this means\n\n#### Next steps";
    const blocks = parseFeedbackBlocks(text);

    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].level, 3);
    assert.equal(blocks[0].text, "What this means");

    assert.equal(blocks[1].type, "heading");
    assert.equal(blocks[1].level, 4);
    assert.equal(blocks[1].text, "Next steps");
  });

  it("parses bullet lists and numbered lists", () => {
    const bulletText = "- First tip\n- Second tip\n* Third tip";
    const bulletBlocks = parseFeedbackBlocks(bulletText);

    assert.equal(bulletBlocks.length, 1);
    assert.equal(bulletBlocks[0].type, "list");
    assert.equal(bulletBlocks[0].ordered, false);
    assert.equal(bulletBlocks[0].items.length, 3);
    assert.equal(bulletBlocks[0].items[0], "First tip");

    const numText = "1. Step one\n2. Step two";
    const numBlocks = parseFeedbackBlocks(numText);

    assert.equal(numBlocks.length, 1);
    assert.equal(numBlocks[0].type, "list");
    assert.equal(numBlocks[0].ordered, true);
    assert.equal(numBlocks[0].items.length, 2);
  });

  it("parses markdown tables into header and data rows", () => {
    const tableText =
      "| Step | What to try | Why it helps |\n|---|---|---|\n| 1 | Review definitions | Builds vocabulary |\n| 2 | Practice problems | Solidifies skills |";

    const blocks = parseFeedbackBlocks(tableText);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "table");
    assert.deepEqual(blocks[0].header, ["Step", "What to try", "Why it helps"]);
    assert.equal(blocks[0].rows.length, 2);
    assert.deepEqual(blocks[0].rows[0], [
      "1",
      "Review definitions",
      "Builds vocabulary",
    ]);
  });

  it("safely handles null and non-string input", () => {
    assert.deepEqual(parseFeedbackBlocks(null), []);
    assert.deepEqual(parseFeedbackBlocks(undefined), []);
    assert.deepEqual(parseFeedbackBlocks(123), []);
  });
});
