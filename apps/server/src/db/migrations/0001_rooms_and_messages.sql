CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  -- The identity column is what makes the sequential name race-free: no client and no
  -- concurrent request ever counts the existing rooms to work out the next number.
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name text GENERATED ALWAYS AS ('Chatroom ' || number) STORED NOT NULL,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  -- The client generates this id and repeats it on a retry, so the second insert conflicts
  -- and is dropped instead of duplicating the message.
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  username varchar(32) NOT NULL CHECK (btrim(username) <> ''),
  body varchar(500) NOT NULL CHECK (btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- History is read one room at a time in server-time order, with the id breaking ties,
-- which is also the order the backfill cursor walks.
CREATE INDEX messages_room_created_id ON messages (room_id, created_at, id);
