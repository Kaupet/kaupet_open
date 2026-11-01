# Bidra til kaupet_open

Takk for at du vil bidra!

1. Åpne en [issue](https://github.com/Kaupet/kaupet_open/issues) før større
   endringer, så vi kan bli enige om retningen.
2. Lag en gren fra `main`, og hold endringen liten og avgrenset.
3. Kjør kontrollene lokalt før du pusher:
   ```bash
   bun run format:check
   bun run lint
   bunx tsc --noEmit
   bun run test
   bun run build
   ```
   Endrer du databasen eller RLS, kjør også `bun run test:rls` mot en lokal
   Supabase-stack (`supabase start`).
4. Åpne en pull request mot `main` og beskriv hva du endret og hvorfor.

## Bidragsavtale (CLA)

Alle bidragsytere må signere [bidragsavtalen](CLA.md) før en pull request
kan slås sammen. Første gang du åpner en pull request, ber en bot deg
signere. Signer ved å skrive denne kommentaren i PR-en, nøyaktig slik:

```text
I have read the CLA Document and I hereby sign the CLA
```

Kommenter `recheck` for å sjekke på nytt.

Avtalen gir Happy Pixel AS rett til å bruke bidraget ditt, også under andre
lisensvilkår enn AGPL-3.0 og i andre produkter og tjenester Happy Pixel AS
utvikler. kaupet_open selv er fortsatt AGPL-3.0.

Alle som står som forfatter eller medforfatter (`Co-Authored-By`) på en
commit, må ha signert. Fjern `Co-Authored-By`-linjer som verktøy (f.eks.
KI-assistenter) legger til, ellers kan ikke PR-en slås sammen.

Sårbarheter meldes privat, se [SECURITY.md](SECURITY.md).
