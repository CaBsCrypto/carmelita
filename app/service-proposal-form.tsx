"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "./language-toggle";
import styles from "./service-proposal-form.module.css";

const copy = {
  es: {
    name: "Nombre del servicio", email: "Correo de contacto", description: "¿Qué consulta quieres ofrecer?",
    nameHint: "El nombre de tu producto o negocio.", descriptionHint: "Describe qué hace el servicio y qué debería poder consultar el usuario. Puedes incluir una URL pública o documentación (máximo 500 caracteres).",
    consent: "Acepto que el equipo de Carmelita use estos datos para revisar mi propuesta y contactarme sobre ella.",
    privacy: "No incluyas contraseñas, tokens, claves ni datos personales de terceros.",
    submit: "Enviar a revisión", sending: "Enviando propuesta…", another: "Proponer otro servicio",
    success: "Propuesta recibida. Quedó guardada para revisión por el equipo. El envío no publica ni activa tu servicio.",
    duplicate: "Ya recibimos una propuesta con este correo y servicio. La primera propuesta se conserva para revisión; este envío no la reemplaza.",
    invalid: "Revisa el nombre, el correo, la descripción y el consentimiento antes de volver a enviar.",
    unavailable: "La recepción de propuestas no está disponible en este entorno. Tus datos siguen en el formulario; intenta de nuevo más tarde.",
    timeout: "No pudimos confirmar la recepción a tiempo. Tus datos siguen aquí. Puedes reintentar; una propuesta repetida no se guarda dos veces.",
    error: "No pudimos confirmar que la propuesta se guardara. Tus datos siguen en el formulario; vuelve a intentarlo.",
  },
  en: {
    name: "Service name", email: "Contact email", description: "What query would you like to offer?",
    nameHint: "The name of your product or business.", descriptionHint: "Describe what the service does and what users should be able to query. You may include a public URL or documentation (500 characters maximum).",
    consent: "I agree that the Carmelita team may use these details to review my proposal and contact me about it.",
    privacy: "Do not include passwords, tokens, keys or other people’s personal data.",
    submit: "Submit for review", sending: "Sending proposal…", another: "Propose another service",
    success: "Proposal received. It was saved for the team to review. Submitting does not publish or activate your service.",
    duplicate: "We already received a proposal with this email and service. The first proposal is kept for review; this submission does not replace it.",
    invalid: "Check the name, email, description and consent before submitting again.",
    unavailable: "Proposal intake is unavailable in this environment. Your details remain in the form; try again later.",
    timeout: "We could not confirm receipt in time. Your details remain here. You can retry; duplicate proposals are not saved twice.",
    error: "We could not confirm that your proposal was saved. Your details remain in the form; try again.",
  },
  pt: {
    name: "Nome do serviço", email: "E-mail de contato", description: "Que consulta você quer oferecer?",
    nameHint: "O nome do seu produto ou negócio.", descriptionHint: "Descreva o que o serviço faz e o que o usuário deve poder consultar. Pode incluir uma URL pública ou documentação (máximo de 500 caracteres).",
    consent: "Aceito que a equipe da Carmelita use estes dados para revisar minha proposta e entrar em contato sobre ela.",
    privacy: "Não inclua senhas, tokens, chaves nem dados pessoais de terceiros.",
    submit: "Enviar para revisão", sending: "Enviando proposta…", another: "Propor outro serviço",
    success: "Proposta recebida. Ela foi salva para revisão pela equipe. O envio não publica nem ativa seu serviço.",
    duplicate: "Já recebemos uma proposta com este e-mail e serviço. A primeira proposta é mantida para revisão; este envio não a substitui.",
    invalid: "Confira o nome, o e-mail, a descrição e o consentimento antes de enviar novamente.",
    unavailable: "O recebimento de propostas não está disponível neste ambiente. Seus dados permanecem no formulário; tente novamente mais tarde.",
    timeout: "Não conseguimos confirmar o recebimento a tempo. Seus dados continuam aqui. Pode tentar novamente; propostas repetidas não são salvas duas vezes.",
    error: "Não conseguimos confirmar que a proposta foi salva. Seus dados permanecem no formulário; tente novamente.",
  },
};

type SubmissionState = "idle" | "sending" | "success" | "duplicate" | "invalid" | "unavailable" | "timeout" | "error";

export default function ServiceProposalForm({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [state, setState] = useState<SubmissionState>("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const receiptRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const completed = state === "success" || state === "duplicate";

  useEffect(() => () => {
    const pending = requestRef.current;
    requestRef.current = null;
    pending?.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current || completed) return;
    const form = new FormData(event.currentTarget);
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    setState("sending");
    try {
      const response = await fetch("/api/integration-recommendations", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          integrationName: String(form.get("integrationName") ?? ""), email: String(form.get("email") ?? ""),
          useCase: String(form.get("useCase") ?? ""), website: String(form.get("website") ?? ""),
          consent: form.get("consent") === "on", source: "developers", locale,
        }),
      });
      const body: { status?: string } = await response.json();
      if (requestRef.current !== controller) return;
      if (response.ok && (body.status === "received" || body.status === "already_received")) {
        setState(body.status === "received" ? "success" : "duplicate");
      } else if (response.status === 400 || response.status === 413) setState("invalid");
      else if (response.status === 503) setState("unavailable");
      else setState("error");
    } catch {
      if (requestRef.current === controller) setState(controller.signal.aborted ? "timeout" : "error");
    } finally {
      window.clearTimeout(timer);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  // Move focus after the receipt exists, without clearing the submitted draft.
  useEffect(() => {
    if (state === "success" || state === "duplicate") receiptRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} aria-busy={state === "sending"}>
      <fieldset disabled={state === "sending" || completed}>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="proposal-name">{t.name}</label>
            <input ref={nameRef} id="proposal-name" name="integrationName" required minLength={2} maxLength={100} autoComplete="organization" aria-describedby="proposal-name-hint" />
            <span id="proposal-name-hint" className={styles.hint}>{t.nameHint}</span>
          </div>
          <div className={styles.field}>
            <label htmlFor="proposal-email">{t.email}</label>
            <input id="proposal-email" name="email" type="email" required maxLength={254} autoComplete="email" />
          </div>
          <div className={`${styles.field} ${styles.description}`}>
            <label htmlFor="proposal-description">{t.description}</label>
            <textarea id="proposal-description" name="useCase" required minLength={10} maxLength={500} rows={5} aria-describedby="proposal-description-hint proposal-privacy" />
            <span id="proposal-description-hint" className={styles.hint}>{t.descriptionHint}</span>
          </div>
        </div>
        <div className={styles.trap} aria-hidden="true"><label htmlFor="proposal-website">Website<input id="proposal-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <p id="proposal-privacy" className={styles.privacy}>{t.privacy}</p>
        <label className={styles.consent}><input name="consent" type="checkbox" required /><span>{t.consent}</span></label>
        <button type="submit" className={styles.submit}>{state === "sending" ? t.sending : t.submit}</button>
      </fieldset>
      <p ref={receiptRef} className={styles.response} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1} data-state={state}>
        {state !== "idle" && state !== "sending" ? t[state] : ""}
      </p>
      {completed && <button className={styles.another} type="button" onClick={() => {
        formRef.current?.reset(); setState("idle"); window.requestAnimationFrame(() => nameRef.current?.focus());
      }}>{t.another}</button>}
    </form>
  );
}
