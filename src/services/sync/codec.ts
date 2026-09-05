import { parseSyncPayload, type SyncPayload, SyncPayloadError } from "@/core";

/**
 * How a payload is written to a backend and read back. The default is the
 * JSON an export writes. End-to-end encryption is another codec rather than
 * another backend (docs/sync-design.md, 3.4): the backend never needs to
 * know what it is carrying.
 */
export interface PayloadCodec {
  encode(payload: SyncPayload): Promise<string>;
  decode(text: string): Promise<SyncPayload>;
}

export const jsonCodec: PayloadCodec = {
  async encode(payload) {
    return JSON.stringify(payload);
  },
  async decode(text) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SyncPayloadError("The remote copy is not readable JSON.");
    }
    return parseSyncPayload(parsed);
  },
};
