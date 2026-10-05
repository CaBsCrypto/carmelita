"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";
import styles from "./connection.module.css";

const MCP_URL = "https://carmelita.browns.studio/api/mcp/agent";
const OPENAI_GUIDE = "https://developers.openai.com/plugins/deploy/connect-chatgpt";
const copy = {
  es: {
    back: "Inicio", services: "Explorar servicios", title: "Conecta Carmelita con ChatGPT",
    intro: "Prepara tu cuenta en Carmelita y añade la conexión desde ChatGPT. Por ahora, la conexión es manual y requiere una cuenta y un espacio de trabajo compatibles.",
    setup: "Comienza desde ChatGPT en la web. La disponibilidad del modo desarrollador depende de tu cuenta y de las políticas de tu espacio de trabajo.",
    accountTitle: "Prepara tu cuenta en Carmelita", account: "Ingresa con Privy y espera a que termine la preparación de tus billeteras. Revisa Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet. Si ya tienes una cuenta, utiliza la misma identidad; conserva tus direcciones existentes.",
    accountNote: "Conectar ChatGPT no crea billeteras. Una dirección registrada tampoco confirma saldo ni activación en la red.", accountAction: "Ingresar a Carmelita",
    connectionTitle: "Añade la conexión en ChatGPT", connection: "En ChatGPT, abre Settings → Security and login → Developer mode. Luego abre Plugins, pulsa + y añade Carmelita como conexión a un endpoint público con la URL de abajo. Usa OAuth cuando aparezca la autenticación y continúa al inicio de sesión de Carmelita.",
    unavailable: "Si no aparece esta opción, revisa el acceso de tu cuenta o consulta al administrador. Puedes seguir usando Carmelita en su web.", url: "URL de conexión", copy: "Copiar URL", copied: "URL copiada.", copyFailed: "Selecciona la URL y cópiala manualmente.", source: "Instrucciones oficiales de OpenAI",
    consentTitle: "Revisa la cuenta y los permisos", consent: "Inicia sesión con la misma cuenta Carmelita. El servidor verifica tu identidad; escribir un correo, una dirección de billetera o abrir un enlace de historial no autoriza la conexión. Revisa cada permiso y el nombre de la aplicación antes de aceptar. Puedes denegar la conexión.",
    read: "agent:read es el permiso de lectura para consultar tus billeteras, descubrir servicios y revisar tu actividad en Carmelita. No permite comprar ni mover fondos.",
    history: "El historial de conversaciones es opcional y requiere agent:conversation mediante una autorización adicional visible. Una conexión con agent:read no obtiene ese acceso automáticamente. Revisa los permisos solicitados en cada conexión; no autorices los que no quieras conceder.",
    finish: "Después de autorizar, pulsa Continuar para volver a ChatGPT y terminar la conexión. Puedes revocar el acceso desde las conexiones de tu cuenta Carmelita.",
    testTitle: "Abre un chat y prueba la lectura", test: "Abre una conversación nueva en ChatGPT y selecciona Carmelita en el menú de herramientas. Prueba estas consultas y comprueba que las billeteras pertenecen a tu cuenta:",
    prompts: ["Muéstrame mis billeteras registradas.", "¿Qué servicios publica Bazaar y cuáles están disponibles?", "Muéstrame mi actividad reciente en Carmelita."],
    limit: "El catálogo puede ser parcial. La publicación de un servicio, suite o skill no confirma que pueda ejecutarse. La compra y el historial privado de Bazaar siguen pendientes de habilitación.",
    helpTitle: "Si la conexión se interrumpe", help: "Si la autorización queda pendiente o vence, comienza una conexión nueva desde ChatGPT. No repitas la aprobación de una operación con estado incierto. Puedes continuar en Carmelita; conserva el paso donde ocurrió el problema sin compartir tokens, códigos ni credenciales.",
    mobile: "Después de conectar, prueba desde el celular con la misma cuenta de ChatGPT. Si Carmelita no aparece en las herramientas, utiliza ChatGPT en la web y revisa el acceso de esa cuenta.", guide: "Guía de primeros pasos",
  },
  en: {
    back: "Home", services: "Explore services", title: "Connect Carmelita with ChatGPT",
    intro: "Prepare your Carmelita account, then add the connection in ChatGPT. Connection is currently manual and requires a compatible account and workspace.",
    setup: "Start in ChatGPT on the web. Developer mode availability depends on your account and workspace policies.",
    accountTitle: "Prepare your Carmelita account", account: "Sign in with Privy and wait for wallet preparation to finish. Check Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet and Stellar Testnet. If you already have an account, use the same identity and keep your existing addresses.",
    accountNote: "Connecting ChatGPT does not create wallets. A registered address does not confirm a balance or on-chain activation.", accountAction: "Sign in to Carmelita",
    connectionTitle: "Add the connection in ChatGPT", connection: "In ChatGPT, open Settings → Security and login → Developer mode. Then open Plugins, select + and add Carmelita as a public endpoint connection using the URL below. Use OAuth when authentication is offered and continue to Carmelita sign-in.",
    unavailable: "If this option is missing, check your account access or ask your administrator. You can continue using Carmelita on its website.", url: "Connection URL", copy: "Copy URL", copied: "URL copied.", copyFailed: "Select the URL and copy it manually.", source: "Official OpenAI instructions",
    consentTitle: "Review your account and permissions", consent: "Sign in with the same Carmelita account. The server verifies your identity; typing an email or wallet address, or opening a history link, does not authorize the connection. Review every permission and the application name before accepting. You can deny access.",
    read: "agent:read is the reading permission for your wallets, service discovery and your Carmelita activity. It does not authorize purchases or moving funds.",
    history: "Conversation history is optional and requires agent:conversation through additional visible authorization. An agent:read connection does not receive that access automatically. Review the requested permissions each time; do not authorize permissions you do not want to grant.",
    finish: "After authorizing, select Continue to return to ChatGPT and finish connecting. You can revoke access from the connections in your Carmelita account.",
    testTitle: "Open a chat and try reading", test: "Start a new conversation in ChatGPT and select Carmelita from the tools menu. Try these requests and check that the wallets belong to your account:",
    prompts: ["Show my registered wallets.", "What services does Bazaar publish, and which are available?", "Show my recent activity in Carmelita."],
    limit: "The catalog may be partial. Publishing a service, suite or skill does not confirm it can run. Purchases and Bazaar private history still await enablement.",
    helpTitle: "If connecting is interrupted", help: "If authorization remains pending or expires, start a new connection from ChatGPT. Do not repeat approval when its status is uncertain. You can continue in Carmelita; note the step where the problem occurred without sharing tokens, codes or credentials.",
    mobile: "After connecting, try your phone with the same ChatGPT account. If Carmelita does not appear in the tools menu, use ChatGPT on the web and check that account's access.", guide: "Getting started guide",
  },
  pt: {
    back: "Início", services: "Explorar serviços", title: "Conecte Carmelita ao ChatGPT",
    intro: "Prepare sua conta Carmelita e adicione a conexão no ChatGPT. A conexão é manual por enquanto e exige uma conta e um espaço de trabalho compatíveis.",
    setup: "Comece pelo ChatGPT na web. A disponibilidade do modo desenvolvedor depende da sua conta e das políticas do espaço de trabalho.",
    accountTitle: "Prepare sua conta Carmelita", account: "Entre com Privy e aguarde a preparação das carteiras. Confira Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet e Stellar Testnet. Se já tem uma conta, use a mesma identidade e mantenha seus endereços existentes.",
    accountNote: "Conectar o ChatGPT não cria carteiras. Um endereço registrado não confirma saldo nem ativação na rede.", accountAction: "Entrar na Carmelita",
    connectionTitle: "Adicione a conexão no ChatGPT", connection: "No ChatGPT, abra Settings → Security and login → Developer mode. Depois abra Plugins, selecione + e adicione Carmelita como conexão a um endpoint público usando a URL abaixo. Use OAuth quando a autenticação aparecer e continue para o login na Carmelita.",
    unavailable: "Se essa opção não aparecer, confira o acesso da sua conta ou consulte o administrador. Você pode continuar usando a Carmelita na web.", url: "URL de conexão", copy: "Copiar URL", copied: "URL copiada.", copyFailed: "Selecione a URL e copie manualmente.", source: "Instruções oficiais da OpenAI",
    consentTitle: "Confira a conta e as permissões", consent: "Entre com a mesma conta Carmelita. O servidor verifica sua identidade; informar um e-mail, um endereço de carteira ou abrir um link de histórico não autoriza a conexão. Confira cada permissão e o nome do aplicativo antes de aceitar. Você pode negar o acesso.",
    read: "agent:read é a permissão de leitura das suas carteiras, descoberta de serviços e atividade na Carmelita. Ela não autoriza compras nem movimentação de fundos.",
    history: "O histórico de conversas é opcional e exige agent:conversation por uma autorização adicional visível. Uma conexão com agent:read não recebe esse acesso automaticamente. Confira as permissões pedidas em cada conexão; não autorize as que não quiser conceder.",
    finish: "Depois de autorizar, selecione Continuar para voltar ao ChatGPT e concluir a conexão. Você pode revogar o acesso nas conexões da sua conta Carmelita.",
    testTitle: "Abra um chat e teste a leitura", test: "Inicie uma conversa nova no ChatGPT e selecione Carmelita no menu de ferramentas. Teste estas consultas e confira se as carteiras pertencem à sua conta:",
    prompts: ["Mostre minhas carteiras registradas.", "Quais serviços o Bazaar publica e quais estão disponíveis?", "Mostre minha atividade recente na Carmelita."],
    limit: "O catálogo pode ser parcial. Publicar um serviço, suite ou skill não confirma que ele pode ser executado. Compras e histórico privado do Bazaar ainda aguardam habilitação.",
    helpTitle: "Se a conexão for interrompida", help: "Se a autorização ficar pendente ou expirar, inicie uma conexão nova pelo ChatGPT. Não repita a aprovação quando o estado for incerto. Você pode continuar na Carmelita; anote a etapa do problema sem compartilhar tokens, códigos ou credenciais.",
    mobile: "Depois de conectar, teste no celular com a mesma conta do ChatGPT. Se Carmelita não aparecer nas ferramentas, use o ChatGPT na web e confira o acesso dessa conta.", guide: "Guia de primeiros passos",
  },
};

