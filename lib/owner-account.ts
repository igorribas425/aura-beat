export const OWNER_EMAIL = "igorribas425@gmail.com";

export function isOwnerEmail(email: string | null | undefined) {
  return String(email || "")
    .trim()
    .toLowerCase() === OWNER_EMAIL;
}
