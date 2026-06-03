const fs = require('fs');

const files = [
  {
    path: 'src/data/defaultPrompts/chat.ts',
    module: 'DEFAULT_PROMPT_ORDER',
    definitionsMarker: 'export const DEFAULT_PROMPT_DEFINITIONS',
    orderMarker: 'export const DEFAULT_PROMPT_ORDER',
  },
  {
    path: 'src/data/faceToFacePrompts.ts',
    module: 'FACE_TO_FACE_PROMPT_ORDER',
    definitionsMarker: 'export const FACE_TO_FACE_PROMPT_DEFINITIONS',
    orderMarker: 'export const FACE_TO_FACE_PROMPT_ORDER',
    externalOrderIds: ['f2fBlockMemory', 'minimaxTTS'],
  },
  {
    path: 'src/data/groupChatPrompts.ts',
    module: 'DEFAULT_GROUP_CHAT_PROMPT_ORDER',
    definitionsMarker: 'groupChatPrompts:',
    orderMarker: 'groupChatPromptOrder:',
    externalOrderIds: ['gcBlockMemory', 'minimaxTTS'],
  },
  {
    path: 'src/data/defaultPrompts/diary.ts',
    module: 'DEFAULT_DIARY_PROMPT_ORDER',
    definitionsMarker: 'export const DIARY_PROMPT_DEFINITIONS',
    orderMarker: 'export const DEFAULT_DIARY_PROMPT_ORDER',
  },
  {
    path: 'src/data/defaultPrompts/summary.ts',
    module: 'DEFAULT_SUMMARY_PROMPT_ORDER',
    definitionsMarker: 'export const SUMMARY_PROMPT_DEFINITIONS',
    orderMarker: 'export const DEFAULT_SUMMARY_PROMPT_ORDER',
  },
  {
    path: 'src/data/defaultPrompts/events.ts',
    module: 'DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER',
    definitionsMarker: 'export const IMPORTANT_EVENTS_PROMPT_DEFINITIONS',
    orderMarker: 'export const DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER',
  },
  {
    path: 'src/data/defaultPrompts/plurk.ts',
    module: 'DEFAULT_PLURK_POST_PROMPT_ORDER',
    definitionsMarker: 'export const PLURK_POST_PROMPT_DEFINITIONS',
    orderMarker: 'export const DEFAULT_PLURK_POST_PROMPT_ORDER',
  },
  {
    path: 'src/data/defaultPrompts/plurk.ts',
    module: 'DEFAULT_PLURK_COMMENT_PROMPT_ORDER',
    definitionsMarker: 'export const PLURK_COMMENT_PROMPT_DEFINITIONS',
    orderMarker: 'export const DEFAULT_PLURK_COMMENT_PROMPT_ORDER',
  },
];

function extractArrayBlock(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) return '';
  const blockStart = marker.trim().endsWith(':')
    ? text.indexOf(':', start)
    : text.indexOf('=', start);
  if (blockStart === -1) return '';
  const arrayStart = text.indexOf('[', blockStart);
  if (arrayStart === -1) return '';

  let depth = 0;
  let inString = false;
  let quote = '';
  let escape = false;
  for (let i = arrayStart; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(arrayStart, i + 1);
    }
  }
  return '';
}

function identifiersFromBlock(block) {
  return [...block.matchAll(/["']?identifier["']?\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

function duplicates(items) {
  return [...new Set(items.filter((item, index) => items.indexOf(item) !== index))];
}

function analyze(file) {
  const text = fs.readFileSync(file.path, 'utf8');
  const definitionIds = identifiersFromBlock(extractArrayBlock(text, file.definitionsMarker));
  const orderIds = identifiersFromBlock(extractArrayBlock(text, file.orderMarker));
  const externalIds = new Set(file.externalOrderIds ?? []);
  const orderedPrompts = orderIds.filter((id) => definitionIds.includes(id));
  const extraPrompts = definitionIds.filter((id) => !orderIds.includes(id));
  const exportedOrder = orderedPrompts.concat(extraPrompts);
  const externalOrderOnly = orderIds.filter((id) => !definitionIds.includes(id) && externalIds.has(id));
  const orderWithoutDefinition = orderIds.filter((id) => !definitionIds.includes(id) && !externalIds.has(id));
  const duplicateDefinitions = duplicates(definitionIds);
  const duplicateOrder = duplicates(orderIds);

  return {
    module: file.module,
    path: file.path,
    definitions: definitionIds.length,
    order: orderIds.length,
    exported: exportedOrder.length,
    isOrderClean: duplicateDefinitions.length === 0 && duplicateOrder.length === 0 && orderWithoutDefinition.length === 0 && extraPrompts.length === 0,
    duplicateDefinitions,
    duplicateOrder,
    externalOrderOnly,
    orderWithoutDefinition,
    definitionsNotInOrder: extraPrompts,
    first10: exportedOrder.slice(0, 10).map((id, index) => ({ index, id, exportedInjectionOrder: index })),
    last10: exportedOrder.slice(-10).map((id, offset) => {
      const index = exportedOrder.length - Math.min(10, exportedOrder.length) + offset;
      return { index, id, exportedInjectionOrder: index };
    }),
  };
}

console.log(JSON.stringify(files.map(analyze), null, 2));
