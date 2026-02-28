import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "./auth-handler";

jest.mock("pg", () => {
  const mockQuery = jest.fn();
  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
    })),
    __mockQuery: mockQuery,
  };
});

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "mock-jwt-token"),
}));

const { __mockQuery: mockQuery } = jest.requireMock("pg");

function createEvent(
  body: Record<string, unknown> | null,
): APIGatewayProxyEventV2 {
  return {
    body: body ? JSON.stringify(body) : null,
    headers: {},
    isBase64Encoded: false,
    rawPath: "/api/auth/cpf",
    rawQueryString: "",
    requestContext: {} as APIGatewayProxyEventV2["requestContext"],
    routeKey: "POST /api/auth/cpf",
    version: "2.0",
  };
}

describe("auth-handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_TOKEN_SECRET = "test-secret";
    process.env.JWT_EXPIRES_IN = "15m";
  });

  it("should return 400 when CPF is missing", async () => {
    const event = createEvent({});
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toBe("CPF is required");
  });

  it("should return 400 when CPF has invalid format", async () => {
    const event = createEvent({ cpf: "123" });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toContain("Invalid CPF");
  });

  it("should return 404 when customer is not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = createEvent({ cpf: "12345678901" });
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string).message).toBe(
      "Customer not found",
    );
  });

  it("should return 200 with token when customer is found", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "uuid-123",
          name: "John Doe",
          email: "john@example.com",
          cpf: "12345678901",
        },
      ],
    });

    const event = createEvent({ cpf: "123.456.789-01" });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accessToken).toBe("mock-jwt-token");
    expect(body.customer.name).toBe("John Doe");
  });

  it("should return 500 on unexpected error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB connection failed"));

    const event = createEvent({ cpf: "12345678901" });
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
  });
});
