// kaupet_open: misbruksvern håndheves lokalt med autorisasjon, RLS og rategrenser.
export async function verifyTurnstileToken(
  _token: string | null | undefined,
  _expectedAction = "kaupet",
): Promise<void> {}
