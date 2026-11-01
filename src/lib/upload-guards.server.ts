import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ClientError } from "@/lib/to-client-error";
import { describeImageError, validateImages } from "@/lib/storage";

// Felles vakter for standardopplastinger til R2 (annonse, avatar, vedlegg og logo).

export const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function assertServerSideImage(file: File): void {
  const err = validateImages([file]);
  if (err) throw new Error(describeImageError(err));
}

export async function readServerSideImage(file: File): Promise<Uint8Array> {
  // Kun formattsignatur, ingen full dekoding; klienten komprimerer før opplasting.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const matches = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  const valid =
    (file.type === "image/jpeg" && bytes.length >= 3 && matches([0xff, 0xd8, 0xff])) ||
    (file.type === "image/png" &&
      bytes.length >= 8 &&
      matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (file.type === "image/webp" &&
      bytes.length >= 12 &&
      matches([0x52, 0x49, 0x46, 0x46]) &&
      matches([0x57, 0x45, 0x42, 0x50], 8)) ||
    (file.type === "image/jxl" &&
      ((bytes.length >= 2 && matches([0xff, 0x0a])) ||
        (bytes.length >= 12 &&
          matches([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]))));
  if (!valid) throw new ClientError("Bildefilen kunne ikke leses", 400);
  return bytes;
}

export async function reserveUploadQuota(userId: string, bytes: number): Promise<void> {
  const { data: reserved, error } = await supabaseAdmin.rpc("reserve_standard_upload_quota", {
    _user_id: userId,
    _bytes: bytes,
  });
  if (error) throw new Error("Kunne ikke reservere opplastingskvote");
  if (!reserved) {
    throw new ClientError("Du har nådd grensen for opplastinger de siste 24 timene", 429);
  }
}

export async function registerUpload(bucket: "BILDER" | "VEDLEGG", key: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("register_standard_upload_object", {
    _bucket: bucket,
    _key: key,
  });
  if (error) throw new Error("Kunne ikke registrere R2-opplasting");
}
