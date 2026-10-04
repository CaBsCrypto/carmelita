import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentReply,
  detectAgentLanguage,
  findRequestedConnection,
  parseDefindexIntent,
  parseTestnetSetupIntent,
} from "../app/agent-chat-logic";

test("price questions detect Spanish and fallback replies retain an explicitly selected UI locale", () => {
  assert.equal(detectAgentLanguage("¿Cuál es el precio de PAY?"), "es");
  assert.equal(detectAgentLanguage("What is the price of PAY?"), "en");
  assert.equal(detectAgentLanguage("Qual é o preço de PAY?"), "pt");
  const es = buildAgentReply("unrecognized request", {}, "es");
  const pt = buildAgentReply("unrecognized request", {}, "pt");
  assert.match(es.content, /Entiendo|objetivo|necesito/);
  assert.match(pt.content, /Entendo|objetivo|preciso/);
  assert.doesNotMatch(es.content + pt.content, /I understand the goal/);
  assert.equal(es.defindexIntent, undefined);
  assert.equal(pt.defindexIntent, undefined);
});

test("recognizes active pilot aliases in natural language", () => {
  assert.equal(findRequestedConnection("quiero conectarme a ArkusX")?.name, "ArcusX");
  assert.equal(findRequestedConnection("connect me to DeFindex")?.name, "DeFindex");
  assert.equal(findRequestedConnection("busquemos un hotel con Travala")?.name, "Travala Travel MCP");
  assert.equal(findRequestedConnection("conecta mi espacio de Notion")?.name, "Notion MCP");
  assert.equal(findRequestedConnection("muéstrame mi tablero de Trello")?.name, "Trello");
  assert.equal(findRequestedConnection("revisa mi agenda de Google Calendar")?.name, "Google Calendar");
  assert.equal(findRequestedConnection("busca un archivo en Drive")?.name, "Google Drive");
  assert.equal(findRequestedConnection("prepara un correo en Gmail")?.name, "Gmail");
});

test("offers a real OAuth action for Notion", () => {
  const reply = buildAgentReply("connect me to Notion");
  assert.ok(
    reply.actions.some(
      (action) => action.label === "Connect Notion" && action.connect === "notion",
    ),
  );
});

test("reports Notion as connected after OAuth state is present", () => {
  const reply = buildAgentReply("connect me to Notion", {
    connectedProviders: ["notion"],
  });
  assert.equal(reply.connection?.stage, "Connected");
  assert.ok(!reply.actions.some((action) => action.connect === "notion"));
  assert.match(reply.content, /stored encrypted/i);
});

test("recognizes portfolio and market data targets", () => {
  assert.equal(findRequestedConnection("revisa precios en CoinGecko")?.name, "CoinGecko Market Data");
  assert.equal(findRequestedConnection("conecta CoinMarketCap")?.name, "CoinMarketCap Agent Hub");
  assert.equal(findRequestedConnection("quiero alertas de TradingView")?.name, "TradingView");
});

test("reports real connection status without claiming unavailable execution", () => {
  const reply = buildAgentReply("connect me to DeFindex");
  assert.match(reply.content, /Ready to test/);
  assert.match(reply.content, /will not claim/i);
  assert.equal(reply.connection?.name, "DeFindex");
  assert.ok(reply.actions.length >= 2);
});

test("guides an authenticated user through the Testnet proof", () => {
  const reply = buildAgentReply("start testnet", {
    wallet: {
      address: "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ",
      balance: "10000.0000000",
      network: "Stellar Testnet",
    },
  });

  assert.match(reply.content, /already in \*\*Stellar Testnet\*\*/);
  assert.match(reply.content, /USDC trustline/);
  assert.ok(reply.actions.some((action) => action.label === "Start Testnet proof"));
});
test("uses live wallet context while preserving authorization boundary", () => {
  const reply = buildAgentReply("show my wallet balance", {
    wallet: {
      address: "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ",
      balance: "10000.0000000",
      network: "Stellar Testnet",
    },
  });

  assert.match(reply.content, /10000\.0000000/);
  assert.match(reply.content, /cannot sign or submit/i);
});

