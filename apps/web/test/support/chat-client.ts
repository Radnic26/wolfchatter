import type { ChatClient } from "@wolfchatter/shared/client";
import { vi } from "vitest";

export interface ChatClientDouble extends ChatClient {
  subscribed: string[];
  unsubscribed: string[];
  /** What a subscription answers with, so a spec can hold one open or refuse it. */
  answerSubscribe: (roomId: string) => Promise<void>;
}

/**
 * The socket seen from a component: which rooms it was asked to follow, and what following
 * one answered. The real client has its own spec in the shared package.
 */
export function fakeChatClient(): ChatClientDouble {
  const client: ChatClientDouble = {
    subscribed: [],
    unsubscribed: [],
    answerSubscribe: async () => undefined,
    connect: vi.fn(),
    close: vi.fn(),
    subscribe: (roomId) => {
      client.subscribed.push(roomId);
      return client.answerSubscribe(roomId);
    },
    unsubscribe: (roomId) => void client.unsubscribed.push(roomId),
  };

  return client;
}
