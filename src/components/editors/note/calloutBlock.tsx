// Custom BlockNote block: embeds a CalloutBlock (rule/lore/secret/quote) with
// inline rich text. The variant + title live in props; content is inline.

import { createReactBlockSpec } from '@blocknote/react';
import { CalloutBlock, type CalloutVariant } from '../../codex/CalloutBlock';

export const CalloutBlockNote = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      variant: { default: 'lore' as CalloutVariant },
      title: { default: '' },
    },
    content: 'inline',
  },
  {
    render: ({ block, contentRef }) => {
      const variant = (block.props.variant as CalloutVariant) ?? 'lore';
      const title = block.props.title as string;
      return (
        <CalloutBlock variant={variant} title={title || undefined}>
          <div ref={contentRef} />
        </CalloutBlock>
      );
    },
  }
);
