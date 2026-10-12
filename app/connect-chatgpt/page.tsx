import ConnectionGuide from "./connection-guide";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect Carmelita with ChatGPT | Carmelita",
  description: "Copy Carmelita's MCP URL, add the connection manually in ChatGPT, authorize your account and try a Stellar Testnet query.",
};

export default function ConnectChatGPTPage() { return <ConnectionGuide />; }
