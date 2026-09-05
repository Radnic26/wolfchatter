import type { Message, Room } from "@wolfchatter/shared/schema";

/**
 * The seam the fan-out sits behind. One instance publishes in process; a second instance
 * would implement these two methods over Postgres `LISTEN/NOTIFY` or Redis pub/sub, and
 * not a line of the write routes would change. That is the whole scale-out story.
 */
export interface Broadcaster {
  publishRoomCreated(room: Room): void;
  publishMessageCreated(message: Message): void;
}
