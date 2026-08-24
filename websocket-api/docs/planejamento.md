# Workshop 4 — Streaming & WebSockets

Planejamento e cronograma do próximo workshop (1h), na sequência do [workshop 3 — APIs REST](../03-rest-api/README.md).

> Este arquivo é só o planejamento (conteúdo, cronograma, ideia de app). O código do projeto
> prático ainda não foi criado — entra numa etapa seguinte, depois de revisão.

## Objetivo

Sair do modelo request/response do REST e entender **quando e por que** usar comunicação em
tempo real (streaming e WebSockets), com uma demo prática rodando 100% em `localhost`.

## Formato (60 min)

| Bloco | Duração | O quê |
|---|---|---|
| 1. Teoria | 10 min | Conceitos: streaming, polling, SSE, WebSockets |
| 2. Hands-on guiado | 20 min | Live coding: WS em cima do Expense Tracker (feed em tempo real) |
| 3. Dúvidas + atividade opcional | 30 min | Perguntas livres + exercício prático para quem quiser praticar |

Premissa: alunos executam tudo em `localhost`, sem acesso à AWS. Nada impede exibir, à parte
(fora da atividade obrigatória), um exemplo já hospedado na AWS como demo/teaser.

## Pré-requisitos para os alunos

- Node.js 18+ e npm instalados
- Dois navegadores/abas abertos (para demonstrar sincronização em tempo real)
- Opcional: [wscat](https://github.com/websockets/wscat) ou extensão de cliente WS no navegador,
  para inspecionar frames manualmente

## Bloco 1 — Teoria (10 min)

Slides mínimos (8–9 slides, ritmo rápido, sem aprofundar RFC):

1. **Capa** — Streaming & WebSockets: comunicação em tempo real
2. **Recap REST** — request/response: cliente sempre pergunta, servidor nunca avisa sozinho.
   Qual o problema disso pra casos como chat, notificações, status de pagamento em andamento?
3. **O problema em 1 pergunta** — "como o cliente sabe que algo mudou, sem ficar perguntando
   toda hora?"
4. **As alternativas** — tabela comparativa rápida:
   - Polling (requisições repetidas em intervalo)
   - Long polling (segura a requisição até ter algo novo)
   - SSE — Server-Sent Events (stream unidirecional servidor → cliente, via HTTP)
   - WebSockets (canal full-duplex, bidirecional, conexão persistente)
5. **O que é "stream"** — fluxo contínuo de dados processado aos poucos, sem esperar tudo
   pronto. Exemplos que os alunos já viram/vão ver: download progressivo, upload em chunks,
   **streaming de tokens de LLM** (chat digitando palavra por palavra) — gancho direto com o
   contexto do bootcamp (agentic/AI).
6. **WebSockets na prática** — handshake via HTTP `Upgrade`, depois vira um canal só de
   mensagens (sem overhead de header a cada troca). Full-duplex: os dois lados mandam quando
   quiserem.
7. **Ciclo de vida de uma conexão** — `open` → `message` (n vezes, os dois lados) → `close` /
   `error`; menção rápida a ping/pong (keep-alive) e reconexão.
8. **Quando usar o quê** — guia de decisão:
   - Preciso só de atualizações do servidor pro cliente, via HTTP puro? → SSE
   - Preciso de via de mão dupla, baixa latência, alto volume de eventos? → WebSocket
   - Não preciso de tempo real de verdade, atualização a cada X segundos já resolve? → Polling
9. **Onde aparece no mundo real** — chat, notificações, dashboards ao vivo, status de pagamento
   assíncrono (pix processando → aprovado), colaboração (cursores em tempo real), streaming de
   resposta de LLM.

## Bloco 2 — Hands-on guiado (20 min)

Aplicação nova, criada do zero (não reaproveita o `expense-tracker` do workshop 3): **chat em
tempo real com um "agente" que responde em streaming**, simulando como respostas de LLM chegam
em pedaços — o mesmo padrão usado pelas APIs de IA que aparecem no resto do bootcamp.

Por que essa ideia:

- **WebSocket** fica evidente no que já é natural nele: múltiplos clientes conectados ao mesmo
  tempo, conexão persistente, broadcast bidirecional (mensagem de um aparece na hora pra todos)
- **Streaming** fica evidente na resposta do agente: em vez de mandar tudo de uma vez, o
  servidor manda a resposta em pedaços (chunks/deltas) com um pequeno delay entre eles, e o
  cliente vai concatenando — visualmente é o efeito "digitando" que qualquer chat com IA usa
  hoje. Assim os dois conceitos do workshop (stream e WebSocket) aparecem juntos, na mesma
  aplicação, sem forçar a barra
- Chat é um domínio que todo mundo entende de cara, sem precisar explicar regra de negócio —
  sobra tempo de aula pro conceito de rede em si

Alternativas consideradas e descartadas:

- **Só chat, sem streaming** (broadcast puro) — mostra bem WebSocket, mas não mostra "stream"
  de verdade; os dois conceitos ficam redundantes
- **Dashboard/ticker de dados ao vivo** — mostra stream bem (um sentido só, servidor → cliente),
  mas fica fraco pra WebSocket, já que não usa a via bidirecional (ficaria melhor como SSE puro)
- **Quadro colaborativo** (cursores/desenho em tempo real) — bem visual, mas mais complexo de
  codar ao vivo em 20 min e menos ligado ao contexto de IA do bootcamp

Roteiro sugerido:

1. Subir um WebSocket server simples (Node + `ws`), com cliente em HTML + JS puro — sem
   framework de UI, pra não gastar tempo de aula com build/tooling
2. Usuário entra com um nome, conecta via WS; servidor faz broadcast de "fulano entrou"
3. Mensagem enviada por um cliente é *broadcast* para todos os outros conectados
4. Ao chegar uma mensagem que menciona `@agente`, o servidor dispara uma resposta simulada do
   "agente", mandada em **múltiplos frames pequenos** (palavra por palavra, ou em chunks de
   poucos caracteres, com `setTimeout`/`setInterval` entre eles) em vez de uma mensagem só —
   sem a menção, a mensagem só é transmitida entre os humanos, do jeito que um bot de chat com
   "mention" normalmente funciona (ex.: `@bot` no Slack)
5. No cliente, cada chunk recebido é concatenado na mesma bolha de mensagem — dá pra ver o
   texto "aparecendo" progressivamente, como uma resposta de LLM real
6. Demo: abrir 2–3 abas como usuários diferentes, mostrar o broadcast entre humanos e depois o
   agente respondendo em streaming pra todo mundo ver ao mesmo tempo
7. DevTools → aba Network → filtro WS, mostrar os frames chegando um a um — o "por baixo do
   pano" do efeito de digitação

Resultado esperado ao final do bloco: alunos entendem, na prática, a diferença entre "mandar
tudo de uma vez" (broadcast simples) e "mandar em pedaços incrementais" (streaming) — os dois
rodando sobre o mesmo canal WebSocket.

## Bloco 3 — Dúvidas + atividade opcional (30 min)

Perguntas livres primeiro. Para quem terminar rápido ou quiser ir além, propor uma (ou mais)
extensões opcionais sobre o mesmo chat:

- **Lista de usuários online**: manter e exibir quem está conectado, com broadcast de
  entrada/saída
- **Indicador "digitando..."**: evento efêmero enviado enquanto o usuário digita, sem persistir
  nada — mostra uso de WS pra sinalização, não só mensagens
- **Salas separadas**: permitir múltiplas salas, com broadcast restrito a quem está na mesma sala
- **Streaming vs resposta única**: alternar o agente entre responder tudo de uma vez e responder
  em chunks, e comparar a sensação de "tempo real" — ótimo gancho pra discutir por que APIs de
  LLM streamam por padrão
- **Reconexão automática**: se a conexão cair, o cliente tenta reconectar sozinho (com backoff)
- **Gancho com o tema do bootcamp**: fazer o agente simular o status de um pagamento
  (`pending` → `processing` → `approved`/`failed`) como uma sequência de mensagens streamadas
  no mesmo chat

Não é obrigatório terminar todas — é para dar opção de mão na massa pra quem quiser aprofundar
enquanto ainda há tempo/suporte do instrutor na sala. As diretivas detalhadas de cada uma (o
que implementar, dicas técnicas, critério de "pronto") já estão escritas em
[exercicio.md](./exercicio.md), prontas para distribuir na aula.

### Sala compartilhada na AWS (fora da atividade, sem exigir AWS do aluno)

Implementado: em vez de só mostrar um print, a turma inteira consegue entrar na mesma sala
durante a aula, por uma URL só - uma instância EC2 (via CDK) rodando exatamente o mesmo código
deste repositório, sem alterações de comportamento (ver [deploy.md](./deploy.md)). Serve tanto
de "uau, todo mundo no mesmo chat" quanto de gancho pro que vem depois no bootcamp (semana 4,
CDK). Nenhum aluno precisa ter acesso à AWS para isso - só o instrutor faz o deploy antes da
aula e derruba depois.

Ficou de fora de propósito a versão "AWS-nativa" (API Gateway WebSocket API + Lambda +
DynamoDB) - é o jeito mais idiomático de fazer isso sem servidor, mas exigiria reescrever a
camada de conexão/broadcast (Lambda é stateless), o que não valia o risco em cima da hora só
para um teaser. Pode virar um workshop próprio no futuro.

## Em aberto / decisões para revisão

- [ ] `ws` puro ou `socket.io`? (`ws` é mais próximo do protocolo cru, mais didático pro
  conceito; `socket.io` dá reconexão/fallback prontos, mais "produção")
- [ ] Confirmar se a atividade opcional do bloco 3 será uma só (fixa) ou um menu de opções
- [ ] Decidir se entra o teaser da AWS (e qual serviço mostrar) ou se cortamos pra focar 100%
  no local

Decisões já tomadas na implementação (ver [README.md](./README.md)):

- `ws` puro (não `socket.io`) - mais próximo do protocolo cru, mais didático
- Frontend em React + Vite + TS, consistente com o workshop 3 (o "zero build" era só para o
  rascunho ao vivo; o projeto de referência final ganha mais reuso/teste ficando no mesmo
  padrão dos outros workshops)
- Chunking por palavra, ~90ms entre chunks (ver `api/src/ws/agent.ts`)
- Pasta do projeto: `api/` e `web/` direto em `04-streaming-websockets/`, no mesmo padrão do
  workshop 3

## Próximos passos

O código de referência já existe em [`api/`](./api) e [`web/`](./web), com testes de
integração via WebSocket real (`api/tests/chat.test.ts`) - ver o [README.md](./README.md) para
como rodar. Falta decidir os dois pontos em aberto acima e fechar o roteiro passo a passo do
live coding em cima do código já pronto.
