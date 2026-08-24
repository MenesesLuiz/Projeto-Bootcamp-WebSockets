# Realtime Chat

Projeto de referência para o workshop de streaming & WebSockets, na sequência do
[workshop 3 — APIs REST](../03-rest-api/README.md). Um chat em tempo real (Node + `ws` +
TypeScript) com um "agente" que responde em streaming - a resposta chega em pedaços, palavra
por palavra, do mesmo jeito que uma API de LLM transmite o que gera - e um frontend mínimo
(React + Vite) pra ver isso acontecendo em mais de uma aba ao mesmo tempo.

Veja o [planejamento do workshop](./docs/planejamento.md) para o cronograma e o roteiro da aula.

## Pré-requisitos

- Node.js (18+)
- npm

## Executar a API

```bash
cd api
npm install
npm run dev
```

A API sobe em `http://localhost:3000` e o WebSocket em `ws://localhost:3000/ws`.

Para rodar os testes:

```bash
npm test
```

## Executar o frontend

Em outro terminal:

```bash
cd web
npm install
npm run dev
```

O frontend sobe em `http://localhost:5173`. Abra em duas abas (ou dois navegadores) com nomes
diferentes pra ver o broadcast em tempo real entre elas.

## URLs

- API: http://localhost:3000
- WebSocket: ws://localhost:3000/ws
- Frontend: http://localhost:5173

## Protocolo do WebSocket

Todo frame trocado é um único objeto JSON com um campo `type`.

### Cliente → servidor

| `type`  | Payload                    | Quando enviar                          |
|---------|-----------------------------|-----------------------------------------|
| `join`  | `{ type: "join", username }` | Uma vez, ao conectar, antes de tudo mais |
| `chat`  | `{ type: "chat", text }`     | A cada mensagem enviada no chat          |

Toda mensagem `chat` é sempre transmitida (broadcast) para todo mundo. O agente **só**
responde quando a mensagem menciona `@agente` (case-insensitive) - sem isso, ele fica calado,
do jeito que qualquer bot de chat com "mention" costuma funcionar (ex.: `@bot` no Slack).

### Servidor → cliente

| `type`         | Payload                                              | O que significa                                   |
|-----------------|-------------------------------------------------------|-----------------------------------------------------|
| `system`        | `{ type: "system", text }`                             | Alguém entrou ou saiu do chat                       |
| `chat`          | `{ type: "chat", id, username, text, createdAt }`       | Mensagem de um usuário, para todo mundo (inclusive quem enviou) |
| `agent_start`   | `{ type: "agent_start", id }`                           | O agente começou a responder - abre uma bolha nova   |
| `agent_chunk`   | `{ type: "agent_chunk", id, text }`                     | Um pedaço da resposta - concatene na bolha `id`      |
| `agent_end`     | `{ type: "agent_end", id }`                             | A resposta do agente terminou                       |

O trio `agent_start` / `agent_chunk` / `agent_end` não é acidental: é o mesmo formato que APIs
de streaming de LLM usam (ex.: `message_start` / `content_block_delta` / `message_stop`). A
ideia é que trocar `pickReply()` em `api/src/ws/agent.ts` por uma chamada de verdade a um
modelo não muda o resto do fluxo.

A checagem do mention (`mentionsAgent()`) fica no mesmo arquivo - é só um `includes("@agente")`
depois de normalizar o texto para minúsculas.

## Estrutura do projeto

