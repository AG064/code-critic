export const MAX_FILE_BYTES = 200_000;

export function countCodeLines(code: string): number {
  if (code.length === 0) {
    return 0;
  }
  const normalized = code.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) {
    lines.pop();
  }
  return lines.length;
}

export function sourceFileError(size: number, content: string): string | null {
  if (size > MAX_FILE_BYTES) {
    return "The file is too large. Choose a source file under 200 KB.";
  }
  if (content.includes("\u0000")) {
    return "The uploaded file must contain text source code.";
  }
  return null;
}
