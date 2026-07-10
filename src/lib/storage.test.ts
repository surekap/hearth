import { describe, expect, it } from "vitest";
import { deleteObject, getObject, putObject } from "./storage";

describe("local storage key isolation", () => {
  it("rejects local keys that escape the storage root", async () => {
    await expect(getObject("../outside.enc")).rejects.toThrow("Invalid storage key");
    await expect(deleteObject("../outside.enc")).rejects.toThrow("Invalid storage key");
    await expect(putObject("../outside.enc", Buffer.from("x"))).rejects.toThrow(
      "Invalid storage key"
    );
  });
});
