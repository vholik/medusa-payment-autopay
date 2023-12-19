import * as crypto from "crypto";

export function hashStringWithSHA256(input: string): string {
  const sha256Hash = crypto.createHash("sha256");
  sha256Hash.update(input, "utf8");
  return sha256Hash.digest("hex");
}

export function generateUniqueID(): string {
  return crypto
    .randomBytes(Math.ceil(32 / 2))
    .toString("hex")
    .slice(0, 32);
}
