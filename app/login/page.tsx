import LoginPanel from "./login-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in | Carmelita",
  description: "Sign in or create your Carmelita account. Connect with ChatGPT and query your own Stellar Testnet information with the permissions you authorize.",
};

export default function LoginPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ||
      process.env.PRIVY_APP_ID?.trim(),
  );

  return <LoginPanel configured={configured} />;
}
