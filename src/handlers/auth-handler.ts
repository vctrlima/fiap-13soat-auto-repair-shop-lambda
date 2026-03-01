import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { Pool } from "pg";
import jwt from "jsonwebtoken";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000,
});

interface Customer {
  id: string;
  name: string;
  email: string;
  document: string;
}

function formatResponse(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Validates CPF check digits using the standard Brazilian algorithm.
 * @param cpf - A sanitized 11-digit CPF string
 * @returns true if the CPF has valid check digits
 */
export function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11) return false;

  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(10))) return false;

  return true;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { cpf } = body;

    if (!cpf) {
      return formatResponse(400, {
        message: "CPF is required",
      });
    }

    const sanitizedCpf = cpf.replace(/\D/g, "");

    if (sanitizedCpf.length !== 11) {
      return formatResponse(400, {
        message: "Invalid CPF format. Must be 11 digits.",
      });
    }

    if (!isValidCpf(sanitizedCpf)) {
      return formatResponse(400, {
        message: "Invalid CPF. Check digits do not match.",
      });
    }

    const result = await pool.query<Customer>(
      'SELECT id, name, email, document FROM "Customer" WHERE document = $1',
      [sanitizedCpf],
    );

    if (result.rows.length === 0) {
      return formatResponse(404, {
        message: "Customer not found",
      });
    }

    const customer = result.rows[0];

    const accessToken = jwt.sign(
      {
        sub: customer.id,
        name: customer.name,
        email: customer.email,
        cpf: customer.document,
        type: "customer",
      },
      process.env.JWT_ACCESS_TOKEN_SECRET!,
      {
        expiresIn: (process.env.JWT_EXPIRES_IN ||
          "15m") as jwt.SignOptions["expiresIn"],
        issuer: "https://auto-repair-shop.auth",
        audience: "auto-repair-shop-api",
      },
    );

    return formatResponse(200, {
      accessToken,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      },
    });
  } catch (error) {
    console.error("Authentication error:", error);

    return formatResponse(500, {
      message: "Internal server error",
    });
  }
}
