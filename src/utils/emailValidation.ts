export const STUDENT_EMAIL_DOMAIN = "sun.ac.ug";

// A student email must be `<number>@sun.ac.ug` where the numeric part starts
// with 220 through 260 (e.g. 2200000001@sun.ac.ug ... 2609999999@sun.ac.ug).
export function isValidStudentEmail(email?: string | null): boolean {
  if (!email) return false;
  const match = /^(\d+)@sun\.ac\.ug$/i.exec(email);
  if (!match) return false;
  const prefix = parseInt(match[1].slice(0, 3), 10);
  return prefix >= 220 && prefix <= 260;
}

export const STUDENT_EMAIL_ERROR =
  "Only @sun.ac.ug student emails are allowed (student number must start with 220-260).";
