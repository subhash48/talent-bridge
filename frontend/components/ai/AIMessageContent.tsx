import type { ReactNode } from "react";

type Block = { type: "p"; lines: string[] } | { type: "ul" | "ol"; items: string[] };

/** Just enough Markdown for Copilot answers: paragraphs, "-" and "1." lists, and **bold**. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      current = undefined;
      continue;
    }
    const item = /^(?:([-•])|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      const type = item[1] ? "ul" : "ol";
      if (current?.type !== type) {
        current = { type, items: [] };
        blocks.push(current);
      }
      current.items.push(item[2]);
    } else {
      if (current?.type !== "p") {
        current = { type: "p", lines: [] };
        blocks.push(current);
      }
      current.lines.push(line);
    }
  }
  return blocks;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

const caret = <span aria-hidden className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[3px] animate-caret bg-ai" />;

export function AIMessageContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks = parseBlocks(text);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, blockIndex) => {
        const isLast = blockIndex === blocks.length - 1;
        if (block.type === "p") {
          return (
            <p key={blockIndex}>
              {block.lines.map((line, lineIndex) => (
                <span key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {inline(line)}
                </span>
              ))}
              {streaming && isLast && caret}
            </p>
          );
        }
        const List = block.type;
        return (
          <List key={blockIndex} className={`flex flex-col gap-1.5 pl-5 ${block.type === "ul" ? "list-disc" : "list-decimal"} marker:text-faint`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-0.5">
                {inline(item)}
                {streaming && isLast && itemIndex === block.items.length - 1 && caret}
              </li>
            ))}
          </List>
        );
      })}
      {blocks.length === 0 && streaming && <p>{caret}</p>}
    </div>
  );
}
