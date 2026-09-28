import assert from 'node:assert/strict';
import test from 'node:test';
import { registeredWalletsReply, requestsRegisteredWallets } from '../app/agent-chat-wallets';

test('chat wallet lookup covers Spanish request and existing English shortcut without financial execution', () => {
  assert.equal(requestsRegisteredWallets('Muéstrame mis billeteras registradas de Stellar, EVM y Solana'), true);
  assert.equal(requestsRegisteredWallets('Show my wallet'), true);
  assert.equal(requestsRegisteredWallets('Dame mis wallets'), true);
  assert.equal(requestsRegisteredWallets('Send funds from my wallet'), false);
});
test('chat reads owned records across families and shows pending registration without invented balances', () => {
  const rows = [
    { id:'s',userId:'a',address:'stellar-a',network:'stellar:testnet',status:'pending' },
    { id:'e',userId:'a',address:'evm-a',network:'avalanche:fuji',status:'active' },
    { id:'o',userId:'a',address:'solana-a',network:'solana:devnet',status:'active' },
    { id:'foreign',userId:'b',address:'secret-other-owner',network:'stellar:testnet',status:'active' },
  ];
  const reply=registeredWalletsReply('a',rows,'es');
  for(const address of ['stellar-a','evm-a','solana-a']) assert.ok(reply.content.includes(address));
  assert.match(reply.content,/pendiente de activación/);
  assert.doesNotMatch(reply.content,/secret-other-owner|0 SOL|0 XLM/);
  assert.deepEqual(reply.actions,[]);
  assert.match(registeredWalletsReply('c',rows,'es').content,/No hay billeteras/);
});

test('balance queries isolate failures and never read another owner', async () => {
  const { walletBalancesReply, requestsWalletBalances } = await import('../app/agent-chat-wallets');
  assert.equal(requestsWalletBalances('Muéstrame mis saldos por red'), true);
  assert.equal(requestsWalletBalances('Transfer my balance'), false);
  const reads: string[] = [];
  const reply = await walletBalancesReply('a', [
    { id:'s',userId:'a',address:'stellar-a',network:'stellar:testnet',status:'pending' },
    { id:'o',userId:'a',address:'solana-a',network:'solana:devnet',status:'active' },
    { id:'x',userId:'b',address:'foreign',network:'solana:devnet',status:'active' },
  ], 'es', async (network,address) => { reads.push(address); if(network==='stellar:testnet') throw new Error('rpc unavailable'); return '0 SOL'; });
  assert.deepEqual(reads,['stellar-a','solana-a']);
  assert.match(reply.content,/Stellar Testnet: Saldo no disponible/);
  assert.match(reply.content,/Solana Devnet: 0 SOL/);
  assert.deepEqual(reply.actions,[]);
});

test('Solana malformed RPC balances cannot appear as zero', async () => {
  const { getSolanaDevnetBalance } = await import('../app/wallets/solana-client');
  const address='2afucWHvs7KABv71aXMx2CLzjcGJaLxVH6s3EnuJvJcW';
  for(const result of [{}, {value:null}, {value:-1}, {value:'0'}]) {
    await assert.rejects(getSolanaDevnetBalance(address,async()=>Response.json({result})),/solana_rpc_invalid_balance/);
  }
  assert.equal((await getSolanaDevnetBalance(address,async()=>Response.json({result:{value:0}}))).sol,0);
});


test('unactivated Stellar is localized without fabricated balance or repeated network', async () => {
  const { walletBalancesReply } = await import('../app/agent-chat-wallets');
  for (const [language, expected] of [['es','Registrada, pendiente de activación'],['en','Registered, activation pending'],['pt','Registrada, ativação pendente']] as const) {
    const reply = await walletBalancesReply('a', [{id:'s',userId:'a',address:'s',network:'stellar:testnet',status:'pending'}], language, async () => null);
    assert.ok(reply.content.includes(`Stellar Testnet: ${expected}`));
    assert.doesNotMatch(reply.content,/0 XLM|Stellar Testnet: Stellar/);
    assert.deepEqual(reply.actions, []);
  }
});
