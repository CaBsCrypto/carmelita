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