```
04-streaming-websockets/
├── Dockerfile                         # Empacota api + web num container só (ver docs/deploy.md)
├── .dockerignore
├── api/
│   ├── src/
│   │   ├── app.ts                     # Express app: /health + estáticos do web/ (deploy)
│   │   ├── server.ts                  # HTTP server + WebSocket server + listen
│   │   ├── middleware/
│   │   │   ├── cors.ts
│   │   │   └── request-logger.ts
│   │   ├── ws/
│   │   │   ├── protocol.ts            # Schemas (zod) e tipos do protocolo
│   │   │   ├── connection-registry.ts # Quem está conectado + broadcast
│   │   │   ├── heartbeat.ts           # Ping/pong keepalive
│   │   │   ├── agent.ts               # Resposta simulada em streaming
│   │   │   └── socket-server.ts       # Liga tudo: conexão, mensagens, disconnect
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── sleep.ts
│   ├── tests/
│   │   ├── health.test.ts
│   │   ├── chat.test.ts               # Testes de integração via WebSocket de verdade
│   │   └── helpers/
│   ├── .env.example
│   └── package.json
│
├── web/
│   ├── src/
│   │   ├── App.tsx                    # Tela de entrada + tela de chat
│   │   ├── useChatSocket.ts           # Hook que fala com o WebSocket
│   │   ├── types.ts
│   │   └── main.tsx
│   └── package.json
│
├── infra/                          # CDK: EC2 + Docker (deploy opcional na AWS)
│   ├── bin/infra.ts
│   └── lib/chat-demo-stack.ts
│
├── docs/
│   ├── planejamento.md
│   ├── slides.html
│   ├── streaming-websockets.pptx
│   ├── exercicio.md               # Exercício prático opcional (bloco 3)
│   └── deploy.md                  # Passo a passo do deploy na AWS
└── README.md
```

## Notas

- Estado (usuários conectados) só existe em memória: reinicie a API e todo mundo precisa
  entrar de novo.
- As variáveis de ambiente são carregadas com [dotenvx](https://dotenvx.com)
  (`@dotenvx/dotenvx`); sem um `.env`, os valores padrão do código (`PORT=3000`,
  `CORS_ORIGIN=http://localhost:5173`) já bastam para rodar local.
- O `/health` aceita apenas a origem definida em `CORS_ORIGIN`. O WebSocket faz a mesma checagem
  de forma manual (via `verifyClient`), porque navegadores **não** aplicam CORS a conexões
  WebSocket - diferente do `fetch`/XHR, o servidor precisa validar o header `Origin` sozinho.
- Um heartbeat (ping/pong a cada 30s) derruba conexões que pararam de responder, em vez de
  deixá-las penduradas para sempre.
- O agente só responde quando a mensagem menciona `@agente` - sem isso ele fica quieto e a
  mensagem só é transmitida entre os humanos, como em qualquer chat normal.
- O que **não** está implementado de propósito - fica como o
  [exercício prático opcional](./docs/exercicio.md): lista de usuários online, indicador
  "digitando...", salas separadas, reconexão automática no cliente e mais.

## Testando sem a UI

Com a API rodando, dá pra falar com o WebSocket diretamente pelo terminal com o
[`wscat`](https://github.com/websockets/wscat):

```bash
npx wscat -c ws://localhost:3000/ws
```

Depois de conectar, cole (uma linha por vez):

```json
{"type":"join","username":"alice"}
```

```json
{"type":"chat","text":"oi @agente, tudo bem?"}
```

Você deve ver de volta o `system` de entrada, o `chat` da própria mensagem e, em seguida, os
eventos `agent_start`, vários `agent_chunk` e `agent_end` chegando um a um - só porque a
mensagem mencionou `@agente`. Mande uma mensagem sem a menção e repare que só o `chat` volta,
sem o agente. Inclua "pagamento" junto com `@agente` para ver a resposta temática.

Abra uma segunda aba do `wscat` (com outro `username`) para ver o broadcast entre duas
conexões.

## Deploy na AWS (opcional)

Pra deixar uma sala compartilhada no ar durante o workshop (todo mundo entrando pela mesma
URL), tem um app CDK em [`infra/`](./infra) que sobe uma única instância EC2 rodando o mesmo
código deste repositório, sem alterações de comportamento. Não é necessário pros alunos
rodarem - é infraestrutura do instrutor. Ver o passo a passo completo em
[`docs/deploy.md`](./docs/deploy.md).
