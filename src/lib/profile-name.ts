// kaupet_open: the shared form uses firstName as the single display name.
import { z } from "zod";

export const profileNameSchema = z.object({
  firstName: z.string().trim().min(2, "Minst 2 tegn").max(80, "Maks 80 tegn"),
  lastName: z.string(),
  showLastName: z.boolean(),
});

// Registration keeps Open's optional name; profile edits still require two characters.
export const profileSignupNameSchema = profileNameSchema.extend({
  firstName: z.string().trim().max(50, "Maks 50 tegn"),
});

export type ProfileName = z.infer<typeof profileNameSchema>;

export function publicProfileName(name: ProfileName) {
  return name.firstName.trim();
}

export function profileSignupMetadata(
  name: ProfileName,
  email: string,
): Record<string, string | boolean> {
  return { display_name: publicProfileName(name) || email.split("@")[0] };
}
