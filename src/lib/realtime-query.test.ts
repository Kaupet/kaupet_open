import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { applyRealtimeQueryUpdate } from "./realtime-query";

describe("sanntidsoppdateringer under henting", () => {
  it("beholder den nye verdien når et eldre hentesvar kommer sist (rekkefølge)", async () => {
    const client = new QueryClient();
    const key = ["message-reactions", "conversation"];
    client.setQueryData(key, ["👍"]);
    let finish!: (value: string[]) => void;
    const fetching = client
      .fetchQuery({
        queryKey: key,
        queryFn: () =>
          new Promise<string[]>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);

    await applyRealtimeQueryUpdate(
      client,
      key,
      () => ["❤️"],
      () => true,
    );
    finish(["👍"]);
    await fetching;
    expect(client.getQueryData(key)).toEqual(["❤️"]);
    client.clear();
  });

  it("henter hele datasettet på nytt når hendelsen kommer under første henting", async () => {
    const client = new QueryClient();
    const key = ["offers", "conversation"];
    let finish!: (value: string[]) => void;
    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: () =>
        ++calls === 1
          ? new Promise<string[]>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(["eldre bud", "godtatt bud"]),
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await applyRealtimeQueryUpdate(
        client,
        key,
        () => ["godtatt bud"],
        () => true,
      );
      finish([]);
      await Promise.resolve();
      expect(observer.getCurrentResult().data).toEqual(["eldre bud", "godtatt bud"]);
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  it("ignorerer hendelser fra en forlatt samtale", async () => {
    const client = new QueryClient();
    const key = ["message-reactions", "old-conversation"];
    client.setQueryData(key, ["👍"]);
    await applyRealtimeQueryUpdate(
      client,
      key,
      () => ["❤️"],
      () => false,
    );
    expect(client.getQueryData(key)).toEqual(["👍"]);
    client.clear();
  });
});
