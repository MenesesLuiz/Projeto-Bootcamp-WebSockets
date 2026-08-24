# Exercício Prático Opcional — Estendendo o Chat em Tempo Real

## Contexto

Este exercício é opcional, pensado para o bloco de "dúvidas + atividade prática" (30 min) do
[workshop de streaming & WebSockets](../README.md) — para quem já entendeu o funcionamento
básico e quer colocar a mão na massa em cima do código de referência (`api/` e `web/`), em vez
de só assistir a demo.

Não há entrega formal nem correção: é prática livre, pra reforçar o conceito construindo algo
em cima do que já existe.

---

## Objetivo

Praticar extensão de um servidor WebSocket já funcionando: adicionar estado (usuários
conectados, salas), lidar com eventos efêmeros (digitando), tratar reconexão no cliente e
comparar streaming com resposta única - tudo em cima do projeto `realtime-chat` já pronto.

---

## Como funciona

- Escolha **um ou mais** desafios abaixo - não precisa fazer todos, nem seguir a ordem;
- cada desafio é independente dos outros;
- trabalhe direto em cima do código de `api/` e `web/`;
- se travar, o [README.md](../README.md) tem o protocolo completo do WebSocket documentado.

## Pré-requisitos

- Projeto rodando localmente (API + frontend - ver [README.md](../README.md));
- ter lido `api/src/ws/socket-server.ts` e `api/src/ws/agent.ts`, pra entender o fluxo atual:
  `join` → `chat` (broadcast) → se mencionar `@agente` → resposta em streaming.

---

## Desafio 1 — Lista de usuários online

Hoje ninguém sabe quem mais está no chat além de ver as mensagens de "entrou"/"saiu" passarem.

**Requisitos:**

- Um novo evento servidor → cliente (ex.: `{ "type": "presence", "usernames": [...] }`) com
  quem está conectado agora;
- emitir esse evento sempre que alguém entra ou sai;
- no frontend, mostrar a lista (uma barra lateral simples, ou só um contador "3 online" já
  ajuda).

**Dicas técnicas:**

- `ConnectionRegistry` já guarda quem está conectado - adicione um método que devolve a lista
  de usernames;
- decida (e documente) o que fazer com username duplicado (duas pessoas como "alice").

**Critério de conclusão:** abrir 3 abas com nomes diferentes e ver a lista de online atualizar
em tempo real em todas elas, tanto ao entrar quanto ao sair.

---

## Desafio 2 — Indicador "digitando..."

**Requisitos:**

- Um novo evento cliente → servidor (ex.: `{ "type": "typing" }`) disparado enquanto o usuário
  digita;
- o servidor repassa isso (broadcast, exceto para quem disparou) como um evento efêmero -
  **não precisa guardar estado nenhum no servidor**, só repassar;
- o cliente mostra "fulano está digitando..." por alguns segundos e some sozinho, mesmo que
  nenhum "parou de digitar" seja enviado.

**Dicas técnicas:**

- faça *debounce* no cliente (não mande um evento a cada tecla, só quando parar de digitar por
  um instante ou a cada N ms);
- o "some sozinho" do lado do cliente é só um `setTimeout` que reresta a cada novo evento
  recebido daquele usuário.

**Critério de conclusão:** digitar em uma aba mostra o indicador nas outras; parar de digitar
por ~2s faz o indicador sumir sozinho, sem precisar de um evento explícito de "parei".

---

## Desafio 3 — Salas separadas

**Requisitos:**

- `join` passa a incluir uma sala (ex.: `{ "type": "join", "username": "...", "room": "..." }`);
- todo broadcast (mensagens, `system`, presença, agente) passa a valer só pra quem está na
  mesma sala;
- no frontend, um campo pra escolher/criar a sala na tela de entrada.

**Dicas técnicas:**

- em vez de um broadcast global, o `ConnectionRegistry` pode indexar por sala
  (ex.: `Map<room, Set<WebSocket>>`);
- pense em qual seria a sala padrão pra quem não informar nenhuma.

**Critério de conclusão:** abrir duas salas diferentes ao mesmo tempo (ex.: em 4 abas, 2 em
cada sala) e confirmar que mensagens de uma sala não aparecem na outra.

---

## Desafio 4 — Streaming vs. resposta única

O objetivo aqui é *sentir* a diferença que motiva todo o workshop, não só ler sobre ela.

**Requisitos:**

- Um segundo "modo" de resposta do agente: a mesma resposta, mas mandada de uma vez só (um
  único evento, sem `agent_start`/`agent_chunk`/`agent_end`), em vez de streamada;
- uma forma de escolher o modo (ex.: `@agente` continua streamando, `@agente/sync` responde
  tudo de uma vez - ou uma env var, fica a seu critério).

**Critério de conclusão:** conseguir mostrar pra alguém (ou pra você mesmo, comparando as duas
gravações) a diferença perceptível entre os dois modos, e explicar em uma frase por que uma API
de LLM de verdade prefere streaming.

---

## Desafio 5 — Reconexão automática

Hoje, se a conexão cai, o chat simplesmente para (ver `useChatSocket.ts`).

**Requisitos:**

- detectar a queda da conexão (evento `close`) no hook `useChatSocket`;
- tentar reconectar automaticamente, com backoff progressivo (ex.: 1s, 2s, 4s, ... até um teto);
- reenviar o `join` (com o mesmo username) assim que reconectar;
- mostrar visualmente o estado "reconectando..." para quem está usando o chat.

**Critério de conclusão:** derrubar a API (`Ctrl+C` no terminal do `api`), esperar alguns
segundos, subir de novo (`npm run dev`) - o chat no navegador deve voltar a funcionar sozinho,
sem precisar dar F5.

---

## Desafio 6 (bônus temático) — Status de pagamento em streaming

Uma variação do agente ligada ao tema do bootcamp.

**Requisitos:**

- ao mencionar o agente com um gatilho de pagamento (ex.: `@agente pagamento`), em vez de uma
  única resposta, o agente envia uma **sequência de eventos** simulando um status evoluindo -
  por exemplo `pending` → `processing` → `approved`, cada um chegando como uma mensagem
  separada (ou um novo `agent_start`/`agent_end`), com um pequeno delay entre eles.

**Critério de conclusão:** mandar a mensagem e ver a sequência de status chegando aos poucos,
como se fosse uma notificação de webhook "ao vivo".

---

## Dicas gerais

- Teste cada mudança do servidor isolada com `wscat` (ver README) antes de mexer no frontend -
  é mais rápido pra iterar;
- se adicionar um evento novo no protocolo, adicione o tipo em `api/src/ws/protocol.ts` **e**
  em `web/src/types.ts` (os dois pacotes não compartilham tipos, de propósito - ver notas do
  README);
- vale adicionar testes nos seus eventos novos seguindo o padrão de `api/tests/chat.test.ts`.

## Fora do escopo deste exercício

Para manter o foco no conceito de tempo real, os itens abaixo propositalmente **não** fazem
parte de nenhum desafio acima:

- persistência (banco de dados);
- autenticação;
- deploy em produção;
- suportar um volume grande de usuários simultâneos (escala).
