import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { handler, isValidCpf } from "./auth-handler";

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

async function callHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  return handler(event) as Promise<APIGatewayProxyStructuredResultV2>;
}

function createEvent(
  body: Record<string, unknown> | null,
): APIGatewayProxyEventV2 {
  return {
    body: body ? JSON.stringify(body) : undefined,
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
    const result = await callHandler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toBe("CPF is required");
  });

  it("should return 400 when CPF has invalid format", async () => {
    const event = createEvent({ cpf: "123" });
    const result = await callHandler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toContain("Invalid CPF");
  });

  it("should return 400 when CPF has invalid check digits", async () => {
    const event = createEvent({ cpf: "12345678900" });
    const result = await callHandler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toContain(
      "Check digits do not match",
    );
  });

  it("should return 400 when CPF has all identical digits", async () => {
    const event = createEvent({ cpf: "11111111111" });
    const result = await callHandler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toContain(
      "Check digits do not match",
    );
  });

  it("should return 404 when customer is not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = createEvent({ cpf: "52998224725" });
    const result = await callHandler(event);

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
          document: "52998224725",
        },
      ],
    });

    const event = createEvent({ cpf: "529.982.247-25" });
    const result = await callHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.accessToken).toBe("mock-jwt-token");
    expect(body.customer.name).toBe("John Doe");
  });

  it("should return 500 on unexpected error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB connection failed"));

    const event = createEvent({ cpf: "52998224725" });
    const result = await callHandler(event);

    expect(result.statusCode).toBe(500);
  });
});

describe("isValidCpf", () => {
  it("should return true for valid CPFs", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("12345678909")).toBe(true);
  });

  it("should return false for CPFs with all identical digits", () => {
    expect(isValidCpf("00000000000")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("99999999999")).toBe(false);
  });

  it("should return false for CPFs with wrong check digits", () => {
    expect(isValidCpf("12345678900")).toBe(false);
    expect(isValidCpf("52998224726")).toBe(false);
  });

  it("should return false for CPFs with wrong length", () => {
    expect(isValidCpf("1234567890")).toBe(false);
    expect(isValidCpf("123456789012")).toBe(false);
  });
});
