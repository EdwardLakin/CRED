import sharp from "sharp";

import type { WorkspaceBrandProfile } from "@/features/branding/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadConfiguredBrandSignature(
  branding: WorkspaceBrandProfile,
): Promise<Buffer | null> {
  const path = branding.signature_storage_path?.trim();
  if (!path) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("documentation-branding")
    .download(path);
  if (error || !data) {
    console.warn("[executive-pdf-signature-download]", {
      path,
      error: error?.message ?? "Signature asset unavailable",
    });
    return null;
  }

  try {
    const source = Buffer.from(await data.arrayBuffer());
    return await sharp(source, { failOn: "none" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: 700, height: 220, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (error) {
    console.warn("[executive-pdf-signature-normalize]", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
