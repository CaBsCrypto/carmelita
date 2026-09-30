"use client";

import Link from "next/link";
import BrandLockup from "../brand-lockup";
import { useState } from "react";
import LanguageToggle, { useLocale } from "../language-toggle";

const copy = {
  en: {
    back: "Home", agent: "Open chat", eyebrow: "START HERE",
    title: "Meet Carmelita through chat.",
    lede: "Sign in with Privy, ask for your test wallets and explore what Carmelita can do.",
    badges: ["Test networks", "Wallet queries", "English · Español · Português"],
    before: "Before you begin", beforeTitle: "Start with a query.",
    beforeText: "This first visit requires no deposit, payment or transaction signature. Privy provides your identity; Carmelita retrieves or prepares your Stellar, EVM and Solana wallet records.",
    beforeItems: ["Existing wallets keep their addresses.", "The three enabled EVM test networks share one address.", "A registered wallet does not prove a balance or activation on the network."],
    journey: "YOUR FIRST VISIT", journeyTitle: "Sign in. Ask. Explore.",
    journeyText: "Use the chat for these queries. Open wallet details or other sections only when you need them.",
    steps: [
      ["01", "Sign in with Privy", "Open chat and choose an available sign-in method. Wait for your wallet records to load.", ""],
      ["02", "Ask for your wallets", "Check the network, address, registration status and explorer for each available wallet. Complete preparation provides three wallet families across five test networks.", "Show my wallets and their networks"],
      ["03", "Explore functions", "Ask what you can do. Start with queries and discovery; sensitive actions require a separate review.", "What can I do with Carmelita?"],
    ],
    copy: "Copy", copied: "Copied", copyFailed: "Could not copy. Select the message above.",
    help: "COMMON QUESTIONS", helpTitle: "If something is missing",
    problems: [
      ["Some wallets are still being prepared", "Consult the available wallets and retry preparation if the interface offers it. Do not create another account to retry."],
      ["A wallet is registered but has no balance", "Registration, network activation and balance are different states. Check the network details; this first visit does not require funding."],
      ["I cannot load my wallets", "Retry from the displayed error. If the problem continues, report what happened without sharing credentials or private keys."],
    ],
    chatgpt: "OPTIONAL CONNECTION", chatgptTitle: "Use Carmelita from ChatGPT",
    chatgptText: "You can complete this visit inside Carmelita. To use ChatGPT, you also need access to the Carmelita connector and must authorize the same account. Availability in an external ChatGPT account has not yet been verified.",
    chatgptHelp: "If you cannot access the connector or the connection stalls, continue in Carmelita and report the step that failed. Never share tokens.",
    advanced: "Advanced documentation and integrations",
    advancedText: "Testnet funding, trustlines and deposits are outside this first visit. Review the requirements and confirmation flow before requesting a financial action. Signing in or reading this guide does not authorize one.",
    developers: "Open developer documentation", footer: "Testnet · Start with queries",
  },
  es: {
    back: "Inicio", agent: "Abrir chat", eyebrow: "COMIENZA AQUÍ",
    title: "Conoce Carmelita desde el chat.",
    lede: "Ingresa con Privy, consulta tus billeteras de prueba y explora qué puedes hacer con Carmelita.",
    badges: ["Redes de prueba", "Consulta de billeteras", "English · Español · Português"],
    before: "Antes de comenzar", beforeTitle: "Comienza con una consulta.",
    beforeText: "Este primer recorrido no requiere depósitos, pagos ni firmas de transacciones. Privy proporciona tu identidad; Carmelita recupera o prepara los registros de tus billeteras Stellar, EVM y Solana.",
    beforeItems: ["Las billeteras existentes conservan sus direcciones.", "Las tres redes EVM de prueba habilitadas comparten una dirección.", "Una billetera registrada no demuestra saldo ni activación en la red."],
    journey: "TU PRIMER RECORRIDO", journeyTitle: "Ingresa. Consulta. Explora.",
    journeyText: "Haz estas consultas desde el chat. Abre el detalle de billeteras u otras secciones cuando lo necesites.",
    steps: [
      ["01", "Ingresa con Privy", "Abre el chat y elige un método de ingreso disponible. Espera a que carguen los registros de tus billeteras.", ""],
      ["02", "Consulta tus billeteras", "Revisa red, dirección, estado de registro y explorador de cada billetera disponible. La preparación completa ofrece tres familias de billeteras en cinco redes de prueba.", "Muéstrame mis billeteras y sus redes"],
      ["03", "Explora las funciones", "Pregunta qué puedes hacer. Comienza con consultas y búsquedas; las acciones sensibles requieren una revisión por separado.", "¿Qué puedo hacer con Carmelita?"],
    ],
    copy: "Copiar", copied: "Copiado", copyFailed: "No pudimos copiar. Selecciona el mensaje de arriba.",
    help: "PREGUNTAS COMUNES", helpTitle: "Si falta algo",
    problems: [
      ["Algunas billeteras siguen en preparación", "Consulta las billeteras disponibles y reintenta la preparación si la interfaz lo permite. No crees otra cuenta para reintentar."],
      ["Una billetera está registrada pero no tiene saldo", "Registro, activación en la red y saldo son estados distintos. Consulta el detalle de la red; este primer recorrido no requiere financiación."],
      ["No puedo cargar mis billeteras", "Reintenta desde el error mostrado. Si continúa, reporta lo ocurrido sin compartir credenciales ni claves privadas."],
    ],
    chatgpt: "CONEXIÓN OPCIONAL", chatgptTitle: "Usar Carmelita desde ChatGPT",
    chatgptText: "Puedes completar este recorrido dentro de Carmelita. Para usar ChatGPT también necesitas acceso al complemento de Carmelita y autorizar la misma cuenta. La disponibilidad en una cuenta externa de ChatGPT todavía no está verificada.",
    chatgptHelp: "Si no puedes acceder al complemento o la conexión se queda esperando, continúa en Carmelita y reporta el paso que falló. Nunca compartas tokens.",
    advanced: "Documentación avanzada e integraciones",
    advancedText: "La financiación Testnet, las trustlines y los depósitos quedan fuera de este primer recorrido. Revisa los requisitos y el flujo de confirmación antes de solicitar una acción financiera. Ingresar o leer esta guía no la autoriza.",
    developers: "Abrir documentación para desarrolladores", footer: "Testnet · Comienza con consultas",
  },
  pt: {
    back: "Início", agent: "Abrir chat", eyebrow: "COMECE AQUI",
    title: "Conheça a Carmelita pelo chat.",
    lede: "Entre com a Privy, consulte suas carteiras de teste e explore o que pode fazer com a Carmelita.",
    badges: ["Redes de teste", "Consulta de carteiras", "English · Español · Português"],
    before: "Antes de começar", beforeTitle: "Comece com uma consulta.",
    beforeText: "Esta primeira visita não exige depósitos, pagamentos ou assinaturas de transações. A Privy fornece sua identidade; a Carmelita recupera ou prepara os registros das suas carteiras Stellar, EVM e Solana.",
    beforeItems: ["As carteiras existentes mantêm seus endereços.", "As três redes EVM de teste habilitadas compartilham um endereço.", "Uma carteira registrada não comprova saldo ou ativação na rede."],
    journey: "SUA PRIMEIRA VISITA", journeyTitle: "Entre. Consulte. Explore.",
    journeyText: "Faça estas consultas pelo chat. Abra os detalhes das carteiras ou outras seções quando precisar.",
    steps: [
      ["01", "Entre com a Privy", "Abra o chat e escolha um método de acesso disponível. Aguarde o carregamento dos registros das suas carteiras.", ""],
      ["02", "Consulte suas carteiras", "Confira rede, endereço, status de registro e explorador de cada carteira disponível. A preparação completa oferece três famílias de carteiras em cinco redes de teste.", "Mostre minhas carteiras e suas redes"],
      ["03", "Explore as funções", "Pergunte o que pode fazer. Comece com consultas e buscas; ações sensíveis exigem uma revisão separada.", "O que posso fazer com a Carmelita?"],
    ],
    copy: "Copiar", copied: "Copiado", copyFailed: "Não foi possível copiar. Selecione a mensagem acima.",
    help: "PERGUNTAS COMUNS", helpTitle: "Se algo estiver faltando",
    problems: [
      ["Algumas carteiras continuam em preparação", "Consulte as carteiras disponíveis e tente a preparação novamente se a interface permitir. Não crie outra conta para tentar novamente."],
      ["Uma carteira está registrada mas não tem saldo", "Registro, ativação na rede e saldo são estados diferentes. Consulte os detalhes da rede; esta primeira visita não exige financiamento."],
      ["Não consigo carregar minhas carteiras", "Tente novamente a partir do erro exibido. Se continuar, relate o ocorrido sem compartilhar credenciais ou chaves privadas."],
    ],
    chatgpt: "CONEXÃO OPCIONAL", chatgptTitle: "Usar a Carmelita pelo ChatGPT",
    chatgptText: "Você pode concluir esta visita dentro da Carmelita. Para usar o ChatGPT, também precisa de acesso ao conector da Carmelita e autorizar a mesma conta. A disponibilidade em uma conta externa do ChatGPT ainda não foi verificada.",
    chatgptHelp: "Se não conseguir acessar o conector ou a conexão ficar esperando, continue na Carmelita e relate a etapa que falhou. Nunca compartilhe tokens.",
    advanced: "Documentação avançada e integrações",
    advancedText: "Financiamento Testnet, trustlines e depósitos estão fora desta primeira visita. Confira os requisitos e o fluxo de confirmação antes de solicitar uma ação financeira. Entrar ou ler este guia não autoriza essa ação.",
    developers: "Abrir documentação para desenvolvedores", footer: "Testnet · Comece com consultas",
  },
};

