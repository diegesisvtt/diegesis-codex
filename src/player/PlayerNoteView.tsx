/* Ancient-parchment renderer for note documents in the player window.
   Lightweight and read-only: parses BlockNote blocks with the shared,
   dependency-free helpers — no editor is mounted in this window. */

import React, { useMemo } from 'react';
import { parseNoteContent, type BNBlock, type BNInline, type BNStyles } from '@shared/blockContent';

function inlineKey(i: number): string {
  return `in-${i}`;
}

function renderStyles(styles: BNStyles): React.CSSProperties {
  const out: React.CSSProperties = {};
  if (styles.bold) out.fontWeight = 700;
  if (styles.italic) out.fontStyle = 'italic';
  const deco: string[] = [];
  if (styles.underline) deco.push('underline');
  if (styles.strike) deco.push('line-through');
  if (deco.length) out.textDecoration = deco.join(' ');
  if (styles.textColor && styles.textColor !== 'default') out.color = styles.textColor;
  if (styles.backgroundColor && styles.backgroundColor !== 'default') out.backgroundColor = styles.backgroundColor;
  return out;
}

/** Only web-safe link schemes render as anchors — note content can arrive
 *  via imported realm files, so javascript:/data: hrefs must never sink. */
function safeHref(href: string): string | null {
  try {
    const proto = new URL(href, 'https://placeholder.invalid').protocol;
    if (proto === 'https:' || proto === 'http:' || proto === 'mailto:') return href;
  } catch {
    /* malformed */
  }
  return null;
}

function renderInline(content: BNInline[] | string | undefined): React.ReactNode {
  if (!content) return null;
  if (typeof content === 'string') return content;
  return content.map((inline, i) => {
    if (inline.type === 'link') {
      const href = safeHref(inline.href);
      if (!href) return <span key={inlineKey(i)}>{renderInline(inline.content)}</span>;
      return (
        <a key={inlineKey(i)} href={href} target="_blank" rel="noreferrer">
          {renderInline(inline.content)}
        </a>
      );
    }
    if (inline.text === '\n') return <br key={inlineKey(i)} />;
    const style = renderStyles(inline.styles);
    if (inline.styles.code) {
      return (
        <code key={inlineKey(i)} style={style}>
          {inline.text}
        </code>
      );
    }
    return (
      <span key={inlineKey(i)} style={style}>
        {inline.text}
      </span>
    );
  });
}

function blockChildren(block: BNBlock): React.ReactNode {
  if (!block.children || block.children.length === 0) return null;
  return block.children.map((child, i) => renderBlock(child, i));
}

function renderBlock(block: BNBlock, index: number): React.ReactNode {
  const key = block.id ?? `b-${index}`;
  const body = renderInline(block.content);
  const children = blockChildren(block);

  switch (block.type) {
    case 'heading': {
      const level = Number(block.props?.level ?? 1);
      const Tag = (level >= 3 ? 'h3' : level === 2 ? 'h2' : 'h1') as 'h1' | 'h2' | 'h3';
      return (
        <Tag key={key}>
          {body}
          {children}
        </Tag>
      );
    }
    case 'bulletListItem':
      return (
        <ul key={key}>
          <li>
            {body}
            {children}
          </li>
        </ul>
      );
    case 'numberedListItem':
      return (
        <ol key={key}>
          <li>
            {body}
            {children}
          </li>
        </ol>
      );
    case 'checkListItem': {
      const checked = !!block.props?.checked;
      return (
        <div key={key} className={`pw-check${checked ? ' done' : ''}`}>
          <span className={`pw-check-box${checked ? ' checked' : ''}`} />
          <span className="pw-check-text">
            {body}
            {children}
          </span>
        </div>
      );
    }
    case 'quote':
      return (
        <blockquote key={key}>
          {body}
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{typeof block.content === 'string' ? block.content : (block.content ?? []).map((c) => (c.type === 'text' ? c.text : '')).join('')}</code>
        </pre>
      );
    case 'image': {
      const url = typeof block.props?.url === 'string' ? block.props.url : null;
      if (!url) return null;
      return <img key={key} src={url} alt={typeof block.props?.caption === 'string' ? block.props.caption : ''} />;
    }
    case 'audio':
      return (
        <div key={key} className="pw-audio-placeholder">
          <span>♪</span>
          <span>{typeof block.props?.name === 'string' ? block.props.name : 'Gravação de áudio'} — ouça na mesa</span>
        </div>
      );
    case 'divider':
      return <hr key={key} />;
    case 'paragraph':
    default:
      // empty paragraphs keep the parchment's vertical rhythm
      return (
        <p key={key}>
          {body ?? ' '}
          {children}
        </p>
      );
  }
}

export function PlayerNoteView({ title, content }: { title: string; content: string | null }) {
  const blocks = useMemo(() => parseNoteContent(content), [content]);
  const hasContent = blocks.some((b) => {
    if (typeof b.content === 'string') return b.content.trim().length > 0;
    return (b.content ?? []).length > 0 || (b.children ?? []).length > 0 || b.type === 'image';
  });

  return (
    <div className="pw-scroll-wrap">
      <article className="pw-parchment">
        {title && <h1>{title}</h1>}
        {hasContent ? blocks.map((b, i) => renderBlock(b, i)) : <p style={{ fontStyle: 'italic', opacity: 0.7 }}>Este pergaminho ainda está em branco…</p>}
      </article>
    </div>
  );
}
