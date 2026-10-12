"use client";

import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { Locale } from "../language-toggle";
import { OPENAI_GUIDE } from "../connect-chatgpt/connection-config";
import AgentPanel from "./agent-panel";
import styles from "./chatgpt-connection.module.css";
import pages from "../public-pages.module.css";
import ConnectionAccount from "../connect-chatgpt/connection-account";
import { useConnectionEnvironment } from "../connect-chatgpt/connection-environment";

const copy = {
  es: {
    button: "Conectar con ChatGPT", title: "Lleva Carmelita a ChatGPT", close: "Cerrar",
    pageTitle: "Conecta Carmelita con ChatGPT.",
    intro: "Añade tu agente a ChatGPT, autoriza tu cuenta y empieza a consultar tu información. La conexión se instala manualmente desde la web de ChatGPT.",
    action: "Abrir complementos en ChatGPT", tutorialLink: "Ver los pasos", tutorial: "De la conexión a tu primera consulta.",
    tutorialText: "Mantén esta guía abierta mientras añades Carmelita. Puedes crear tu identidad durante la autorización.",
    launchTitle: "La URL de Carmelita", urlHelp: "Copia esta dirección y pégala en la URL del servidor al añadir el complemento.",
    urlLabel: "URL del servidor MCP", copy: "Copiar URL", copied: "URL copiada", copyFailed: "No pudimos copiarla. La URL está seleccionada; cópiala manualmente.",
    pluginTitle: "Añade el complemento", plugin: "En Complementos, pulsa + y Añadir servidor MCP personalizado. Usa el nombre Carmelita, pega la URL y elige OAuth. Revisa el aviso, crea el complemento e instálalo antes de usarlo.",
    availability: "Tu cuenta y las políticas del espacio de trabajo deben permitir complementos personalizados.",
    consentTitle: "Autoriza tu cuenta Carmelita", consent: "Crea tu cuenta o inicia sesión durante la autorización. Si ya usas Carmelita, elige la misma identidad para conservar tus direcciones. Revisa el acceso solicitado y decide si lo autorizas. Pulsa Continuar para volver a ChatGPT.",
    queryTitle: "Haz tu primera consulta", prompt: "Habilita Carmelita en una conversación mediante @Carmelita y pregunta:", example: "¿Está activa mi cuenta Stellar Testnet?",
    nextQuery: "También puedes pedir: «Muéstrame mis billeteras registradas». El estado de activación debe confirmarse en la red.",
    test: "La prueba termina cuando ChatGPT responde con tus datos. Copiar la URL o registrar OAuth no confirma por sí solo esta conexión.",
    account: "¿Aún no tienes cuenta Carmelita?", accountHelp: "Puedes crearla durante la autorización; no necesitas ingresar antes en esta web. Si prefieres preparar tu cuenta ahora, usa el mismo correo e identidad cuando vuelvas a ChatGPT.",
    missing: "No encuentro cómo añadir Carmelita", help: "Empieza en ChatGPT en la web. Si no aparece la opción de añadir un servidor MCP, consulta las políticas de tu espacio de trabajo y la ayuda oficial. Crear una cuenta no garantiza este permiso. Puedes usar Carmelita directamente mientras lo revisas.",
    accountLink: "Crear cuenta o ingresar a ChatGPT", permissionsTitle: "Tu identidad y tus permisos.",
    permissions: "agent:read permite consultas. El contexto de conversaciones requiere consentimiento adicional. Esta conexión no autoriza compras ni mover fondos.",
    limit: "El ejemplo usa Stellar Testnet y fondos de prueba. La compra y ejecución de servicios siguen pendientes de validación.",
    qa: "Entorno QA", production: "Conexión de producción", unavailable: "La URL de este entorno no está configurada. No uses una dirección de otro entorno.",
    fullGuide: "Ver guía completa", userGuide: "Qué puedes consultar", officialGuide: "Ayuda oficial de OpenAI", direct: "Abrir Carmelita",
  },
  en: {
    button: "Connect with ChatGPT", title: "Bring Carmelita to ChatGPT", close: "Close",
    pageTitle: "Connect Carmelita with ChatGPT.",
    intro: "Add your agent to ChatGPT, authorize your account and start asking about your information. You install the connection manually from ChatGPT on the web.",
    action: "Open ChatGPT plugins", tutorialLink: "View the steps", tutorial: "From connection to your first question.",
    tutorialText: "Keep this guide open while adding Carmelita. You can create your identity during authorization.",
    launchTitle: "Carmelita’s URL", urlHelp: "Copy this address and paste it into the server URL when adding the plugin.",
    urlLabel: "MCP server URL", copy: "Copy URL", copied: "URL copied", copyFailed: "We could not copy it. The URL is selected; copy it manually.",
    pluginTitle: "Add the plugin", plugin: "In Plugins, select + and Add custom MCP server. Name it Carmelita, paste the URL and choose OAuth. Review the notice, create the plugin and install it before using it.",
    availability: "Your account and workspace policies must allow custom plugins.",
    consentTitle: "Authorize your Carmelita account", consent: "Create your account or sign in during authorization. If you already use Carmelita, choose the same identity to keep your addresses. Review the requested access and decide whether to authorize it. Select Continue to return to ChatGPT.",
    queryTitle: "Ask your first question", prompt: "Enable Carmelita in a conversation using @Carmelita and ask:", example: "Is my Stellar Testnet account active?",
    nextQuery: "You can also ask: “Show my registered wallets.” Activation status must be confirmed on the network.",
    test: "The test finishes when ChatGPT returns your own data. Copying the URL or recording OAuth does not by itself verify this connection.",
    account: "Need a Carmelita account?", accountHelp: "You can create one during authorization; you do not need to sign in on this website first. If you prefer to prepare your account now, use the same email and identity when you return to ChatGPT.",
    missing: "I cannot find how to add Carmelita", help: "Start in ChatGPT on the web. If the option to add an MCP server is missing, check your workspace policies and official help. Creating an account does not guarantee this permission. You can use Carmelita directly while checking.",
    accountLink: "Create an account or sign in to ChatGPT", permissionsTitle: "Your identity and permissions.",
    permissions: "agent:read allows queries. Conversation context needs additional consent. This connection does not authorize purchases or moving funds.",
    limit: "The example uses Stellar Testnet and test funds. Purchases and service execution are still awaiting validation.",
    qa: "QA environment", production: "Production connection", unavailable: "This environment’s URL is not configured. Do not use another environment’s address.",
    fullGuide: "Read the full guide", userGuide: "What you can ask about", officialGuide: "Official OpenAI help", direct: "Open Carmelita",
  },
  pt: {
    button: "Conectar ao ChatGPT", title: "Leve Carmelita ao ChatGPT", close: "Fechar",
    pageTitle: "Conecte Carmelita ao ChatGPT.",
    intro: "Adicione seu agente ao ChatGPT, autorize sua conta e comece a consultar suas informações. A conexão é instalada manualmente pelo ChatGPT na web.",
    action: "Abrir plugins no ChatGPT", tutorialLink: "Ver as etapas", tutorial: "Da conexão à sua primeira consulta.",
    tutorialText: "Mantenha este guia aberto ao adicionar Carmelita. Você pode criar sua identidade durante a autorização.",
    launchTitle: "A URL da Carmelita", urlHelp: "Copie este endereço e cole na URL do servidor ao adicionar o plugin.",
    urlLabel: "URL do servidor MCP", copy: "Copiar URL", copied: "URL copiada", copyFailed: "Não foi possível copiar. A URL está selecionada; copie manualmente.",
    pluginTitle: "Adicione o plugin", plugin: "Em Plugins, selecione + e Add custom MCP server. Use o nome Carmelita, cole a URL e escolha OAuth. Confira o aviso, crie o plugin e instale antes de usar.",
    availability: "Sua conta e as políticas do espaço de trabalho devem permitir plugins personalizados.",
    consentTitle: "Autorize sua conta Carmelita", consent: "Crie sua conta ou entre durante a autorização. Se já usa Carmelita, escolha a mesma identidade para manter seus endereços. Confira o acesso solicitado e decida se deseja autorizar. Selecione Continuar para voltar ao ChatGPT.",
    queryTitle: "Faça sua primeira consulta", prompt: "Habilite Carmelita em uma conversa usando @Carmelita e pergunte:", example: "Minha conta Stellar Testnet está ativa?",
    nextQuery: "Você também pode pedir: “Mostre minhas carteiras registradas.” A ativação deve ser confirmada na rede.",
    test: "O teste termina quando o ChatGPT retorna seus próprios dados. Copiar a URL ou registrar OAuth não verifica essa conexão por si só.",
    account: "Ainda não tem conta Carmelita?", accountHelp: "Você pode criá-la durante a autorização; não precisa entrar neste site antes. Se preferir preparar sua conta agora, use o mesmo email e identidade ao voltar ao ChatGPT.",
    missing: "Não encontro como adicionar Carmelita", help: "Comece pelo ChatGPT na web. Se não aparecer a opção de adicionar um servidor MCP, confira as políticas do espaço e a ajuda oficial. Criar uma conta não garante essa permissão. Você pode usar Carmelita diretamente enquanto verifica.",
    accountLink: "Criar conta ou entrar no ChatGPT", permissionsTitle: "Sua identidade e permissões.",
    permissions: "agent:read permite consultas. O contexto de conversas exige consentimento adicional. Esta conexão não autoriza compras nem movimentação de fundos.",
    limit: "O exemplo usa Stellar Testnet e fundos de teste. Compras e execução de serviços ainda aguardam validação.",
    qa: "Ambiente QA", production: "Conexão de produção", unavailable: "A URL deste ambiente não está configurada. Não use o endereço de outro ambiente.",
    fullGuide: "Ver o guia completo", userGuide: "O que você pode consultar", officialGuide: "Ajuda oficial da OpenAI", direct: "Abrir Carmelita",
  },
};

