import type { UsernameStorage } from "@wolfchatter/shared/client";

const KEY = "wolfchatter.username";

/**
 * A browser can refuse storage outright — Safari does in private mode — and the name a
 * person posts under is not worth taking the app down for, so it is forgotten instead.
 */
export function browserUsernameStorage(): UsernameStorage {
  return {
    read() {
      try {
        return localStorage.getItem(KEY) ?? "";
      } catch (failure) {
        console.warn("The remembered user name could not be read", failure);
        return "";
      }
    },

    write(username) {
      try {
        localStorage.setItem(KEY, username);
      } catch (failure) {
        console.warn("The user name could not be remembered", failure);
      }
    },
  };
}
