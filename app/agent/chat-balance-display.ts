type Language = "en" | "es" | "pt";

export function chatBalanceDisplay(balance: string | null | undefined, accountExists: boolean | null | undefined, language: Language): string {
  if (balance != null) return balance;
  if (accountExists === false) return {
    en: "Activation pending", es: "Pendiente de activación", pt: "Ativação pendente",
  }[language];
  return { en: "Balance unavailable", es: "Saldo no disponible", pt: "Saldo indisponível" }[language];
}
