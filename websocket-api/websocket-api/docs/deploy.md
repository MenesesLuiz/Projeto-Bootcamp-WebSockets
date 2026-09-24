# Deploy — demo hospedada na AWS (opcional)

Sobe o `realtime-chat` (o mesmo código do workshop, sem alterações de comportamento) em uma
única instância EC2, pra todo mundo na sala entrar por uma URL só. Pensado para caber em um
dia: sobe antes do workshop, derruba depois. Não é necessário pros alunos - é só o teaser
mencionado no [planejamento](./planejamento.md).

## Arquitetura

Uma instância EC2 (`t3.micro`) rodando um container Docker com a API e o frontend já buildado
juntos (ver [`../Dockerfile`](../Dockerfile) e a mudança em `api/src/app.ts` que serve os
estáticos do `web/` quando eles existem). Sem ALB, sem CloudFront, sem S3, sem domínio - tudo
em HTTP puro, na porta 80, no DNS público que a própria AWS atribui à instância.

Essa simplicidade é proposital: é um demo de um dia, para no máximo ~50 pessoas, sem domínio
disponível. Ver a [conversa que motivou essa escolha](./planejamento.md) - a alternativa mais
"correta" (API Gateway WebSocket + Lambda + DynamoDB) exigiria reescrever a camada de conexão
do servidor, o que não vale o risco em cima da hora só para um teaser.

## Pré-requisitos

- Conta AWS com credenciais configuradas localmente (`aws configure`, ou variáveis de
  ambiente/SSO) - é o que `cdk deploy` usa;
- Docker rodando localmente (o CDK builda a imagem com o Docker da sua máquina e sobe pro ECR
  sozinho, como parte do `cdk deploy`);
- Node.js 18+ e npm;
- a conta precisa ter uma VPC default na região escolhida (a maioria das contas AWS já tem -
  ver Troubleshooting se não tiver).

## Deploy

```bash
cd infra
npm install
npx cdk bootstrap   # só da primeira vez que essa conta/região usa CDK
npx cdk deploy
```

Confirme a criação dos recursos quando for perguntado (`cdk deploy` mostra o que vai criar
antes de aplicar). Ao final, o terminal imprime uma saída `ChatUrl` - essa é a URL pra
compartilhar com a sala, algo como:

```
Outputs:
RealtimeChatDemoStack.ChatUrl = http://ec2-x-x-x-x.compute-1.amazonaws.com
```

**Espere 1-2 minutos** depois do `cdk deploy` terminar: a instância ainda precisa instalar o
Docker, autenticar no ECR e subir o container. Se abrir a URL na hora e não responder, espere
um pouco e recarregue.

## Testar antes do workshop

- Abra a URL, entre com um nome, mande uma mensagem, mencione `@agente`;
- abra de outro dispositivo/rede (ex.: 4G no celular) pra simular um participante de verdade,
  fora da sua própria rede.

## Derrubar depois

```bash
cd infra
npx cdk destroy
```

Confirme a remoção. Isso apaga a instância, o security group e a imagem publicada no ECR (o
bucket/repositório de assets do CDK bootstrap continua existindo entre deploys - é
reaproveitado, não precisa recriar). Nada fica rodando cobrando depois disso.

## Custo esperado

Uma `t3.micro` sob demanda custa frações de centavo por hora - rodando algumas horas num dia,
o custo é irrelevante. Ainda assim, não esqueça do `cdk destroy` ao final.

## Troubleshooting

- **A URL não responde depois de alguns minutos**: entre na instância via SSM (não precisa de
  chave SSH nem porta 22 aberta) e olhe os logs do container:

  ```bash
  aws ssm start-session --target <instance-id>
  sudo docker logs chat
  sudo docker ps
  ```

- **O chat conecta mas o WebSocket cai na hora (todo mundo desconecta)**: normalmente é o
  `CORS_ORIGIN` não batendo com o `Origin` que o navegador está mandando - confira os logs do
  container (a rejeição de origem é logada, ver `api/src/ws/socket-server.ts`).
- **`cdk deploy` falha com algo como "no default VPC found"**: a conta/região não tem VPC
  default. Crie uma (`aws ec2 create-default-vpc`) ou adapte `infra/lib/chat-demo-stack.ts`
  para apontar para outra VPC existente.
- **Quer testar o container localmente antes de fazer deploy**: da raiz do workshop
  (`04-streaming-websockets/`):

  ```bash
  docker build -t realtime-chat:local .
  docker run --rm -p 3000:3000 -e CORS_ORIGIN=http://localhost:3000 realtime-chat:local
  ```

  Depois abra `http://localhost:3000` - é exatamente o que roda na EC2, só que na sua máquina.
