/** Sanitize a conversation title into a safe filename stem. */
function toFilename(title) {
  return (title || 'conversation')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'conversation';
}

/** Trigger a file download in the browser. */
function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export conversation as JSON. */
export function exportJSON(conversation) {
  const filename = `${toFilename(conversation.title)}.json`;
  const content = JSON.stringify(conversation, null, 2);
  download(filename, content, 'application/json');
}

/** Export conversation as Markdown. */
export function exportMarkdown(conversation) {
  const filename = `${toFilename(conversation.title)}.md`;
  const lines = [];

  lines.push(`# ${conversation.title || 'Conversation'}`);
  lines.push('');
  lines.push(`**ID:** ${conversation.id}`);
  lines.push(`**Created:** ${conversation.created_at}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of conversation.messages || []) {
    if (msg.role === 'user') {
      lines.push('## User');
      lines.push('');
      lines.push(msg.content || '');
      lines.push('');
    } else {
      lines.push('## LLM Council');
      lines.push('');

      if (msg.stage1?.length) {
        lines.push('### Stage 1 — Individual Responses');
        lines.push('');
        for (const r of msg.stage1) {
          lines.push(`**${r.model}**`);
          lines.push('');
          lines.push(r.response || '');
          lines.push('');
        }
      }

      if (msg.stage2?.length) {
        lines.push('### Stage 2 — Peer Rankings');
        lines.push('');
        for (const r of msg.stage2) {
          lines.push(`**${r.model}**`);
          lines.push('');
          lines.push(r.ranking || '');
          lines.push('');
        }
        if (msg.metadata?.aggregate_rankings?.length) {
          lines.push('**Aggregate Rankings**');
          lines.push('');
          for (const ar of msg.metadata.aggregate_rankings) {
            lines.push(`- ${ar.model}: avg rank ${ar.average_rank}`);
          }
          lines.push('');
        }
      }

      if (msg.stage3) {
        lines.push('### Stage 3 — Chairman Synthesis');
        lines.push('');
        lines.push(`*Chairman: ${msg.stage3.model}*`);
        lines.push('');
        lines.push(msg.stage3.response || '');
        lines.push('');
      }

      if (msg.stage4?.length) {
        lines.push('### Stage 4 — Debate');
        lines.push('');
        for (const round of msg.stage4) {
          lines.push(`**Round ${round.round}**`);
          lines.push('');
          for (const m of round.messages || []) {
            lines.push(`*${m.role.toUpperCase()} — ${m.model}*`);
            lines.push('');
            lines.push(m.content || '');
            lines.push('');
          }
        }
      }

      if (msg.stage5) {
        lines.push('### Stage 5 — Debate Verdict');
        lines.push('');
        lines.push(`*Chairman: ${msg.stage5.model}*`);
        lines.push('');
        lines.push(msg.stage5.verdict || '');
        lines.push('');
      }

      if (msg.tldr) {
        lines.push('### TL;DR');
        lines.push('');
        lines.push(msg.tldr.bullets || '');
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  download(filename, lines.join('\n'), 'text/markdown');
}
