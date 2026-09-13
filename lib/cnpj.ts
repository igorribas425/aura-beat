export type CnpjLocalStatus =
  | "numeric-valid"
  | "numeric-invalid"
  | "alphanumeric-review"
  | "invalid-format";

export function normalizeCnpj(value: string | null | undefined) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 14);
}

export function formatCnpj(value: string | null | undefined) {
  const normalized = normalizeCnpj(value);

  if (/^\d{14}$/.test(normalized)) {
    return normalized.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }

  return normalized || "CNPJ não informado";
}

function digit(values: number[], weights: number[]) {
  const total = values.reduce(
    (sum, value, index) => sum + value * weights[index],
    0,
  );
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidNumericCnpj(value: string | null | undefined) {
  const normalized = normalizeCnpj(value);

  if (!/^\d{14}$/.test(normalized)) return false;
  if (/^(\d)\1{13}$/.test(normalized)) return false;

  const numbers = normalized.split("").map(Number);
  const first = digit(numbers.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(
    [...numbers.slice(0, 12), first],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return numbers[12] === first && numbers[13] === second;
}

export function getCnpjLocalStatus(
  value: string | null | undefined,
): CnpjLocalStatus {
  const normalized = normalizeCnpj(value);

  if (normalized.length !== 14) return "invalid-format";
  if (/^\d{14}$/.test(normalized)) {
    return isValidNumericCnpj(normalized) ? "numeric-valid" : "numeric-invalid";
  }

  if (/^[0-9A-Z]{14}$/.test(normalized)) return "alphanumeric-review";
  return "invalid-format";
}
