import ConnectionGuide from "./connection-guide";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect Carmelita with ChatGPT | Carmelita",
  description: "Connect your multichain personal agent to ChatGPT. Authorize Carmelita and ask about your registered test-network wallets, recent Carmelita activity and market quotes.",
};

export default function ConnectChatGPTPage() { return <ConnectionGuide />; }
