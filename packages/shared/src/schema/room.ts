import * as z from "zod";

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

/** What a client sends to open a chatroom: the point it clicked, and nothing else. */
export const newRoomSchema = z.strictObject({
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export const roomSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  lat: latitudeSchema,
  lng: longitudeSchema,
  createdAt: z.iso.datetime(),
});

export const roomIdParamSchema = z.object({ id: z.uuid() });

export type NewRoom = z.infer<typeof newRoomSchema>;
export type Room = z.infer<typeof roomSchema>;
