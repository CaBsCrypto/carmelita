"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "../language-toggle";
import { MCP_URL, OPENAI_GUIDE } from "../connect-chatgpt/connection-config";
import AgentPanel from "./agent-panel";
import styles from "./chatgpt-connection.module.css";

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

export default function ChatGPTConnection({ locale, authenticated = false, signInAvailable = true }: { locale: Locale; authenticated?: boolean; signInAvailable?: boolean }) {
  const t = copy[locale];
  const fieldId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopyState("copied");
    } catch {
      field.current?.focus();
      field.current?.select();
      setCopyState("failed");
    }
  }

  return <>
    <button
      type="button"
      className={styles.trigger}
      aria-haspopup="dialog"
      onClick={() => { setCopyState(null); setOpen(true); }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M7 4h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-5 3v-3a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="M8 9h8M8 13h5" /></svg>
      {t.button}
    </button>
    {open && <AgentPanel title={t.title} closeLabel={t.close} onClose={() => setOpen(false)}>
      <div className={styles.guide}>
        <p className={styles.intro}>{t.intro}</p>
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNumber} aria-hidden="true">1</span>
            <h3>{t.urlTitle}</h3><p>{t.urlHelp}</p>
            <div className={styles.urlBox}>
              <label htmlFor={fieldId}>{t.urlLabel}</label>
              <textarea id={fieldId} ref={field} readOnly rows={2} value={MCP_URL} spellCheck={false} />
              <button className={styles.copyButton} type="button" onClick={() => void copyUrl()}>{copyState === "copied" ? t.copied : t.copy}</button>
              <span className={styles.copyStatus} role="status">{copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : ""}</span>
            </div>
          </li>
          <li><span className={styles.stepNumber} aria-hidden="true">2</span><h3>{t.accountTitle}</h3><p>{authenticated ? t.signedIn : signInAvailable ? t.account : t.signInUnavailable}</p></li>
          <li><span className={styles.stepNumber} aria-hidden="true">3</span><h3>{t.pluginTitle}</h3><p>{t.plugin}</p><p className={styles.note}>{t.availability}</p><a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">{t.openChatGPT}</a></li>
          <li><span className={styles.stepNumber} aria-hidden="true">4</span><h3>{t.consentTitle}</h3><p>{t.consent}</p><p>{t.prompt}</p><blockquote className={styles.example}>{t.example}</blockquote></li>
        </ol>
        <p className={styles.permissions}>{t.permissions}</p>
        <footer className={styles.footer}><Link href="/connect-chatgpt">{t.fullGuide}</Link><a href={OPENAI_GUIDE} target="_blank" rel="noreferrer">{t.officialGuide}</a></footer>
      </div>
    </AgentPanel>}
  </>;
}
