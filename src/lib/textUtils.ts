/**
 * Strips HTML tags from a string and returns plain text.
 * Useful for displaying previews of rich text content.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}