test("offers concrete starting points for an ambiguous request", () => {
  const reply = buildAgentReply("I want my agent to do something useful");
  assert.ok(reply.actions.some((action) => action.message?.includes("DeFindex")));
  assert.ok(reply.actions.some((action) => action.message?.includes("Travala")));
});
test("supports Portuguese connection commands and replies", () => {
  assert.equal(detectAgentLanguage("Quero conectar minha carteira"), "pt");
  assert.equal(findRequestedConnection("Conecte-me ao Notion")?.name, "Notion MCP");
  assert.equal(findRequestedConnection("Pesquise uma viagem na Travala")?.name, "Travala Travel MCP");

  const reply = buildAgentReply("Mostre o saldo da minha carteira", {
    wallet: {
      address: "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ",
      balance: "10000.0000000",
      network: "Stellar Testnet",
    },
  });

  assert.match(reply.content, /Sua wallet ativa/);
  assert.match(reply.content, /autorização explícita/);
  assert.ok(reply.actions.some((action) => action.label === "Explorar DeFindex"));
});

test("keeps financial fields canonical in Portuguese Testnet guidance", () => {
  const reply = buildAgentReply("Inicie meu teste na Testnet", {
    wallet: {
      address: "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ",
      balance: "10.0000000",
      network: "Stellar Testnet",
    },
  });

  assert.match(reply.content, /1 XLM/);
  assert.match(reply.content, /USDC/);
  assert.match(reply.content, /Mainnet está desativada/);
});
test("parses conversational DeFindex deposits without signing them", () => {
  assert.deepEqual(
    parseDefindexIntent("Quiero depositar 1 XLM en DeFindex Testnet"),
    { operation: "deposit", asset: "XLM", amount: "1" },
  );
  assert.deepEqual(
    parseDefindexIntent("Quero depositar 2,5 USDC na DeFindex"),
    { operation: "deposit", asset: "USDC", amount: "2.5" },
  );
  assert.deepEqual(
    parseDefindexIntent("Prepare the USDC trustline for DeFindex"),
    { operation: "usdc_trustline", asset: "USDC" },
  );
  assert.equal(parseDefindexIntent("Explain what DeFindex is"), null);
  assert.equal(parseDefindexIntent("Deposit 1 XLM"), null);
});

test("returns a structured DeFindex review intent from the chat", () => {
  const reply = buildAgentReply(
    "Deposita 1 XLM en DeFindex Testnet",
    {
      wallet: {
        address: "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ",
        balance: "10000.0000000",
        network: "Stellar Testnet",
      },
    },
  );

  assert.deepEqual(reply.defindexIntent, {
    operation: "deposit",
    asset: "XLM",
    amount: "1",
  });
  assert.match(reply.content, /Todavía no se firmará ni enviará nada/);
  assert.equal(reply.actions.length, 0);
});
test("parses the chat-native Testnet onboarding sequence", () => {
  assert.equal(parseTestnetSetupIntent("Dame mi wallet"), "wallet_status");
  assert.equal(
    parseTestnetSetupIntent("Recarga mi wallet con saldo de Testnet"),
    "fund_xlm",
  );
  assert.equal(parseTestnetSetupIntent("Actívalo con XLM"), "activate_xlm");
  assert.equal(parseTestnetSetupIntent("Actívalo con USDC"), "activate_usdc");
  assert.equal(parseTestnetSetupIntent("Recarga mi wallet con USDC"), "fund_usdc");
  assert.equal(
    parseTestnetSetupIntent("¿Cuál es el siguiente paso de configuración Testnet?"),
    "readiness",
  );
  assert.equal(
    parseTestnetSetupIntent("Recarregue minha wallet com XLM da Testnet"),
    "fund_xlm",
  );
});

test("prepares the official x402 demo through the Privy review flow", () => {
  const reply = buildAgentReply("Prueba el demo x402 en testnet", {
    wallet: { address: "GBCTAHK3JJ56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ", balance: "10", network: "Stellar Testnet" },
  });
  assert.equal(reply.x402Intent?.operation, "demo_payment");
  assert.match(reply.content, /0\.01 USDC/);
  assert.match(reply.content, /Privy/);
});

test("guides UNBLCK through its official Agent API instead of browser automation", () => {
  const reply = buildAgentReply("Con?ctame con UNBLCK");
  assert.equal(reply.connection?.stage, "Ready to test");
  assert.match(reply.content, /Agent API/i);
  assert.match(reply.content, /Connect code/i);
  assert.ok(reply.actions.some(
    (action) => action.href === "https://www.unblck.cl/member/hub/connect",
  ));
  assert.ok(!reply.actions.some((action) => action.popup));
});
