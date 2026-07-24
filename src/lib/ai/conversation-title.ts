export function conversationTitle(question: string): string {
  const compact = question.replace(/\s+/g, " ").trim();
  if (compact.length <= 64) return compact;
  return `${compact.slice(0, 61).trimEnd()}…`;
}
