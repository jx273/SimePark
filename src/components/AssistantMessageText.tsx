/**
 * Minimal, safe renderer for the assistant's reply.
 *
 * The model's text is untrusted input. This renders a deliberately tiny subset
 * of Markdown (**bold** and "-" / "1." lists) as real React nodes, so no HTML
 * from the model is ever injected into the page and no sanitizer is needed.
 */

import { Fragment, type ReactNode } from 'react';

/** Split a line into plain text and **bold** spans. */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`${keyPrefix}-b${index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
    index += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export default function AssistantMessageText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const blocks: ReactNode[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key}>{renderInline(paragraph.join(' '), key)}</p>
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const key = `l${blocks.length}`;
    const items = list.items;
    blocks.push(
      list.type === 'ul' ? (
        <ul key={key}>
          {items.map((item, index) => (
            <li key={`${key}-${index}`}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ul>
      ) : (
        <ol key={key}>
          {items.map((item, index) => (
            <li key={`${key}-${index}`}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ol>
      )
    );
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);

    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet ? bullet[1] : numbered?.[1]) ?? '');
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return <Fragment>{blocks}</Fragment>;
}
