// @vitest-environment jsdom
import { forwardRef, useImperativeHandle, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { EDITION } from "@/lib/edition";

const mocks = vi.hoisted(() => ({
  search: { mode: "reset" as string, returnTo: undefined, konto: undefined as string | undefined },
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
  signUp: vi.fn(),
  getResponsePromise: vi.fn(),
  reset: vi.fn(),
  site: { LEGAL_PAGES: true, AUTH_EMAIL: true },
}));
vi.mock("@/lib/site", () => ({
  SITE_NAME: "Testsiden.no",
  SITE_SHORT_NAME: "Testsiden",
  get LEGAL_PAGES() {
    return mocks.site.LEGAL_PAGES;
  },
  get AUTH_EMAIL() {
    return mocks.site.AUTH_EMAIL;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => mocks.search }),
  useNavigate: () => vi.fn(),
  Link: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      resend: mocks.resend,
      signUp: mocks.signUp,
      getUser: async () => ({ data: { user: null } }),
    },
  },
}));
vi.mock("@/components/turnstile", () => ({
  isTurnstileEnabled: () => !!import.meta.env.VITE_TURNSTILE_SITE_KEY,
  Turnstile: forwardRef(function Turnstile(_props, ref) {
    useImperativeHandle(ref, () => ({
      getResponsePromise: mocks.getResponsePromise,
      reset: mocks.reset,
    }));
    return null;
  }),
}));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));

import { Route } from "./auth";
const AuthPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
  mocks.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  mocks.resend.mockReset().mockResolvedValue({ error: null });
  mocks.getResponsePromise.mockReset().mockResolvedValue("captcha-1");
  mocks.reset.mockReset();
  mocks.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  mocks.site = { LEGAL_PAGES: true, AUTH_EMAIL: true };
});

it("sender CAPTCHA-token med passordreset og henter nytt token etterpå", async () => {
  mocks.search.mode = "reset";
  render(<AuthPage />);
  fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "kari@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send lenke" }));

  await waitFor(() => expect(mocks.resetPasswordForEmail).toHaveBeenCalled());
  expect(mocks.resetPasswordForEmail.mock.calls[0][1]).toMatchObject({
    captchaToken: "captcha-1",
  });
  await waitFor(() => expect(mocks.reset).toHaveBeenCalled());
});

it("sender CAPTCHA-token når bekreftelses-e-post sendes på nytt", async () => {
  mocks.search.mode = "signin";
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: "Send bekreftelse på nytt" }));
  fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "kari@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send bekreftelses-e-post på nytt" }));

  await waitFor(() => expect(mocks.resend).toHaveBeenCalled());
  expect(mocks.resend.mock.calls[0][0].options).toMatchObject({ captchaToken: "captcha-1" });
});

it.skipIf(EDITION === "open")(
  "åpner bedriftsfanen når /for-bedrifter lenker med ?konto=bedrift",
  () => {
    mocks.search.mode = "signup";
    mocks.search.konto = "bedrift";
    render(<AuthPage />);
    expect(screen.getByRole("tab", { name: "Bedrift" }).getAttribute("aria-selected")).toBe("true");
    mocks.search.konto = undefined;
  },
);

it("ignorerer ukjente verdier for konto i stedet for å feile", () => {
  const { validateSearch } = (
    Route as unknown as { options: { validateSearch: { parse: (v: unknown) => unknown } } }
  ).options;
  expect(validateSearch.parse({ mode: "signup", konto: "tull" })).toMatchObject({
    mode: "signup",
    konto: undefined,
  });
});

it("bruker nettstedets navn, ikke et fast navn, i innloggingen", () => {
  mocks.search.mode = "signin";
  render(<AuthPage />);
  expect(screen.getByText("Velkommen tilbake til Testsiden.")).toBeTruthy();
  expect(screen.getByText(/Ny på Testsiden\?/)).toBeTruthy();
});

// kaupet_open uten vilkårssider eller e-post fra oppstartsveiviseren.
it("skjuler vilkårsavkrysning og e-postlenker når de er slått av", () => {
  mocks.site = { LEGAL_PAGES: false, AUTH_EMAIL: false };
  mocks.search.mode = "signup";
  const { rerender } = render(<AuthPage />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Opprett konto" }) as HTMLButtonElement).disabled,
  ).toBe(false);

  mocks.search.mode = "signin";
  rerender(<AuthPage />);
  expect(screen.queryByRole("button", { name: "Glemt passord?" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Send bekreftelse på nytt" })).toBeNull();
});

it.each(EDITION === "open" ? [false] : [false, true])(
  "registrerer navn med utgavens metadata og skjult etternavn: %s",
  async (withLastName) => {
    mocks.search.mode = "signup";
    mocks.search.konto = undefined;
    mocks.site.LEGAL_PAGES = false;
    const user = userEvent.setup();
    render(<AuthPage />);
    await user.type(screen.getByLabelText(EDITION === "open" ? "Visningsnavn" : "Fornavn"), "Kari");
    if (withLastName) {
      await user.type(screen.getByLabelText("Etternavn (valgfritt)"), "Nordmann");
      expect(
        screen
          .getByRole("checkbox", { name: "Vis etternavnet mitt til andre brukere" })
          .getAttribute("aria-checked"),
      ).toBe("false");
    }
    await user.type(screen.getByLabelText("E-post"), "kari@example.com");
    await user.type(screen.getByLabelText("Passord", { exact: true }), "password12345");
    await user.click(screen.getByRole("button", { name: "Opprett konto" }));
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
    expect(mocks.signUp.mock.calls[0][0].options.data).toEqual(
      EDITION === "open"
        ? { display_name: "Kari" }
        : {
            display_name: "Kari",
            first_name: "Kari",
            last_name: withLastName ? "Nordmann" : "",
            show_last_name: false,
          },
    );
  },
);
