export interface ExtensionToolResult {
  content: [{ type: 'text'; text: string }];
  details: Record<string, unknown>;
}

export function textToolResult(
  text: string,
  details: Record<string, unknown> = {},
): ExtensionToolResult {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

export function errorToolResult(
  message: string,
  details: Record<string, unknown> = {},
): ExtensionToolResult {
  const text = message.startsWith('Error:') ? message : `Error: ${message}`;
  return textToolResult(text, details);
}