function Command({ value, t }: { value: string; t: typeof copy.en }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("error");
    }
  }
  return <div className="guide-command">
    <code>{value}</code>
    <button type="button" aria-label={`${t.copy}: ${value}`} onClick={() => void copyCommand()}>{state === "copied" ? t.copied : t.copy}</button>
    <span role="status">{state === "error" ? t.copyFailed : state === "copied" ? t.copied : ""}</span>
  </div>;
}

export default function GuideClient() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  return <main className="guide-page" lang={locale}>
    <nav className="guide-nav shell">
      <Link className="brand" href="/"><BrandLockup /></Link>
      <div><Link href="/">{t.back}</Link><LanguageToggle locale={locale} onChange={setLocale} compact /><Link className="guide-nav-agent" href="/agent">{t.agent}</Link></div>
    </nav>
    <header className="guide-hero shell">
      <div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p className="lede">{t.lede}</p><div className="guide-badges">{t.badges.map(badge => <span key={badge}>{badge}</span>)}</div></div>
      <aside><span>{t.before}</span><h2>{t.beforeTitle}</h2><p>{t.beforeText}</p><ul>{t.beforeItems.map(item => <li key={item}>{item}</li>)}</ul></aside>
    </header>
    <section className="guide-journey shell" aria-labelledby="guide-journey-title">
      <div className="guide-heading"><p className="eyebrow">{t.journey}</p><h2 id="guide-journey-title">{t.journeyTitle}</h2><p>{t.journeyText}</p></div>
      <ol>{t.steps.map(([number, title, description, command]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p>{command && <Command value={command} t={t} />}</div></li>)}</ol>
    </section>
    <section className="guide-safety shell">
      <div><p className="eyebrow">{t.help}</p><h2>{t.helpTitle}</h2><div className="guide-faq">{t.problems.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div>
      <div><p className="eyebrow">{t.chatgpt}</p><h2>{t.chatgptTitle}</h2><p>{t.chatgptText}</p><p>{t.chatgptHelp}</p></div>
    </section>
    <section className="guide-next shell">
      <details><summary>{t.advanced}</summary><p>{t.advancedText}</p><Link href="/developers">{t.developers}</Link></details>
      <Link href="/agent">{t.agent}</Link>
    </section>
    <footer className="guide-footer shell"><Link className="brand" href="/"><BrandLockup /></Link><span>{t.footer}</span></footer>
  </main>;
}
