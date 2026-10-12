import type { Locale } from "@/app/locale-store";
const errors: Record<string, Record<Locale, string>> = {
  x402_stellar_account_not_active: { en: "Your Stellar Testnet account is not active yet. Check activation before preparing this service.", es: "Tu cuenta Stellar Testnet todavía no está activa. Comprueba la activación antes de preparar el servicio.", pt: "Sua conta Stellar Testnet ainda não está ativa. Verifique a ativação antes de preparar o serviço." },
  x402_usdc_trustline_required: { en: "This service requires the exact Testnet USDC trustline. Adding Bazaar does not create that trustline or authorize a payment.", es: "Este servicio requiere la trustline del USDC Testnet correcto. Añadir Bazaar no crea esa trustline ni autoriza un pago.", pt: "Este serviço exige a trustline do USDC Testnet correto. Adicionar Bazaar não cria essa trustline nem autoriza pagamentos." },
  x402_usdc_balance_insufficient: { en: "Your Testnet USDC balance is insufficient. No payment was submitted.", es: "Tu saldo USDC Testnet es insuficiente. No se envió ningún pago.", pt: "Seu saldo USDC Testnet é insuficiente. Nenhum pagamento foi enviado." },
  bazaar_amount_over_limit: { en: "The declared price exceeds the current limit. The limit has not been increased.", es: "El precio declarado supera el límite actual. El límite no se ha aumentado.", pt: "O preço declarado excede o limite atual. O limite não foi aumentado." },
  bazaar_service_changed: { en: "The service or its terms changed. Refresh the catalog and review a fresh preview.", es: "El servicio o sus condiciones cambiaron. Actualiza el catálogo y revisa una vista previa nueva.", pt: "O serviço ou suas condições mudaram. Atualize o catálogo e revise uma nova prévia." },
  bazaar_operation_recovery_required: { en: "Check the existing operation before preparing another payment. Its original identifier is preserved.", es: "Consulta la operación existente antes de preparar otro pago. Conservamos su identificador original.", pt: "Consulte a operação existente antes de preparar outro pagamento. Seu identificador original foi preservado." },
  bazaar_order_content_expired: { en: "The result retention period expired. Keep the original operation identifier for payment reconciliation; do not pay again to recover it.", es: "Venció el plazo de conservación del resultado. Conserva el identificador original para conciliar el pago; no vuelvas a pagar para recuperarlo.", pt: "O prazo de retenção do resultado expirou. Guarde o identificador original para conciliar o pagamento; não pague novamente para recuperá-lo." },
  bazaar_confirmation_expired: { en: "This approval expired. No new payment was submitted. Cancel the preview and prepare it again.", es: "Esta autorización venció. No se envió un pago nuevo. Cancela la vista previa y vuelve a prepararla.", pt: "Esta autorização expirou. Nenhum novo pagamento foi enviado. Cancele a prévia e prepare novamente." },
};
export function appErrorMessage(code: string | null, locale: Locale, fallback: string) { return code && errors[code] ? errors[code][locale] : fallback; }
const phases: Record<string, Record<Locale, string>> = {
  preparing: { en: "Preparation pending", es: "Preparación pendiente", pt: "Preparação pendente" },
  preparing_remote: { en: "Checking preparation", es: "Comprobando preparación", pt: "Verificando preparação" },
  preparation_pending: { en: "Preparation needs a retry", es: "La preparación requiere un reintento", pt: "A preparação precisa de nova tentativa" },
  awaiting_confirmation: { en: "Awaiting your confirmation", es: "Esperando tu confirmación", pt: "Aguardando sua confirmação" },
  submitting: { en: "Checking payment status", es: "Comprobando el pago", pt: "Verificando o pagamento" },
  uncertain: { en: "Status needs verification", es: "Estado pendiente de comprobación", pt: "Status precisa de verificação" },
  paid: { en: "Payment confirmed, result pending", es: "Pago confirmado, resultado pendiente", pt: "Pagamento confirmado, resultado pendente" },
  completed: { en: "Result available", es: "Resultado disponible", pt: "Resultado disponível" },
  cancelled: { en: "Cancelled", es: "Cancelada", pt: "Cancelada" },
};
export const operationPhaseLabel = (phase: string, locale: Locale) => phases[phase]?.[locale] ?? ({ en: "Status unavailable", es: "Estado no disponible", pt: "Status indisponível" })[locale];
