import { Fragment } from "react";

const explorerHosts = new Set(["stellar.expert", "explorer-test.avax.network", "subnets-test.avax.network", "testnet.bscscan.com", "sepolia.basescan.org", "explorer.solana.com"]);
export function safeExplorerLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && explorerHosts.has(url.hostname) ? url.href : null;
  } catch { return null; }
}

function InlineText({ text }: { text: string }) {
  return text.split(/(\[[^\]\n]+\]\(https:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    const href = link ? safeExplorerLink(link[2]) : null;
    if (link && href) return <a key={index} href={href} target="_blank" rel="noopener noreferrer">{link[1]} ↗</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export type MessageBlock = { kind: "paragraph"; text: string } | { kind: "table"; headers: string[]; rows: string[][] };
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
export function messageBlocks(content: string): MessageBlock[] {
  const lines = content.split("\n");
  const result: MessageBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const header = lines[index];
    const separator = lines[index + 1];
    if (header.trim().startsWith("|") && separator && cells(separator).every(cell => /^:?-{3,}:?$/.test(cell)) && cells(header).length === cells(separator).length) {
      const headers = cells(header);
      const rows: string[][] = [];
      index++;
      while (lines[index + 1]?.trim().startsWith("|") && cells(lines[index + 1]).length === headers.length) rows.push(cells(lines[++index]));
      result.push({ kind: "table", headers, rows });
    } else result.push({ kind: "paragraph", text: header });
  }
  return result;
}

export function MessageText({ content }: { content: string }) {
  return messageBlocks(content).map((block, index) => block.kind === "paragraph" ? <p key={index}><InlineText text={block.text} /></p> : (
    <div key={index} role="region" aria-label={block.headers.join(" · ")} tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{block.headers.map((header, cell) => <th key={cell} scope="col" style={{ textAlign: "left", padding: "0.5rem" }}><InlineText text={header} /></th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((text, cell) => <td key={cell} style={{ padding: "0.5rem", verticalAlign: "top", overflowWrap: "anywhere", minWidth: cell === 1 ? "12rem" : undefined }}><InlineText text={text} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  ));
}
