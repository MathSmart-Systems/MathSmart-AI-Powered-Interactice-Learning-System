import React from "react";
import { parseFeedbackBlocks, tokenizeInline } from "../utils/feedback-parser.js";

/**
 * Render inline tokens into React elements.
 *
 * @param {string} text
 * @returns {React.ReactNode[]}
 */
export function renderInline(text) {
  const tokens = tokenizeInline(text);
  return tokens.map((token, index) => {
    switch (token.type) {
      case "bold":
        return (
          <strong key={index} className="font-semibold text-foreground">
            {token.content}
          </strong>
        );
      case "italic":
        return (
          <em key={index} className="italic text-foreground/90">
            {token.content}
          </em>
        );
      case "code":
        return (
          <code
            key={index}
            className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
          >
            {token.content}
          </code>
        );
      default:
        return token.content;
    }
  });
}

/**
 * Render a single parsed block.
 *
 * @param {import("../utils/feedback-parser.js").parseFeedbackBlocks extends (...args: any[]) => (infer R)[] ? R : any} block
 * @param {number} blockIndex
 * @returns {React.ReactNode}
 */
function renderBlock(block, blockIndex) {
  if (!block) return null;

  switch (block.type) {
    case "heading": {
      if (block.level <= 2) {
        return (
          <h3
            key={blockIndex}
            className="font-display text-base font-semibold text-foreground mt-2"
          >
            {renderInline(block.text)}
          </h3>
        );
      }
      return (
        <h4
          key={blockIndex}
          className="font-medium text-sm font-semibold text-foreground mt-1.5"
        >
          {renderInline(block.text)}
        </h4>
      );
    }

    case "table": {
      return (
        <div
          key={blockIndex}
          className="my-2 overflow-x-auto rounded-lg border border-border/70 bg-card/60 shadow-xs"
        >
          <table className="min-w-full divide-y divide-border/60 text-xs">
            <thead className="bg-muted/40">
              <tr>
                {block.header.map((th, thIdx) => (
                  <th
                    key={thIdx}
                    className="px-3 py-2 text-left font-semibold text-foreground"
                  >
                    {renderInline(th)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {block.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/20">
                  {row.map((td, tdIdx) => (
                    <td
                      key={tdIdx}
                      className="px-3 py-2 text-foreground/90 align-top"
                    >
                      {renderInline(td)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "list": {
      if (block.ordered) {
        return (
          <ol
            key={blockIndex}
            className="list-decimal pl-5 space-y-1 text-sm text-foreground/90"
          >
            {block.items.map((item, lIdx) => (
              <li key={lIdx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul
          key={blockIndex}
          className="list-disc pl-5 space-y-1 text-sm text-foreground/90"
        >
          {block.items.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    }

    case "mixed": {
      return (
        <div key={blockIndex} className="flex flex-col gap-1.5 text-sm">
          {block.items.map((item, lIdx) => {
            if (item.type === "heading") {
              return (
                <p key={lIdx} className="font-semibold text-foreground mt-1">
                  {renderInline(item.text)}
                </p>
              );
            }
            if (item.type === "bullet") {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2">
                  <span className="text-primary select-none text-xs mt-1">•</span>
                  <span className="leading-relaxed text-foreground/90">
                    {renderInline(item.text)}
                  </span>
                </div>
              );
            }
            if (item.type === "numbered") {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2">
                  <span className="font-semibold text-xs text-primary select-none mt-1">
                    {item.num ? `${item.num}.` : "•"}
                  </span>
                  <span className="leading-relaxed text-foreground/90">
                    {renderInline(item.text)}
                  </span>
                </div>
              );
            }
            return (
              <p key={lIdx} className="leading-relaxed text-foreground/90">
                {renderInline(item.text)}
              </p>
            );
          })}
        </div>
      );
    }

    default: {
      return (
        <p
          key={blockIndex}
          className="text-sm leading-relaxed text-foreground/90"
        >
          {renderInline(block.text)}
        </p>
      );
    }
  }
}

/**
 * Clean and format AI advisory feedback with typography and structure.
 *
 * @param {{ content: string, className?: string }} props
 */
export function FeedbackMarkdown({ content, className = "" }) {
  if (!content || typeof content !== "string") return null;

  const blocks = parseFeedbackBlocks(content);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </div>
  );
}

export default FeedbackMarkdown;
