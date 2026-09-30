import { Fragment } from "react";

const explorerHosts = new Set(["stellar.expert", "explorer-test.avax.network", "subnets-test.avax.network", "testnet.bscscan.com", "sepolia.basescan.org", "explorer.solana.com"]);
const marketHosts = new Set(["coingecko.com", "www.coingecko.com", "coinmarketcap.com", "www.coinmarketcap.com", "defillama.com", "www.defillama.com", "coins.llama.fi"]);
function allowlistedLink(value: string, hosts: ReadonlySet<string>) {
  try {
    if (/[\u0000-\u0020\\]/.test(value)) return null;
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.has(url.hostname) ? url.href : null;
  } catch { return null; }
}
export function safeExplorerLink(value: string) { return allowlistedLink(value, explorerHosts); }
export function safeMessageLink(value: string) { return safeExplorerLink(value) ?? allowlistedLink(value, marketHosts); }

function InlineText({ text }: { text: string }) {
  return text.split(/(\[[^\]\n]+\]\(https:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    const href = link ? safeMessageLink(link[2]) : null;
    if (link && href) return <a key={index} className="agent-message-link" href={href} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "0.15em", overflowWrap: "anywhere" }} target="_blank" rel="noopener noreferrer"><InlineText text={link[1]} /> ↗</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}><InlineText text={part.slice(2, -2)} /></strong>;
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
  return messageBlocks(content).map((block, index) => block.kind === "paragraph" ? <p key={index} style={{ overflowWrap: "anywhere", maxWidth: "100%" }}><InlineText text={block.text} /></p> : (
    <div key={index} role="region" aria-label={block.headers.join(" · ")} tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{block.headers.map((header, cell) => <th key={cell} scope="col" style={{ textAlign: "left", padding: "0.5rem" }}><InlineText text={header} /></th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((text, cell) => <td key={cell} style={{ padding: "0.5rem", verticalAlign: "top", overflowWrap: "anywhere", minWidth: /^(?:direcci[oó]n|address|endere[cç]o)$/i.test(block.headers[cell]) ? "12rem" : undefined }}><InlineText text={text} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  ));
}
