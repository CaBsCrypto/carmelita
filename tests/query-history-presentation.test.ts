import assert from "node:assert/strict";
import test from "node:test";
import { presentCommonRead } from "../app/queries/presentation";
import { parseChatReadRequest } from "../app/queries/chat";

test("web history presentation bounds nested history without mutating the shared result", () => {
  const messages = Array.from({ length: 80 }, (_, i) => ({
    id: `m${i}`, role: i % 2 ? "user" : "assistant", createdAt: `2026-10-01T19:00:${String(i % 60).padStart(2, "0")}.000Z`,
    content: i === 79 ? "```json\n" + "nested prior history ".repeat(10_000) + "deep-private-suffix" : `message-${i}`,
  }));
  const value = { conversationId: "private-conversation-id", messages };
  const before = JSON.stringify(value);
  for (const [locale, title] of [["es", /Historial de conversación/], ["en", /Conversation history/], ["pt", /Histórico da conversa/]] as const) {
    const output = presentCommonRead("personal.conversation", value, locale)!;
    assert.match(output, title);
    assert.match(output, /5 \/ 80/);
    assert.match(output, /message-75/);
    assert.doesNotMatch(output, /message-74|deep-private-suffix|private-conversation-id|```/);
    assert.ok(output.length < 1_800);
  }
  assert.equal(JSON.stringify(value), before);
});

test("empty history and public catalog reads use the selected locale and never reserve", () => {
  assert.match(presentCommonRead("personal.conversation", { messages: [] }, "es")!, /No hay mensajes/);
  for (const text of ["Muestra ofertas", "Show offers", "Mostre ofertas"]) {
    assert.deepEqual(parseChatReadRequest(text), { id: "commerce.catalog.search", input: {} });
  }
  assert.deepEqual(parseChatReadRequest("Busca ofertas cowork"), { id: "commerce.catalog.search", input: { query: "cowork" } });
  assert.deepEqual(parseChatReadRequest("¿Busca ofertas cowork?"), { id: "commerce.catalog.search", input: { query: "cowork" } });
  for (const text of ["Reserva una oferta", "Book an offer", "Prepare commerce intent"]) assert.equal(parseChatReadRequest(text), null);
});