export default function ConnectionGuide() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const field = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  async function copyUrl() {
    try { await navigator.clipboard.writeText(MCP_URL); setCopyState("copied"); }
    catch { field.current?.focus(); field.current?.select(); setCopyState("failed"); }
  }
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label={t.back}>
        <Link href="/" aria-label={t.back}><BrandLockup /></Link>
        <LanguageToggle locale={locale} onChange={setLocale} compact />
      </nav>
      <header className={styles.hero}><h1>{t.title}</h1><p>{t.intro}</p><p className={styles.note}>{t.setup}</p></header>
      <ol className={styles.steps}>
        <li><section><h2>{t.accountTitle}</h2><p>{t.account}</p><p className={styles.note}>{t.accountNote}</p><Link className={styles.button} href="/agent">{t.accountAction}</Link></section></li>
        <li><section><h2>{t.connectionTitle}</h2><p>{t.connection}</p><label className={styles.urlLabel} htmlFor="mcp-url">{t.url}</label><div className={styles.urlRow}><input id="mcp-url" ref={field} readOnly value={MCP_URL} /><button type="button" onClick={copyUrl}>{t.copy}</button></div><p className={styles.copyStatus} role="status">{copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : ""}</p><p className={styles.note}>{t.unavailable}</p><a href={OPENAI_GUIDE} target="_blank" rel="noreferrer">{t.source} ↗</a></section></li>
        <li><section><h2>{t.consentTitle}</h2><p>{t.consent}</p><p className={styles.permission}>{t.read}</p><p>{t.history}</p><p className={styles.note}>{t.finish}</p></section></li>
        <li><section><h2>{t.testTitle}</h2><p>{t.test}</p><ul className={styles.prompts}>{t.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul><p className={styles.note}>{t.limit}</p></section></li>
      </ol>
      <aside className={styles.help}><h2>{t.helpTitle}</h2><p>{t.help}</p><p>{t.mobile}</p></aside>
      <footer className={styles.footer}><Link href="/services">{t.services}</Link><Link href="/guide">{t.guide}</Link></footer>
    </main>
  );
}
