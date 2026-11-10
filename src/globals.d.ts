export {};
declare global {
  interface Window {
    RB_ADMIN?: { email?: string; name?: string | null };
  }
}
