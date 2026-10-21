"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "./language-toggle";
import AgentPanel from "./agent/agent-panel";
import styles from "./home-experience.module.css";

const copy = {
  es: { title: "Conectar tu asistente", close: "Cerrar", recommended: "Recomendado", pilot: "Piloto · validación pendiente" },
  en: { title: "Connect your assistant", close: "Close", recommended: "Recommended", pilot: "Pilot · validation pending" },
  pt: { title: "Conectar seu assistente", close: "Fechar", recommended: "Recomendado", pilot: "Piloto · validação pendente" },
};
export default function AssistantSelector({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const t = copy[locale];
  return <>
    <button className={styles.assistantTrigger} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>{t.title}</button>
    {open && <AgentPanel title={t.title} closeLabel={t.close} onClose={() => setOpen(false)}>
      <div className={styles.assistantOptions}>
        <Link href="/connect-chatgpt" onClick={() => setOpen(false)}><strong>ChatGPT</strong><span>{t.recommended}</span></Link>
        <Link href="/connect-claude" onClick={() => setOpen(false)}><strong>Claude</strong><span>{t.pilot}</span></Link>
      </div>
    </AgentPanel>}
  </>;
}
