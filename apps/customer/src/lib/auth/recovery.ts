import { create } from 'zustand';

/**
 * Client-only hand-off between Forgot Password and Reset Password: the identifier the customer
 * entered, kept in memory (never in the URL or on disk) so the reset screen can sign them in
 * afterwards. Cleared once used.
 */
export const useRecoveryStore = create<{
  identifier: string | null;
  setIdentifier: (identifier: string | null) => void;
}>((set) => ({
  identifier: null,
  setIdentifier: (identifier) => {
    set({ identifier });
  },
}));
