// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePhotoSuggestion } from "./use-photo-suggestion";

const { suggestListingFromPhotos } = vi.hoisted(() => ({ suggestListingFromPhotos: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { enabled: true } }) }));
vi.mock("@/lib/category-suggestion.functions", () => ({
  getPhotoSuggestionAvailability: vi.fn(),
  suggestListingFromPhotos,
}));
vi.mock("@/lib/photo-suggestion-images", () => ({
  preparePhotoSuggestionImages: () => Promise.resolve(["prepared"]),
}));

vi.mock("@/components/turnstile", () => ({
  isTurnstileEnabled: () => !!import.meta.env.VITE_TURNSTILE_SITE_KEY,
}));

const image = {
  id: "photo-1",
  file: new File(["x"], "photo.jpg", { type: "image/jpeg" }),
  thumbFile: new File(["x"], "thumb.jpg", { type: "image/jpeg" }),
  previewUrl: "blob:photo",
};

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
  suggestListingFromPhotos.mockResolvedValue({ status: "unavailable" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("usePhotoSuggestion", () => {
  it("blokkerer dobbelttrykk og åpner for nye kall når tittel eller bilder endres", async () => {
    let resolveResult!: (value: unknown) => void;
    const success = {
      status: "pending",
      categories: [{ category_id: "c1", parent_id: null, name_nb: "Stol", parent_name_nb: null }],
      title: "Stol",
    };
    suggestListingFromPhotos
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveResult = resolve;
          }),
      )
      .mockResolvedValue(success);
    const secondImage = { ...image, id: "photo-2" };
    const { result, rerender } = renderHook(
      ({ images, title }) => usePhotoSuggestion({ images, title }),
      { initialProps: { images: [image, secondImage], title: "" } },
    );
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve("token"),
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.analyzePhotos();
      void result.current.analyzePhotos();
    });
    expect(result.current.analysisDisabled).toBe(true);
    await waitFor(() => expect(suggestListingFromPhotos).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveResult(success);
      await pending;
    });
    expect(result.current.analysisDisabled).toBe(true);
    act(() => result.current.applyTitleSuggestion("Stol"));
    rerender({ images: [image, secondImage], title: "Stol" });
    expect(result.current.analysisDisabled).toBe(true);
    rerender({ images: [image, secondImage], title: "Redigert stol" });
    expect(result.current.analysisDisabled).toBe(false);
    await act(async () => result.current.analyzePhotos());
    expect(suggestListingFromPhotos).toHaveBeenCalledTimes(2);
    expect(suggestListingFromPhotos).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ title: "Redigert stol" }),
    });
    expect(result.current.analysisDisabled).toBe(true);

    rerender({ images: [secondImage, image], title: "Redigert stol" });
    expect(result.current.analysisDisabled).toBe(false);
    expect(result.current.categorySuggestions).toEqual([]);
    expect(result.current.canRequestAttributes).toBe(false);
    await act(async () => result.current.analyzePhotos());
    expect(suggestListingFromPhotos).toHaveBeenCalledTimes(3);
    expect(result.current.analysisDisabled).toBe(true);
    rerender({ images: [secondImage, image, { ...image, id: "photo-3" }], title: "Redigert stol" });
    expect(result.current.analysisDisabled).toBe(false);
  });

  it("forkaster gamle bildesvar og slipper ikke gjennom parallelle kall ved bildebytte", async () => {
    let resolveResult!: (value: unknown) => void;
    suggestListingFromPhotos.mockReturnValue(
      new Promise((resolve) => {
        resolveResult = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ images }) => usePhotoSuggestion({ images, title: "" }),
      { initialProps: { images: [image] } },
    );
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve("token"),
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.analyzePhotos();
    });
    await waitFor(() => expect(suggestListingFromPhotos).toHaveBeenCalledTimes(1));
    rerender({ images: [{ ...image, id: "new-photo" }] });
    expect(result.current.analysisDisabled).toBe(true);
    await act(async () => result.current.analyzePhotos());
    expect(suggestListingFromPhotos).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveResult({
        status: "pending",
        categories: [{ category_id: "c1" }],
        title: "Gammel tittel",
      });
      await pending;
    });
    expect(result.current.titleSuggestion).toBeNull();
    expect(result.current.categorySuggestions).toEqual([]);
    expect(result.current.analysisDisabled).toBe(false);
  });

  it("åpner for nytt forsøk etter feil og blokkerer uten bilder", async () => {
    const { result, rerender } = renderHook(
      ({ images }) => usePhotoSuggestion({ images, title: "" }),
      { initialProps: { images: [image] } },
    );
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve("token"),
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;
    suggestListingFromPhotos.mockRejectedValueOnce(new Error("Nettverksfeil"));
    await act(async () => result.current.analyzePhotos());
    expect(result.current.analysisDisabled).toBe(false);
    await act(async () => result.current.analyzePhotos());
    expect(suggestListingFromPhotos).toHaveBeenCalledTimes(2);
    rerender({ images: [] });
    expect(result.current.analysisDisabled).toBe(true);
    await act(async () => result.current.analyzePhotos());
    expect(suggestListingFromPhotos).toHaveBeenCalledTimes(2);
  });

  it("venter på avkrysning før bildeforespørselen sendes", async () => {
    let resolveToken!: (token: string) => void;
    const token = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    result.current.turnstileRef.current = {
      getResponsePromise: () => token,
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => {
      void result.current.analyzePhotos();
      result.current.onBeforeInteractive();
    });
    expect(suggestListingFromPhotos).not.toHaveBeenCalled();
    expect(result.current.verificationNeeded).toBe(true);
    expect(result.current.status).toBe("verifying");

    await act(async () => resolveToken("verified-token"));
    await waitFor(() =>
      expect(suggestListingFromPhotos).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ turnstileToken: "verified-token" }),
        }),
      ),
    );
  });

  it("viser verifiseringsfeil når Cloudflare ikke gir token", async () => {
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.reject(new Error("Timeout")),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => result.current.analyzePhotos());
    expect(result.current.status).toBe("verification-required");
    expect(result.current.verificationNeeded).toBe(true);
    expect(suggestListingFromPhotos).not.toHaveBeenCalled();

    act(() => result.current.onSuccess());
    expect(result.current.status).toBe("idle");
    expect(result.current.verificationNeeded).toBe(false);
  });

  it("deler ut ett token om gangen, så samtidige kall aldri får samme token", async () => {
    let issued = 0;
    const reset = vi.fn();
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    // Widgeten gir samme token til den nullstilles, som ekte Turnstile.
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve(`token-${issued}`),
      reset: () => {
        reset();
        issued += 1;
      },
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    const tokens = await act(() =>
      Promise.all([result.current.takeVerifiedToken(), result.current.takeVerifiedToken()]),
    );
    expect(tokens).toEqual(["token-0", "token-1"]);
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it("lar et token som kommer etter tidsavbruddet ligge til neste kall", async () => {
    vi.useFakeTimers();
    let resolveToken!: (token: string) => void;
    const firstToken = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const reset = vi.fn();
    const getResponsePromise = vi.fn().mockReturnValueOnce(firstToken).mockResolvedValue("token-0");
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    result.current.turnstileRef.current = {
      getResponsePromise,
      reset,
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    const timedOut = result.current.takeVerifiedToken(8_000);
    await act(async () => vi.advanceTimersByTime(8_000));
    expect(await timedOut).toBeNull();

    await act(async () => resolveToken("token-0"));
    expect(reset).not.toHaveBeenCalled();
    vi.useRealTimers();

    await act(async () => {
      expect(await result.current.takeVerifiedToken()).toBe("token-0");
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("nullstiller ikke widgeten når avkrysning gjenstår", async () => {
    const reset = vi.fn();
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.reject(new Error("Timeout")),
      reset,
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => {
      expect(await result.current.takeVerifiedToken()).toBeNull();
    });
    expect(reset).not.toHaveBeenCalled();
  });

  it("beholder kategori og detaljhjelp ved tittelredigering og åpner for ny analyse", async () => {
    suggestListingFromPhotos.mockResolvedValue({
      status: "pending",
      source: "photo-ai",
      categories: [
        { category_id: "c1", parent_id: "p1", name_nb: "Bil", parent_name_nb: "Kjøretøy" },
      ],
      title: "Toyota GT86",
    });
    const { result, rerender } = renderHook(
      ({ title }) => usePhotoSuggestion({ images: [image], title }),
      { initialProps: { title: "" } },
    );
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve("token"),
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => result.current.analyzePhotos());
    expect(result.current.categorySuggestions).toHaveLength(1);
    expect(result.current.titleSuggestion).toBe("Toyota GT86");
    expect(result.current.status).toBe("ok");
    expect(result.current.canRequestAttributes).toBe(true);

    // PhotosGroup fyller tittelen automatisk og melder det via
    // applyTitleSuggestion: tittelendringen er systemets egen utfylling og
    // skal ikke nullstille kategoriforslaget eller samtykket.
    act(() => result.current.applyTitleSuggestion("Toyota GT86"));
    rerender({ title: "Toyota GT86" });
    expect(result.current.categorySuggestions).toHaveLength(1);
    expect(result.current.titleSuggestion).toBeNull();
    expect(result.current.status).toBe("ok");
    expect(result.current.canRequestAttributes).toBe(true);
    expect(result.current.analysisDisabled).toBe(true);

    // Tilstandsovergang: manuell redigering beholder bildeforslagene.
    rerender({ title: "Toyota GT86 2016" });
    expect(result.current.categorySuggestions).toHaveLength(1);
    expect(result.current.titleSuggestion).toBeNull();
    expect(result.current.status).toBe("ok");
    expect(result.current.canRequestAttributes).toBe(true);
    expect(result.current.analysisDisabled).toBe(false);

    const attributes = [{ key: "color", value: "red" }];
    suggestListingFromPhotos.mockResolvedValueOnce({ status: "pending", attributes });
    await act(async () => {
      expect(await result.current.requestAttributeSuggestions("biler")).toEqual(attributes);
    });
    rerender({ title: "Toyota GT86 2016 manuell" });
    expect(result.current.categorySuggestions).toHaveLength(1);
    expect(result.current.canRequestAttributes).toBe(true);
    expect(result.current.analysisDisabled).toBe(false);
  });

  it("ignorerer et sent svar etter at tittelen er endret", async () => {
    let resolveResult!: (value: unknown) => void;
    suggestListingFromPhotos.mockReturnValue(
      new Promise((resolve) => {
        resolveResult = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ title }) => usePhotoSuggestion({ images: [image], title }),
      { initialProps: { title: "Stol" } },
    );
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve("token"),
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.analyzePhotos();
    });
    await waitFor(() => expect(suggestListingFromPhotos).toHaveBeenCalled());
    rerender({ title: "Sykkel" });
    expect(result.current.analysisDisabled).toBe(true);
    await act(async () => result.current.analyzePhotos());
    expect(suggestListingFromPhotos).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveResult({
        status: "pending",
        source: "photo-ai",
        categories: [{ category_id: "c1", parent_id: null, name_nb: "Stol", parent_name_nb: null }],
        title: "Stol",
      });
      await pending;
    });
    expect(result.current.categorySuggestions).toHaveLength(0);
    expect(result.current.titleSuggestion).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(result.current.analysisDisabled).toBe(false);
  });

  it("returnerer ingen attributter fra et svar for gamle bilder", async () => {
    suggestListingFromPhotos.mockResolvedValueOnce({
      status: "pending",
      source: "photo-ai",
      categories: [{ category_id: "c1", parent_id: null, name_nb: "Stol", parent_name_nb: null }],
    });
    const { result, rerender } = renderHook(
      ({ images }) => usePhotoSuggestion({ images, title: "Stol" }),
      { initialProps: { images: [image] } },
    );
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve("token"),
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;
    await act(async () => result.current.analyzePhotos());

    let resolveResult!: (value: unknown) => void;
    suggestListingFromPhotos.mockReturnValue(
      new Promise((resolve) => {
        resolveResult = resolve;
      }),
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.requestAttributeSuggestions("stoler");
    });
    await waitFor(() => expect(suggestListingFromPhotos).toHaveBeenCalledTimes(2));
    rerender({ images: [{ ...image, id: "photo-2" }] });
    let attributes: unknown;
    await act(async () => {
      resolveResult({ status: "pending", attributes: [{ key: "color", value: "red" }] });
      attributes = await pending;
    });
    expect(attributes).toEqual([]);
  });
});
