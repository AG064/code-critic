function removeUnsafeControls(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function stripWholeFence(value: string): string {
  const match = value.match(/^```(?:json)?[ \t]*\n([\s\S]*?)\n```[ \t]*$/i);
  return match?.[1]?.trim() ?? value;
}

function stripLeadingArtifact(value: string): string {
  const patterns = [
    /^(?:certainly|sure)\b[!,.][ \t]*/i,
    /^(?:as|speaking as)\s+an?\s+(?:ai|artificial intelligence)(?:\s+(?:language model|code reviewer|reviewer|assistant))?(?:(?:\.\.\.|[,.:;!])[ \t]*|\n+\s*|$)/i,
    /^i(?:'m| am)\s+an?\s+(?:ai|artificial intelligence)(?:\s+(?:language model|code reviewer|reviewer|assistant))?(?:(?:\.\.\.|[,.:;!])[ \t]*|\n+\s*|$)/i,
    /^(?:here|below)\s+(?:is|are)(?:\s+(?:my|the))?\s+(?:code\s+)?(?:analysis|review|report|assessment)(?:\s+(?:result|output))?(?:\s+of\s+(?:the|this)\s+code)?(?:[:.!][ \t]*|\n+\s*|$)/i
  ];
  let result = value.trimStart();

  for (let count = 0; count < patterns.length; count += 1) {
    const pattern = patterns.find((candidate) => candidate.test(result));
    if (!pattern) {
      break;
    }
    result = result.replace(pattern, "").trimStart();
  }

  return result.trim();
}

export function parseReportJson(raw: string): unknown {
  const cleaned = stripWholeFence(removeUnsafeControls(raw.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n")).trim());

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) {
      throw new SyntaxError("Expected one JSON object.");
    }
    const outside = `${cleaned.slice(0, start)}${cleaned.slice(end)}`;
    if (outside.length > 1_000 || /[\[\]{},]/.test(outside)) {
      throw new SyntaxError("Unexpected content outside the JSON object.");
    }

    try {
      return JSON.parse(cleaned.slice(start, end)) as unknown;
    } catch {
      throw new SyntaxError("Expected one JSON object.");
    }
  }
}

function splitTableRow(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }

  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  let escaped = false;

  for (const character of trimmed.slice(1, -1)) {
    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      cell += character;
      escaped = true;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      cell += character;
      continue;
    }
    if (character === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }

  cells.push(cell.trim());
  return cells.length > 1 ? cells : null;
}

function normalizeFence(value: string): string | null {
  const match = value.trim().match(/^```[ \t]*([a-z0-9_+#.-]+)?[ \t]*$/i);
  if (!match) {
    return null;
  }
  return `\`\`\`${match[1] ?? ""}`;
}

function normalizeSeparatorCell(value: string): string {
  const left = value.startsWith(":") ? ":" : "";
  const right = value.endsWith(":") ? ":" : "";
  return `${left}---${right}`;
}

function normalizeTableRows(rows: string[][]): string[] {
  const columnCount = Math.max(...rows.map((row) => row.length));

  return rows.map((row) => {
    const separator = row.length > 0 && row.every((cell) => /^:?-+:?$/.test(cell));
    const cells = Array.from({ length: columnCount }, (_, index) => {
      const cell = row[index] ?? "";
      return separator ? normalizeSeparatorCell(cell || "---") : cell;
    });
    return `| ${cells.join(" | ")} |`;
  });
}

export function normalizeReportText(value: string): string {
  const lines = removeUnsafeControls(value.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n")).split("\n");
  const output: string[] = [];
  let tableRows: string[][] = [];
  let inCodeBlock = false;
  let previousWasBlank = false;

  const flushTable = () => {
    if (tableRows.length === 0) {
      return;
    }
    output.push(...normalizeTableRows(tableRows));
    tableRows = [];
  };

  for (const sourceLine of lines) {
    const fence = normalizeFence(sourceLine);
    if (fence !== null) {
      flushTable();
      output.push(inCodeBlock ? "```" : fence);
      inCodeBlock = !inCodeBlock;
      previousWasBlank = false;
      continue;
    }

    if (inCodeBlock) {
      output.push(sourceLine);
      continue;
    }

    const line = sourceLine.trimEnd();
    if (!line.trim()) {
      flushTable();
      if (!previousWasBlank && output.length > 0) {
        output.push("");
      }
      previousWasBlank = true;
      continue;
    }

    const tableCells = splitTableRow(line);
    if (tableCells) {
      tableRows.push(tableCells);
    } else {
      flushTable();
      output.push(line);
    }
    previousWasBlank = false;
  }

  flushTable();

  if (inCodeBlock) {
    output.push("```");
  }

  while (output.at(-1) === "") {
    output.pop();
  }
  return stripLeadingArtifact(output.join("\n"));
}

export function normalizeInlineText(value: string): string {
  return normalizeReportText(value).replace(/\s+/g, " ");
}
