import { getWalletNetwork } from './wallets/networks';
import { diagnoseEvmWallet } from './wallets/evm-rpc';
import { getSolanaDevnetBalance } from './wallets/solana-client';
import { getStellarTestnetAccount } from './privy-stellar';

export async function readChatNativeBalance(network: string, address: string): Promise<string | null> {
  const config = getWalletNetwork(network);
  if (config.family === 'evm') {
    const result = await diagnoseEvmWallet(config, address);
    return `${result.balance} ${result.nativeAsset}`;
  }
  if (config.family === 'solana') {
    const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    return (await getSolanaDevnetBalance(address, timedFetch)).formatted;
  }
  const account = await getStellarTestnetAccount(address, AbortSignal.timeout(10000));
  if (!account.exists) return null;
  const balance = account.balances.find(row => row.asset === 'XLM');
  if (!balance) throw new Error('stellar_balance_unavailable');
  return `${balance.balance} XLM`;
}
