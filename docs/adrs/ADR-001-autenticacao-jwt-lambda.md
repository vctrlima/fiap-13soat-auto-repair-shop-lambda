# ADR-004: Estratégia de Autenticação com JWT via Lambda

## Status

Aceito

## Contexto

O sistema precisa autenticar dois tipos de usuários:

1. **Clientes** — identificados por CPF, sem senha (fluxo simplificado)
2. **Administradores** — identificados por e-mail e senha (fluxo tradicional)

A autenticação deve ser segura, stateless e integrável com o API Gateway para proteger rotas sensíveis sem acoplar a lógica de autenticação à aplicação principal.

Estratégias avaliadas:

- **Sessões server-side** (cookies + Redis)
- **JWT emitido pela aplicação** (endpoint interno)
- **JWT emitido por Function Serverless** (Lambda)
- **AWS Cognito** (serviço gerenciado)
- **Auth0 / Keycloak** (Identity Provider externo)

## Decisão

Adotamos **JWT emitido por AWS Lambda** para autenticação de clientes via CPF, validado pelo **JWT Authorizer do API Gateway**.

## Justificativa

1. **Separação de responsabilidades**: A lógica de autenticação de clientes é isolada em uma Lambda, desacoplada da aplicação principal.
2. **Custo eficiente**: Lambda cobra por execução — ideal para autenticação que é chamada com menos frequência que as APIs de negócio.
3. **Integração nativa com API Gateway**: JWT Authorizer do API Gateway valida tokens automaticamente sem código adicional na aplicação.
4. **Stateless**: Tokens JWT são autocontidos, eliminando necessidade de sessão server-side.
5. **Segurança**: Token inclui claims de identificação (sub, name, cpf, type), com expiração curta (15min), issuer e audience validados.

## Fluxo de Autenticação

```
Cliente → POST /api/auth/cpf {cpf} → API Gateway → Lambda
                                                      ├─ Valida CPF
                                                      ├─ Consulta Customer no RDS
                                                      └─ Retorna JWT
Cliente → GET /api/* {Authorization: Bearer <JWT>} → API Gateway
                                                       ├─ JWT Authorizer valida o token
                                                       └─ Encaminha para ALB → EKS
```

## Token JWT — Claims

| Claim   | Descrição                       |
| ------- | ------------------------------- |
| `sub`   | ID do cliente (UUID)            |
| `name`  | Nome do cliente                 |
| `email` | E-mail do cliente               |
| `cpf`   | Documento CPF                   |
| `type`  | `"customer"`                    |
| `iss`   | `https://auto-repair-shop.auth` |
| `aud`   | `auto-repair-shop-api`          |
| `exp`   | Expiração (15 minutos)          |

## Consequências

- **Positivas**: Desacoplamento, custo otimizado, validação nativa no API Gateway, escalabilidade automática.
- **Negativas**: Tokens não podem ser revogados antes da expiração (mitigado por expiração curta de 15min). Dependência do AWS Lambda e API Gateway.

## Alternativas Consideradas

| Estratégia          | Prós                    | Contras                                                 |
| ------------------- | ----------------------- | ------------------------------------------------------- |
| Sessões server-side | Revogação imediata      | Requer Redis/store, não stateless, acoplamento          |
| JWT na aplicação    | Simples                 | Acopla auth à app, não aproveita API Gateway authorizer |
| AWS Cognito         | Gerenciado, MFA, OAuth2 | Complexidade, custo, menos controle sobre claims        |
| Auth0/Keycloak      | Features ricas, OIDC    | Custo adicional, over-engineering para o escopo         |
