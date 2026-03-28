function sanitizeFilenamePart(value, fallback = 'conversation') {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '');

  return normalized || fallback;
}

function serializeValue(value) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  try {
    return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  } catch {
    return `\n\`\`\`\n${String(value)}\n\`\`\``;
  }
}

function normalizeMessage(message) {
  if (message?.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content ?? null,
      stage1: message.stage1 ?? null,
      stage2: message.stage2 ?? null,
      stage3: message.stage3 ?? null,
      stage4: message.stage4 ?? null,
      stage5: message.stage5 ?? null,
      tldr: message.tldr ?? null,
      metadata: message.metadata ?? null,
    };
  }

  return {
    role: message?.role ?? 'user',
    content: message?.content ?? '',
  };
}

export function buildExportPayload(conversation) {
  return {
    id: conversation?.id ?? null,
    title: conversation?.title ?? '',
    created_at: conversation?.created_at ?? null,
    messages: (conversation?.messages ?? []).map(normalizeMessage),
  };
}

export function conversationToJson(conversation) {
  return JSON.stringify(buildExportPayload(conversation), null, 2);
}

export function conversationToMarkdown(conversation) {
  const payload = buildExportPayload(conversation);
  const lines = [
    `# ${payload.title || 'Untitled Conversation'}`,
    '',
    '## Metadata',
    `- ID: ${payload.id ?? ''}`,
    `- Created At: ${payload.created_at ?? ''}`,
    `- Message Count: ${payload.messages.length}`,
  ];

  payload.messages.forEach((message) => {
    if (message.role === 'user') {
      lines.push('', '## User', '', message.content || '');
      return;
    }

    lines.push('', '## LLM Council');

    if (message.content) {
      lines.push('', '### Content', '', message.content);
    }

    const sections = [
      ['Stage 1', message.stage1],
      ['Stage 2', message.stage2],
      ['Stage 3', message.stage3],
      ['Stage 4', message.stage4],
      ['Stage 5', message.stage5],
      ['TL;DR', message.tldr],
      ['Metadata', message.metadata],
    ];

    sections.forEach(([label, value]) => {
      if (value == null) {
        return;
      }

      if (Array.isArray(value) && value.length === 0) {
        return;
      }

      lines.push('', `### ${label}`, '', serializeValue(value));
    });
  });

  return `${lines.join('\n').trim()}\n`;
}

export function getConversationExportFilename(conversation, extension) {
  const title = sanitizeFilenamePart(conversation?.title, sanitizeFilenamePart(conversation?.id, 'conversation'));
  return `${title}.${extension}`;
}

export function downloadConversationExport(conversation, format) {
  const exportMap = {
    json: {
      content: conversationToJson(conversation),
      mimeType: 'application/json;charset=utf-8',
      extension: 'json',
    },
    markdown: {
      content: conversationToMarkdown(conversation),
      mimeType: 'text/markdown;charset=utf-8',
      extension: 'md',
    },
  };

  const exportConfig = exportMap[format];
  if (!exportConfig) {
    throw new Error(`Unsupported export format: ${format}`);
  }

  const blob = new Blob([exportConfig.content], { type: exportConfig.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = getConversationExportFilename(conversation, exportConfig.extension);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
