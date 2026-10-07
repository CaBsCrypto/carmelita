import ConnectionGuide from "./connection-guide";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect Carmelita with ChatGPT | Carmelita",
  description: "Create or sign in to Carmelita and ChatGPT, add Carmelita's read-only connection and review your permissions.",
};

export default function ConnectChatGPTPage() { return <ConnectionGuide />; }
