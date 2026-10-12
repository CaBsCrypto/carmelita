import GuideClient from "./guide-client";

export const metadata = {
  title: "Guía para empezar | Carmelita",
  description:
    "Conecta Carmelita con ChatGPT, autoriza tu cuenta y empieza a consultar Stellar Testnet. Guía de uso y alternativa desde el chat de Carmelita.",
};

export default function GuidePage() {
  return <GuideClient />;
}
