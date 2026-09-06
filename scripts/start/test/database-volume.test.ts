import { describe, expect, it } from "vitest";
import { blocksOnStaleVolume, renderStaleVolumeNotice, type VolumeCheck } from "../database-volume.ts";

const check = (overrides: Partial<VolumeCheck> = {}): VolumeCheck => ({
  mode: "docker",
  mintedNewPassword: true,
  volume: "wolfchatter_db-data",
  ...overrides,
});

describe("blocksOnStaleVolume", () => {
  it("stops a fresh password meeting a volume that answers to the old one", () => {
    expect(blocksOnStaleVolume(check())).toBe(true);
  });

  it("stops the same way when only the database is in Docker", () => {
    expect(blocksOnStaleVolume(check({ mode: "docker-database" }))).toBe(true);
  });

  it("lets the embedded database through, which has no volume and no password", () => {
    expect(blocksOnStaleVolume(check({ mode: "embedded" }))).toBe(false);
  });

  it("lets a carried-over password through, because the volume already answers to it", () => {
    expect(blocksOnStaleVolume(check({ mintedNewPassword: false }))).toBe(false);
  });

  it("lets a first run through, where there is no volume to disagree with", () => {
    expect(blocksOnStaleVolume(check({ volume: undefined }))).toBe(false);
  });
});

describe("renderStaleVolumeNotice", () => {
  it("names the volume in the command, which is the whole reason to stop", () => {
    expect(renderStaleVolumeNotice("wolfchatter_db-data")).toContain("docker volume rm wolfchatter_db-data");
  });

  it("does not send anyone to a compose command, which needs a .env that is not there yet", () => {
    expect(renderStaleVolumeNotice("wolfchatter_db-data")).not.toContain("docker compose");
  });

  it("says what that command destroys, so it is not run blind", () => {
    expect(renderStaleVolumeNotice("wolfchatter_db-data")).toContain("rooms");
  });

  it("offers the way to keep the data instead", () => {
    expect(renderStaleVolumeNotice("wolfchatter_db-data")).toContain("POSTGRES_PASSWORD");
  });

  it("describes a password this run would make, not one it claims to have written", () => {
    expect(renderStaleVolumeNotice("wolfchatter_db-data")).not.toContain("just written");
  });
});
