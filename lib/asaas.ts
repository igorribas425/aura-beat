type AsaasError = {
  errors?: Array<{
    code?: string;
    description?: string;
  }>;
};

export type AsaasCustomer = {
  id: string;
};

export type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  dueDate?: string;
  externalReference?: string;
};

export type AsaasPixQrCode = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};

function env(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Variavel obrigatoria nao configurada: ${name}`
    );
  }

  return value;
}

export function getAsaasPixFee() {
  const value = Number(
    env("ASAAS_PIX_FEE").replace(",", ".")
  );

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      "ASAAS_PIX_FEE precisa ser um valor numerico valido."
    );
  }

  return Math.round(value * 100) / 100;
}

export function getAsaasConfig() {
  return {
    apiKey: env("ASAAS_API_KEY"),
    apiUrl: env("ASAAS_API_URL").replace(/\/$/, ""),
  };
}

async function asaasRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { apiKey, apiUrl } =
    getAsaasConfig();

  const response = await fetch(
    `${apiUrl}${path}`,
    {
      ...init,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type":
          "application/json",
        access_token: apiKey,
        ...(init.headers || {}),
      },
    }
  );

  const text =
    await response.text();

  let json: unknown = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (!response.ok) {
    const error =
      json as AsaasError | null;

    const detail =
      error?.errors
        ?.map(
          (item) =>
            item.description ||
            item.code
        )
        .filter(Boolean)
        .join("; ") ||
      `Erro Asaas HTTP ${response.status}`;

    throw new Error(detail);
  }

  return json as T;
}

function onlyDigits(
  value: string | null | undefined
) {
  return String(value || "").replace(
    /\D/g,
    ""
  );
}

export async function findOrCreateAsaasCustomer(
  input: {
    name: string;
    cpfCnpj?: string | null;
    email?: string | null;
    phone?: string | null;
  }
) {
  const cpfCnpj =
    onlyDigits(input.cpfCnpj);

  const validDocument =
    cpfCnpj.length === 11 ||
    cpfCnpj.length === 14;

  const email =
    input.email?.trim().toLowerCase() ||
    "";

  if (!input.name.trim()) {
    throw new Error(
      "Nome do pagador obrigatorio."
    );
  }

  if (!validDocument && !email) {
    throw new Error(
      "Informe CPF/CNPJ ou e-mail para criar a cobranca."
    );
  }

  const query = validDocument
    ? `cpfCnpj=${encodeURIComponent(cpfCnpj)}`
    : `email=${encodeURIComponent(email)}`;

  const existing =
    await asaasRequest<{
      data?: AsaasCustomer[];
    }>(
      `/customers?${query}&limit=1`
    );

  const found =
    existing.data?.[0];

  if (found?.id) {
    return found;
  }

  return asaasRequest<AsaasCustomer>(
    "/customers",
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name.trim(),
        cpfCnpj:
          validDocument
            ? cpfCnpj
            : undefined,
        email:
          email || undefined,
        mobilePhone:
          onlyDigits(
            input.phone
          ) || undefined,
      }),
    }
  );
}

export async function createAsaasPixPayment(
  input: {
    customerId: string;
    value: number;
    dueDate: string;
    description: string;
    externalReference: string;
  }
) {
  return asaasRequest<AsaasPayment>(
    "/payments",
    {
      method: "POST",
      body: JSON.stringify({
        customer:
          input.customerId,
        billingType: "PIX",
        value: input.value,
        dueDate: input.dueDate,
        description:
          input.description,
        externalReference:
          input.externalReference,
      }),
    }
  );
}

export async function getAsaasPixQrCode(
  paymentId: string
) {
  return asaasRequest<AsaasPixQrCode>(
    `/payments/${encodeURIComponent(
      paymentId
    )}/pixQrCode`
  );
}

export async function getAsaasPayment(
  paymentId: string
) {
  return asaasRequest<AsaasPayment>(
    `/payments/${encodeURIComponent(
      paymentId
    )}`
  );
}

export function mapAsaasStatus(
  status: string
):
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "cancelled" {
  switch (
    String(status || "").toUpperCase()
  ) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid";

    case "REFUNDED":
      return "refunded";

    case "DELETED":
      return "cancelled";

    case "OVERDUE":
      return "failed";

    case "AWAITING_RISK_ANALYSIS":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
    case "DUNNING_REQUESTED":
    case "DUNNING_RECEIVED":
      return "processing";

    default:
      return "pending";
  }
}