export function ConnectionSteps({ locale, onExternalDialog, fullPage = false }: { locale: Locale; onExternalDialog?: () => void; fullPage?: boolean }) {
  const Heading = fullPage ? "h3" : "h4";
  const UrlHeading = fullPage ? "h2" : "h3";
  const t = copy[locale];
  const { mcpUrl, environment } = useConnectionEnvironment();
  const fieldId = useId();
  const statusId = useId();
  const tutorialId = useId();
  const tutorialAnchor = fullPage ? "connection-tutorial" : tutorialId;
  const field = useRef<HTMLTextAreaElement>(null);
  const tutorialSection = useRef<HTMLElement>(null);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  async function copyUrl() {
    if (!mcpUrl) return;
    try { await navigator.clipboard.writeText(mcpUrl); setCopyState("copied"); }
    catch { field.current?.focus(); field.current?.select(); setCopyState("failed"); }
  }
  const urlCard = <div className={styles.urlCard}>
    <p className={styles.environment} id={statusId}>{environment === "unavailable" ? t.unavailable : t[environment]}</p>
    <UrlHeading className={styles.urlTitle}>{t.launchTitle}</UrlHeading>
    <p>{t.urlHelp}</p>
    <div className={styles.urlBox}>
      <label htmlFor={fieldId}>{t.urlLabel}</label>
      <textarea id={fieldId} ref={field} readOnly rows={3} value={mcpUrl ?? ""} aria-describedby={statusId} spellCheck={false} />
      <button className={styles.copyButton} disabled={!mcpUrl} type="button" onClick={() => void copyUrl()}>{copyState === "copied" ? t.copied : t.copy}</button>
      <span className={styles.copyStatus} role="status">{copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : ""}</span>
    </div>
  </div>;
  return <div className={`${styles.guide} ${fullPage ? styles.fullPage : ""}`}>
    {fullPage ? <header className={pages.hero}>
      <div className={pages.intro}>
        <h1 className={pages.heroTitle}>{t.pageTitle}</h1>
        <p className={pages.lede}>{t.intro}</p>
        <p className={styles.note}>{t.availability}</p>
        <div className={pages.actions}><a className={pages.primary} href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">{t.action}</a><Link className={pages.textLink} href="/connect-chatgpt#connection-tutorial" prefetch={false} onClick={() => tutorialSection.current?.focus()}>{t.tutorialLink}</Link></div>
      </div>
      <div className={pages.heroAside}>{urlCard}</div>
    </header> : <><p className={styles.intro}>{t.intro}</p><div className={styles.quickStart}><a className={styles.primaryAction} href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">{t.action}</a>{urlCard}</div></>}
    <section className={fullPage ? pages.section : styles.tutorial} id={tutorialAnchor} ref={tutorialSection} tabIndex={-1}>
      <div className={fullPage ? pages.sectionHead : undefined}>
        {fullPage ? <h2>{t.tutorial}</h2> : <h3 className={styles.tutorialTitle}>{t.tutorial}</h3>}
        <p className={styles.note}>{t.tutorialText}</p>
      </div>
      <ol className={styles.steps} role="list">
        <li><span className={styles.stepNumber} aria-hidden="true">1</span><div><Heading>{t.pluginTitle}</Heading><p>{t.plugin}</p><a className={styles.secondaryAction} href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">{t.action}</a></div></li>
        <li><span className={styles.stepNumber} aria-hidden="true">2</span><div><Heading>{t.consentTitle}</Heading><p>{t.consent}</p></div></li>
        <li><span className={styles.stepNumber} aria-hidden="true">3</span><div><Heading>{t.queryTitle}</Heading><p>{t.prompt}</p><blockquote className={styles.example}>{t.example}</blockquote><p className={styles.note}>{t.nextQuery}</p><p className={styles.note}>{t.test}</p></div></li>
      </ol>
    </section>
    <section className={fullPage ? pages.section : styles.accountSection}>
      {fullPage && <div className={pages.sectionHead}><h2>{t.permissionsTitle}</h2><p>{t.permissions}</p></div>}
      <details className={styles.accountPreparation}><summary>{t.account}</summary><p>{t.accountHelp}</p><ConnectionAccount locale={locale} onExternalDialog={onExternalDialog} /></details>
      <details className={styles.helpPanel}><summary>{t.missing}</summary><p>{t.help}</p><div className={styles.inlineLinks}><a href={OPENAI_GUIDE} target="_blank" rel="noreferrer">{t.officialGuide}</a><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">{t.accountLink}</a><Link href="/agent">{t.direct}</Link></div></details>
      {!fullPage && <p className={styles.permissions}>{t.permissions}</p>}
      <p className={styles.note}>{t.limit}</p>
      <div className={styles.footer}><Link href={fullPage ? "/guide" : "/connect-chatgpt"}>{fullPage ? t.userGuide : t.fullGuide}</Link><a href={OPENAI_GUIDE} target="_blank" rel="noreferrer">{t.officialGuide}</a></div>
    </section>
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
