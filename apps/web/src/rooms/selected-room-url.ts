import * as z from "zod";

const roomId = z.uuid();

/** An id nobody could have minted selects nothing, so a hand-edited link opens the map. */
export function readSelectedRoomId(search: string): string | null {
  const value = new URLSearchParams(search).get("room");
  return value !== null && roomId.safeParse(value).success ? value : null;
}

/** Returns the path to hand `history.pushState`, so the rest of the link survives untouched. */
export function withSelectedRoom(href: string, selected: string | null): string {
  const url = new URL(href);
  if (selected === null) url.searchParams.delete("room");
  else url.searchParams.set("room", selected);
  return `${url.pathname}${url.search}${url.hash}`;
}
