# Realtime Chat

Projeto de estudo de um chat em tempo real usando WebSocket. A aplicação é dividida em uma API Node.js/TypeScript e um frontend React/Vite.

O projeto atualmente demonstra:

- presença de usuários conectados;
- indicador de digitação com debounce no cliente;
- salas públicas, incluindo criação, troca, renomeação e exclusão;
- broadcasts limitados à sala atual;
- respostas simuladas do `@agente` com streaming;
- reconexão automática do cliente;
- limites básicos contra excesso de conexões, mensagens e backpressure.

O planejamento didático está em [`docs/planejamento.md`](docs/planejamento.md), e os desafios estão em [`docs/exercicio.md`](docs/exercicio.md).

## Pré-requisitos

- Node.js 18 ou superior;
- npm.

## Executando localmente

Em um terminal, inicie a API:

```bash
cd api
npm install
npm run dev
```

A API ficará disponível em `http://localhost:3000` e o WebSocket em `ws://localhost:3000/ws`.

Em outro terminal, inicie o frontend:

```bash
cd web
npm install
npm run dev
```

Abra a URL exibida pelo Vite, normalmente `http://localhost:5173`.

## Comandos úteis

Na API:

```bash
npm run build
npm test
```

No frontend:

```bash
npm run build
npm run lint
npx react-doctor@latest --verbose
```

## Comportamento atual

### Usuários

O nome é validado pelo servidor e só é aceito depois do evento `joined`. Dois usuários ativos não podem usar o mesmo nome, sem diferenciação entre maiúsculas e minúsculas: `Luiz` e `luiz` entram em conflito. O nome original continua sendo exibido para o usuário.

Ao desconectar, o nome é liberado. O estado é mantido apenas em memória, então ele também é perdido quando a API reinicia.

### Salas

Todo usuário entra inicialmente na sala `global`. O cliente recebe o catálogo de salas disponíveis e pode:

- trocar de sala;
- criar uma sala com um nome próprio;
- renomear uma sala criada por ele;
- excluir uma sala criada por ele.

A sala `global` não pode ser renomeada nem excluída. Ao excluir uma sala, os usuários que estavam nela são movidos para `global` e o catálogo é atualizado.

Mensagens, presença e indicador de digitação são enviados somente para os usuários da mesma sala. Não existe persistência de mensagens.

### Reconexão

O frontend tenta reconectar automaticamente após uma queda, usando espera progressiva de até 8 segundos. Ao reconectar, ele envia novamente o nome e a sala selecionada. As mensagens e indicadores temporários são limpos porque o servidor não armazena histórico.

### Agente

Uma mensagem contendo `@agente` inicia uma resposta simulada em partes. O servidor envia eventos de início, chunks de texto e fim, sempre para a sala atual.

## Protocolo WebSocket

Todos os frames são JSON.

### Cliente para servidor

| Evento | Exemplo | Finalidade |
| --- | --- | --- |
| `join` | `{ "type": "join", "username": "Luiz", "room": "global" }` | Entra no chat; `room` é opcional e por padrão é `global`. |
| `switch_room` | `{ "type": "switch_room", "room": "backend" }` | Troca para uma sala existente. |
| `create_room` | `{ "type": "create_room", "name": "backend" }` | Cria uma sala e entra nela. |
| `rename_room` | `{ "type": "rename_room", "name": "backend-2" }` | Renomeia uma sala que pertence ao usuário. |
| `delete_room` | `{ "type": "delete_room", "name": "backend" }` | Exclui uma sala que pertence ao usuário. |
| `chat` | `{ "type": "chat", "text": "Olá" }` | Envia uma mensagem para a sala atual. |
| `typing` | `{ "type": "typing", "isTyping": true }` | Informa que o usuário começou ou parou de digitar. |

O cliente aplica debounce no evento `typing`; portanto, digitar uma palavra não gera um evento para cada tecla.

### Servidor para cliente

| Evento | Finalidade |
| --- | --- |
| `joined` | Confirma que o nome foi aceito e informa a sala atual. |
| `system` | Exibe avisos de entrada, saída ou alteração de sala. |
| `chat` | Entrega uma mensagem da sala atual. |
| `presence` | Atualiza a lista de usuários da sala. |
| `rooms` | Envia o catálogo de salas disponíveis. |
| `room_changed` | Confirma uma troca de sala. |
| `room_renamed` | Informa que uma sala foi renomeada. |
| `room_deleted` | Informa que uma sala foi excluída. |
| `typing` | Atualiza o indicador de digitação de outro usuário. |
| `agent_start` / `agent_chunk` / `agent_end` | Controlam a resposta em streaming do agente. |
| `error` | Informa uma operação inválida ou rejeitada. |

O servidor envia `error` para nomes duplicados, nomes ou salas inválidos e operações sem permissão, como tentar excluir a sala de outra pessoa.

## Limites de segurança atuais

As proteções implementadas nesta etapa são:

- payload WebSocket de até 8 KiB;
- no máximo 100 conexões ativas;
- no máximo 10 conexões simultâneas por IP;
- no máximo 30 mensagens por janela de 10 segundos, controlado por socket e por IP;
- fechamento de clientes que acumulam mais de 256 KiB de dados pendentes;
- heartbeat para detectar conexões abandonadas;
- validação da origem permitida e dos campos antes de processar a operação.

Os limites de usuário, sala e mensagem também são aplicados no protocolo. O estado continua em memória e ainda não há autenticação, persistência ou distribuição entre múltiplas instâncias.

## Testando sem o frontend

Com a API rodando, instale ou execute o `wscat`:

```bash
npx wscat -c ws://localhost:3000/ws
```

Envie um primeiro login:

```json
{"type":"join","username":"alice","room":"global"}
```

Depois teste uma mensagem:

```json
{"type":"chat","text":"Olá, sala global"}
```

Para testar o conflito de nomes, abra uma segunda conexão e envie `ALICE`. O servidor deve rejeitá-la porque a comparação não diferencia maiúsculas de minúsculas.

Para testar salas, use a conexão do proprietário:

```json
{"type":"create_room","name":"estudos"}
{"type":"rename_room","name":"backend"}
{"type":"switch_room","room":"global"}
{"type":"switch_room","room":"backend"}
{"type":"delete_room","name":"backend"}
```

Para testar o agente:

```json
{"type":"chat","text":"@agente qual o status do pagamento?"}
```

Para executar os testes automatizados da API:

```bash
cd api
npm test -- --runInBand
```

## Estrutura

```text
.
├── api/
│   ├── src/
│   │   ├── middleware/
│   │   ├── utils/
│   │   ├── ws/
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   ├── types.ts
│   │   └── useChatSocket.ts
│   ├── index.html
│   └── vite.config.ts
├── infra/
│   └── lib/chat-demo-stack.ts
├── docs/
│   ├── deploy.md
│   ├── exercicio.md
│   └── planejamento.md
├── Dockerfile
└── README.md
```

## Deploy

As instruções de infraestrutura e deploy estão em [`docs/deploy.md`](docs/deploy.md). O `Dockerfile` usa build em múltiplas etapas para compilar a API e executar o servidor com Node.js.

## Escopo futuro

O desafio 4 foi pulado por decisão do projeto. Como próximos aprimoramentos de segurança, ainda podem ser adicionados expiração e limite de salas, catálogo incremental, limite de streams concorrentes do agente e limpeza do histórico no frontend.
