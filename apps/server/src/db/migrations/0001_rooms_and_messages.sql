CREATE TABLE rooms (
  -- The client generates this id and repeats it if it retries the same click, so a lost
  -- response cannot leave two pins on the map for one gesture.
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
  -- The order the server accepted the rows in, and the only ordering key the reads use.
  -- A timestamp cannot do this job: messages posted inside one clock tick share it, and
  -- the tie would then fall to a random client-generated id, which shuffles the history
  -- and hides a message from the `after` cursor for good.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  username varchar(32) NOT NULL CHECK (btrim(username) <> ''),
  body varchar(500) NOT NULL CHECK (btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- History is read one room at a time in acceptance order, which is also the order the
-- backfill cursor walks and the order the newest page is taken from.
CREATE INDEX messages_room_seq ON messages (room_id, seq);
