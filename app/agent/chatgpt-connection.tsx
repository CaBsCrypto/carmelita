"use client";

import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { Locale } from "../language-toggle";
import { OPENAI_GUIDE } from "../connect-chatgpt/connection-config";
import AgentPanel from "./agent-panel";
import styles from "./chatgpt-connection.module.css";
import ConnectionAccount from "../connect-chatgpt/connection-account";
import { useConnectionEnvironment } from "../connect-chatgpt/connection-environment";

const copy = {
  es: {
    button: "Conectar con ChatGPT", title: "Lleva Carmelita a ChatGPT", close: "Cerrar",
    intro: "Conecta tu cuenta una vez y consulta tus billeteras desde el chat. Comienza en ChatGPT en la web.",
    accountTitle: "Ingresa a Carmelita",
    account: "Si aún no ingresaste, cierra esta guía y pulsa Ingresar en Carmelita. Continúa con email, Google o passkey; usarás esta misma identidad al conectar ChatGPT.",
    signedIn: "Tu sesión de Carmelita ya está iniciada. Usa esta misma identidad cuando ChatGPT te pida conectar tu cuenta.",
    signInUnavailable: "El ingreso está temporalmente no disponible. Puedes copiar la URL y revisar estos pasos; vuelve a Carmelita para iniciar sesión cuando el acceso se restablezca.",
    urlTitle: "Copia la URL de conexión", urlHelp: "Esta es la dirección que debes pegar en el campo URL del servidor en ChatGPT.",
    urlLabel: "URL del servidor MCP", copy: "Copiar URL", copied: "URL copiada", copyFailed: "No pudimos copiarla. La URL está seleccionada; cópiala manualmente.",
    pluginTitle: "Añade Carmelita en ChatGPT",
    plugin: "Abre Complementos → + → Añadir servidor MCP personalizado. Ponle el nombre Carmelita, pega la URL y elige OAuth. Revisa el aviso y crea el complemento; instálalo si aparece ese paso.",
    availability: "Si tu cuenta lo requiere, activa Modo desarrollador en Ajustes → Seguridad e inicio de sesión. La opción depende de tu cuenta y de las políticas de tu espacio de trabajo.",
    openChatGPT: "Abrir complementos en ChatGPT",
    consentTitle: "Conecta tu cuenta y prueba",
    consent: "Inicia sesión con tu misma identidad Carmelita, revisa los permisos y autoriza sólo los que quieras compartir. Después, pulsa Continuar para volver a ChatGPT.",
    prompt: "Abre un chat nuevo, escribe @Carmelita y pregunta:", example: "Muéstrame mis billeteras registradas.",
    permissions: "El permiso agent:read permite consultas. El historial de conversaciones necesita consentimiento adicional; conectar no autoriza compras ni mover fondos.",
    fullGuide: "Ver guía completa", officialGuide: "Ayuda oficial de OpenAI",
  },
  en: {
    button: "Connect with ChatGPT", title: "Bring Carmelita to ChatGPT", close: "Close",
    intro: "Connect your account once and read your wallets in chat. Start in ChatGPT on the web.",
    accountTitle: "Sign in to Carmelita",
    account: "If you have not signed in, close this guide and select Sign in to Carmelita. Continue with email, Google or a passkey; use this same identity when connecting ChatGPT.",
    signedIn: "You are already signed in to Carmelita. Use this same identity when ChatGPT asks you to connect your account.",
    signInUnavailable: "Sign-in is temporarily unavailable. You can copy the URL and read these steps; return to Carmelita to sign in when access is restored.",
    urlTitle: "Copy the connection URL", urlHelp: "Paste this address into the Server URL field in ChatGPT.",
    urlLabel: "MCP server URL", copy: "Copy URL", copied: "URL copied", copyFailed: "We could not copy it. The URL is selected; copy it manually.",
    pluginTitle: "Add Carmelita in ChatGPT",
    plugin: "Open Plugins → + → Add custom MCP server. Name it Carmelita, paste the URL and choose OAuth. Review the notice and create the plugin; install it if that step appears.",
    availability: "If your account requires it, enable Developer mode in Settings → Security and login. Availability depends on your account and workspace policies.",
    openChatGPT: "Open ChatGPT plugins",
    consentTitle: "Connect your account and try it",
    consent: "Sign in with your same Carmelita identity, review the permissions and authorize only what you want to share. Then select Continue to return to ChatGPT.",
    prompt: "Start a new chat, type @Carmelita and ask:", example: "Show my registered wallets.",
    permissions: "The agent:read permission allows queries. Conversation history requires additional consent; connecting does not authorize purchases or moving funds.",
    fullGuide: "Read the full guide", officialGuide: "Official OpenAI help",
  },
  pt: {
    button: "Conectar ao ChatGPT", title: "Leve Carmelita ao ChatGPT", close: "Fechar",
    intro: "Conecte sua conta uma vez e consulte suas carteiras no chat. Comece pelo ChatGPT na web.",
    accountTitle: "Entre na Carmelita",
    account: "Se ainda não entrou, feche este guia e selecione Entrar na Carmelita. Continue com email, Google ou passkey; use esta mesma identidade ao conectar o ChatGPT.",
    signedIn: "Sua sessão Carmelita já está iniciada. Use esta mesma identidade quando o ChatGPT pedir para conectar sua conta.",
    signInUnavailable: "O acesso está temporariamente indisponível. Você pode copiar a URL e conferir as etapas; volte à Carmelita para entrar quando o acesso for restabelecido.",
    urlTitle: "Copie a URL de conexão", urlHelp: "Cole este endereço no campo URL do servidor no ChatGPT.",
    urlLabel: "URL do servidor MCP", copy: "Copiar URL", copied: "URL copiada", copyFailed: "Não foi possível copiar. A URL está selecionada; copie manualmente.",
    pluginTitle: "Adicione Carmelita no ChatGPT",
    plugin: "Abra Plugins → + → Add custom MCP server. Use o nome Carmelita, cole a URL e escolha OAuth. Confira o aviso e crie o plugin; instale se essa etapa aparecer.",
    availability: "Se sua conta exigir, ative Developer mode em Settings → Security and login. A disponibilidade depende da conta e das políticas do espaço de trabalho.",
    openChatGPT: "Abrir plugins no ChatGPT",
    consentTitle: "Conecte sua conta e teste",
    consent: "Entre com sua mesma identidade Carmelita, confira as permissões e autorize apenas o que deseja compartilhar. Depois, selecione Continuar para voltar ao ChatGPT.",
    prompt: "Abra um chat novo, digite @Carmelita e pergunte:", example: "Mostre minhas carteiras registradas.",
    permissions: "A permissão agent:read permite consultas. O histórico de conversas exige consentimento adicional; conectar não autoriza compras nem movimentação de fundos.",
    fullGuide: "Ver o guia completo", officialGuide: "Ajuda oficial da OpenAI",
  },
};

