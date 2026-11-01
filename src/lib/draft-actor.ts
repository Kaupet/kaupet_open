import { ClientError } from "@/lib/to-client-error";

export function assertDraftActor(expectedUserId: string | undefined, userId: string) {
  if (expectedUserId !== undefined && expectedUserId !== userId) {
    throw new ClientError(
      "Kontoen er endret. Logg inn med opprinnelig konto for å fortsette med utkastet.",
      409,
    );
  }
}
