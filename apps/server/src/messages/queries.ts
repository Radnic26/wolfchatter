import {
  type Message,
  type MessageHistoryQuery,
  messageSchema,
  type NewMessage,
} from "@wolfchatter/shared/schema";
import type { Queryable } from "../db/db.ts";

interface MessageRow {
  id: string;
  room_id: string;
  username: string;
  body: string;
  created_at: Date;
}

const messageColumns = "id, room_id, username, body, created_at";

function toMessage(row: MessageRow): Message {
  return messageSchema.parse({
    id: row.id,
    roomId: row.room_id,
    username: row.username,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  });
}

/**
 * A retry repeats the id the client already sent. The insert then conflicts and returns
 * nothing, so the stored row is read back and the caller learns it was not a new message.
 * The read is scoped to the room, because an id already spent elsewhere is a collision,
 * not this room's history.
 */
export type MessageInsert =
  | { outcome: "created"; message: Message }
  | { outcome: "already-stored"; message: Message }
  | { outcome: "id-taken" };

export async function insertMessage(
  db: Queryable,
  roomId: string,
  posted: NewMessage,
): Promise<MessageInsert> {
  const { rows } = await db.query<MessageRow>(
    `INSERT INTO messages (id, room_id, username, body)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${messageColumns}`,
    [posted.id, roomId, posted.username, posted.body],
  );

  const [inserted] = rows;
  if (inserted) {
    return { outcome: "created", message: toMessage(inserted) };
  }

  const stored = await findMessage(db, roomId, posted.id);
  return stored ? { outcome: "already-stored", message: stored } : { outcome: "id-taken" };
}

export async function findMessage(
  db: Queryable,
  roomId: string,
  messageId: string,
): Promise<Message | undefined> {
  const { rows } = await db.query<MessageRow>(
    `SELECT ${messageColumns} FROM messages WHERE id = $1 AND room_id = $2`,
    [messageId, roomId],
  );
  const [row] = rows;
  return row && toMessage(row);
}

/**
 * Two different reads. Reconnecting with a cursor asks for the gap, oldest first, so the
 * client catches up in order. Opening a room cold asks for the newest page instead: a busy
 * room has more history than one page holds, and the messages a reader needs are the last
 * ones, not the first ones ever written.
 */
export async function listMessages(
  db: Queryable,
  roomId: string,
  page: MessageHistoryQuery,
): Promise<Message[]> {
  if (page.after !== undefined) {
    const { rows } = await db.query<MessageRow>(
      `SELECT ${messageColumns} FROM messages
       WHERE room_id = $1
         AND seq > (SELECT seq FROM messages WHERE id = $2 AND room_id = $1)
       ORDER BY seq
       LIMIT $3`,
      [roomId, page.after, page.limit],
    );
    return rows.map(toMessage);
  }

  const { rows } = await db.query<MessageRow>(
    `SELECT ${messageColumns} FROM messages WHERE room_id = $1 ORDER BY seq DESC LIMIT $2`,
    [roomId, page.limit],
  );
  return rows.map(toMessage).reverse();
}