const quick = {
  es: { title: "Añade Carmelita en ChatGPT", action: "Añadir Carmelita en ChatGPT", help: "Copia la URL y abre los complementos. Pégala al añadir un servidor MCP y elige OAuth.", tutorial: "Tutorial paso a paso", account: "¿Aún no tienes cuenta Carmelita?", accountHelp: "Créala o ingresa antes de autorizar la conexión. Si ya tienes cuenta, continúa directamente en ChatGPT." },
  en: { title: "Add Carmelita in ChatGPT", action: "Add Carmelita in ChatGPT", help: "Copy the URL and open plugins. Paste it when adding an MCP server and choose OAuth.", tutorial: "Step-by-step tutorial", account: "Need a Carmelita account?", accountHelp: "Create one or sign in before authorizing the connection. Already have an account? Continue directly in ChatGPT." },
  pt: { title: "Adicione Carmelita no ChatGPT", action: "Adicionar Carmelita no ChatGPT", help: "Copie a URL e abra os plugins. Cole ao adicionar um servidor MCP e escolha OAuth.", tutorial: "Tutorial passo a passo", account: "Ainda não tem conta Carmelita?", accountHelp: "Crie sua conta ou entre antes de autorizar a conexão. Se já tem conta, continue diretamente no ChatGPT." },
};

const extra = {
  es: { account: "Prepara tu cuenta Carmelita", chatgpt: "Crea tu cuenta o ingresa a ChatGPT", create: "Crear cuenta o ingresar a ChatGPT", accountHelp: "Son dos cuentas distintas. Crear una cuenta ChatGPT no garantiza permiso para añadir un MCP. Conserva esta guía abierta mientras completas el registro.", missing: "No encuentro cómo agregar Carmelita", help: "En ChatGPT en la web, busca Complementos → + → Añadir servidor MCP personalizado. Si la opción no aparece, revisa las políticas de tu espacio con su administrador y la ayuda oficial. Carmelita no puede verificar ni cambiar esos permisos. Puedes continuar usando su web.", qa: "Prueba QA · datos separados de producción", production: "Producción · tu cuenta Carmelita", unavailable: "La URL de este entorno no está configurada. No copies una dirección de otro entorno.", test: "La conexión se verifica al recibir tus datos en ChatGPT. Copiar la URL o registrar OAuth no completa esta prueba.", wallets: "Después, prueba: ¿Qué servicios publica Bazaar y cuáles están disponibles?", limit: "El catálogo puede ser parcial. Las compras y el historial privado de Bazaar siguen pendientes; publicar una suite o skill no la hace ejecutable." },
  en: { account: "Prepare your Carmelita account", chatgpt: "Create an account or sign in to ChatGPT", create: "Create an account or sign in to ChatGPT", accountHelp: "These are two separate accounts. Creating a ChatGPT account does not guarantee permission to add an MCP. Keep this guide open while registering.", missing: "I cannot find how to add Carmelita", help: "In ChatGPT on the web, look for Plugins → + → Add custom MCP server. If it is missing, check workspace policies with your administrator and official help. Carmelita cannot verify or change those permissions. You can continue using its website.", qa: "QA test · data separate from production", production: "Production · your Carmelita account", unavailable: "This environment's URL is not configured. Do not copy another environment's address.", test: "The connection is verified when ChatGPT returns your own data. Copying the URL or recording OAuth does not complete this test.", wallets: "Then try: What services does Bazaar publish, and which are available?", limit: "The catalog may be partial. Purchases and Bazaar private history remain pending; publishing a suite or skill does not make it executable." },
  pt: { account: "Prepare sua conta Carmelita", chatgpt: "Crie sua conta ou entre no ChatGPT", create: "Criar conta ou entrar no ChatGPT", accountHelp: "São duas contas distintas. Criar uma conta ChatGPT não garante permissão para adicionar um MCP. Mantenha este guia aberto durante o cadastro.", missing: "Não encontro como adicionar Carmelita", help: "No ChatGPT na web, procure Plugins → + → Add custom MCP server. Se não aparecer, confira as políticas do espaço com o administrador e a ajuda oficial. A Carmelita não pode verificar ou mudar essas permissões. Você pode continuar usando o site.", qa: "Teste QA · dados separados da produção", production: "Produção · sua conta Carmelita", unavailable: "A URL deste ambiente não está configurada. Não copie o endereço de outro ambiente.", test: "A conexão é verificada quando o ChatGPT retorna seus próprios dados. Copiar a URL ou registrar OAuth não conclui esse teste.", wallets: "Depois, teste: Quais serviços o Bazaar publica e quais estão disponíveis?", limit: "O catálogo pode ser parcial. Compras e histórico privado do Bazaar seguem pendentes; publicar uma suite ou skill não a torna executável." },
};

