import ConnectionGuide from "../connect-chatgpt/connection-guide";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect Carmelita with Claude | Carmelita", description: "Claude read-only connector pilot: account setup, OAuth and acceptance guide." };
export default function ConnectClaudePage() { return <ConnectionGuide assistant="claude" />; }
