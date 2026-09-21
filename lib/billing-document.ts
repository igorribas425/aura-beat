export function onlyDigits(
  value: string | null | undefined,
) {
  return String(value || "").replace(/\D/g, "");
}

function allSame(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || allSame(cpf)) {
    return false;
  }

  const calcDigit = (length: number) => {
    let sum = 0;

    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }

    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    calcDigit(9) === Number(cpf[9]) &&
    calcDigit(10) === Number(cpf[10])
  );
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14 || allSame(cnpj)) {
    return false;
  }

  const calcDigit = (
    baseLength: number,
    weights: number[],
  ) => {
    let sum = 0;

    for (let index = 0; index < baseLength; index += 1) {
      sum += Number(cnpj[index]) * weights[index];
    }

    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calcDigit(
    12,
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  const second = calcDigit(
    13,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return (
    first === Number(cnpj[12]) &&
    second === Number(cnpj[13])
  );
}

export function normalizeBillingDocument(
  value: string | null | undefined,
) {
  const digits = onlyDigits(value);

  if (isValidCpf(digits) || isValidCnpj(digits)) {
    return digits;
  }

  return null;
}
