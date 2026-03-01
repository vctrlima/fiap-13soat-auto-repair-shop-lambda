# RFC-001: Estratégia de Autenticação e Autorização

## Metadados

| Campo         | Valor                   |
| ------------- | ----------------------- |
| **Autor**     | Equipe Auto Repair Shop |
| **Data**      | 2026-01-15              |
| **Status**    | Aprovado                |
| **Revisores** | Equipe de Arquitetura   |

## Resumo

Esta RFC define a estratégia de autenticação e autorização para o sistema Auto Repair Shop, cobrindo dois fluxos distintos: autenticação de clientes via CPF e autenticação de administradores/mecânicos via e-mail e senha.

## Motivação

O sistema precisa proteger rotas sensíveis (CRUD de ordens de serviço, dados de clientes, etc.) contra acesso não autorizado, ao mesmo tempo em que oferece um fluxo simplificado para clientes que se identificam por CPF (sem necessidade de senha).

## Proposta Detalhada

### Arquitetura de Autenticação

```
┌─────────────┐     POST /api/auth/cpf       ┌───────────────┐
│   Cliente   │ ──────────────────────────── │  API Gateway  │
└─────────────┘                              └──────┬────────┘
                                                    │
                                                    ▼
                                             ┌───────────────┐
                                             │     Lambda    │
                                             │   (Auth CPF)  │
                                             └──────┬────────┘
                                                    │ SELECT Customer
                                                    ▼
                                             ┌───────────────┐
                                             │    RDS (PG)   │
                                             └───────────────┘
                                                    │
                                                    ▼
                                               JWT Token
                                                    │
┌─────────────┐     GET /api/* + Bearer JWT  ┌──────┴────────┐
│   Cliente   │ ──────────────────────────── │   API Gateway │
└─────────────┘                              │ JWT Authorizer│
                                             └──────┬────────┘
                                                    │ Válido
                                                    ▼
                                             ┌───────────────┐
                                             │   ALB → EKS   │
                                             └───────────────┘
```

### Fluxo 1: Autenticação de Cliente (CPF)

1. Cliente envia `POST /api/auth/cpf` com `{ "cpf": "12345678901" }`
2. API Gateway roteia para a Lambda (rota pública)
3. Lambda valida o formato do CPF (11 dígitos + dígitos verificadores)
4. Lambda consulta a tabela `Customer` no RDS por `document`
5. Se encontrado, Lambda gera JWT com claims do cliente
6. Token retornado com expiração de 15 minutos

### Fluxo 2: Autenticação de Administrador/Mecânico

1. Admin envia `POST /api/auth` com `{ "email": "...", "password": "..." }`
2. API Gateway roteia para o ALB → EKS (rota pública)
3. Aplicação valida credenciais (bcrypt) contra tabela `User`
4. Se válido, gera access token (15min) + refresh token (7d)
5. Refresh via `POST /api/auth/refresh`

### Rotas Protegidas vs Públicas

| Rota                     | Tipo      | Autenticação   |
| ------------------------ | --------- | -------------- |
| `POST /api/auth/cpf`     | Pública   | Nenhuma        |
| `POST /api/auth`         | Pública   | Nenhuma        |
| `POST /api/auth/refresh` | Pública   | Nenhuma        |
| `GET /health`            | Pública   | Nenhuma        |
| `GET /docs/*`            | Pública   | Nenhuma        |
| `ANY /api/*`             | Protegida | JWT Authorizer |

### Segurança

- Tokens JWT com expiração curta (15 minutos)
- Issuer e audience validados pelo API Gateway
- Secrets armazenados no AWS Secrets Manager (sincronizados via ExternalSecrets para K8s)
- Senhas hasheadas com bcrypt (salt rounds padrão)
- Comunicação Lambda → RDS em VPC privada (sem exposição pública)

## Impacto

- **Segurança**: Todas as rotas de negócio protegidas por JWT
- **Performance**: Lambda cold start ~200ms, validação JWT no API Gateway sem latência adicional na app
- **Custo**: Lambda cobra por execução — custo negligível para volume esperado
- **Manutenibilidade**: Auth desacoplada da aplicação principal

## Riscos e Mitigações

| Risco             | Mitigação                                                |
| ----------------- | -------------------------------------------------------- |
| Token roubado     | Expiração curta (15min), sem refresh token para clientes |
| Lambda cold start | VPC-attached Lambda com provisionamento adequado         |
| DB indisponível   | Connection pooling, timeout de 10s, retry no cliente     |

## Decisão

Aprovado conforme proposto. Implementação distribuída entre os repositórios `lambda` (handler), `k8s` (API Gateway + JWT Authorizer) e `app` (auth de admin).
