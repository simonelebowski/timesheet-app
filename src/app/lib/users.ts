export type AppUser = {
  email: string;
  name: string;
  hourlyRate: number;
  canSubmitTimesheet: boolean;
  active: boolean;
};

export const USERS: AppUser[] = [
  {
    email: "registrar@ces-schools.com",
    name: "Simone",
    hourlyRate: 20,
    canSubmitTimesheet: true,
    active: true,
  },
  // add real teachers here
];

export function findUserByEmail(email: string): AppUser | undefined {
  const normalized = email.trim().toLowerCase();
  return USERS.find((u) => u.email.toLowerCase() === normalized);
}
