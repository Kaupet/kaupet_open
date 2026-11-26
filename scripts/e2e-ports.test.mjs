import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { isPortFree, pickFreePortOffset, startOnFreePorts } from "./e2e-ports.mjs";

const listen = (host) =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, host, () => resolve(server));
  });
const close = (server) => new Promise((resolve) => server.close(resolve));

for (const host of ["0.0.0.0", "127.0.0.1"]) {
  test(`isPortFree ser en port som er bundet på ${host}`, async () => {
    const server = await listen(host);
    const { port } = server.address();
    assert.equal(await isPortFree(port), false);
    await close(server);
    assert.equal(await isPortFree(port), true);
  });
}

test("pickFreePortOffset hopper over forskyvninger der én port er opptatt", async () => {
  const randoms = [0, 0.5];
  const offset = await pickFreePortOffset({
    random: () => randoms.shift(),
    // Studio i forskyvning 1000; resten er ledig.
    isFree: async (port) => port !== 54323 + 1000,
  });
  assert.equal(offset, 4500);
});

test("pickFreePortOffset gir opp når alt er opptatt", async () => {
  await assert.rejects(pickFreePortOffset({ isFree: async () => false }), /ingen ledige porter/);
});

test("startOnFreePorts rydder og bruker nye porter etter en portkonflikt", async () => {
  const offsets = [1111, 2222];
  const events = [];
  const offset = await startOnFreePorts({
    pickOffset: async () => offsets.shift(),
    start: (candidate) => {
      events.push(`start ${candidate}`);
      return candidate === 2222;
    },
    cleanup: () => events.push("cleanup"),
  });
  assert.equal(offset, 2222);
  assert.deepEqual(events, ["start 1111", "cleanup", "start 2222"]);
});

test("startOnFreePorts gir null etter siste forsøk", async () => {
  let cleanups = 0;
  const offset = await startOnFreePorts({
    pickOffset: async () => 1000,
    start: () => false,
    cleanup: () => cleanups++,
  });
  assert.equal(offset, null);
  assert.equal(cleanups, 3);
});