export function ConnectionSteps({ locale, onExternalDialog, fullPage = false }: { locale: Locale; onExternalDialog?: () => void; fullPage?: boolean }) {
  const Heading = fullPage ? "h2" : "h3";
  const t = copy[locale];
  const e = extra[locale];
  const q = quick[locale];
  const { mcpUrl, environment } = useConnectionEnvironment();
  const fieldId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  async function copyUrl() {
    if (!mcpUrl) return;
    try { await navigator.clipboard.writeText(mcpUrl); setCopyState("copied"); }
    catch { field.current?.focus(); field.current?.select(); setCopyState("failed"); }
  }
  return <div className={styles.guide}>
    <p className={styles.intro}>{t.intro}</p>
    <p className={styles.permissions}>{environment === "unavailable" ? e.unavailable : e[environment]}</p>
    <section className={styles.quickStart} aria-label={q.title}>
      <Heading>{q.title}</Heading><p>{q.help}</p><a className={styles.primaryAction} href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">{q.action}</a>
    <div className={styles.urlBox}>
      <label htmlFor={fieldId}>{t.urlLabel}</label>
      <textarea id={fieldId} ref={field} readOnly rows={2} value={mcpUrl ?? ""} spellCheck={false} />
      <button className={styles.copyButton} disabled={!mcpUrl} type="button" onClick={() => void copyUrl()}>{copyState === "copied" ? t.copied : t.copy}</button>
      <span className={styles.copyStatus} role="status">{copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : ""}</span>
    </div>
    </section>
    <details className={styles.accountPreparation}><summary>{q.account}</summary><p>{q.accountHelp}</p><ConnectionAccount locale={locale} onExternalDialog={onExternalDialog} /></details>
    <Heading className={styles.tutorialTitle}>{q.tutorial}</Heading>
    <ol className={styles.steps}>
      <li><span className={styles.stepNumber} aria-hidden="true">1</span><Heading>{t.pluginTitle}</Heading><p>{t.plugin}</p><p className={styles.note}>{t.availability}</p><a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">{t.openChatGPT}</a><details><summary>{e.missing}</summary><p>{e.help}</p><a href={OPENAI_GUIDE} target="_blank" rel="noreferrer">{t.officialGuide}</a></details></li>
      <li><span className={styles.stepNumber} aria-hidden="true">2</span><Heading>{t.consentTitle}</Heading><p>{t.consent}</p><p>{t.prompt}</p><blockquote className={styles.example}>{t.example}</blockquote><p>{e.wallets}</p><p className={styles.note}>{e.test}</p></li>
    </ol>
    <p className={styles.permissions}>{t.permissions}</p><p className={styles.note}>{e.limit}</p>
    <footer className={styles.footer}><Link href={fullPage ? "/services" : "/connect-chatgpt"}>{fullPage ? ({ es: "Explorar servicios", en: "Explore services", pt: "Explorar serviços" }[locale]) : t.fullGuide}</Link><a href={OPENAI_GUIDE} target="_blank" rel="noreferrer">{t.officialGuide}</a></footer>
  </div>;
}

export default function ChatGPTConnection({ locale }: { locale: Locale; authenticated?: boolean; signInAvailable?: boolean }) {
  const t = copy[locale];
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={styles.trigger} aria-haspopup="dialog" onClick={() => setOpen(true)}>{t.button}</button>
    {open && <AgentPanel title={t.title} closeLabel={t.close} onClose={() => setOpen(false)}><ConnectionSteps locale={locale} onExternalDialog={() => flushSync(() => setOpen(false))} /></AgentPanel>}
  </>;
}
