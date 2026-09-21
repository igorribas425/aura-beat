export const PASSWORD_REQUIREMENTS_TEXT =
  "Use pelo menos 8 caracteres, com letra maiúscula, letra minúscula, número e símbolo.";

export function passwordMeetsRequirements(password: string) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
