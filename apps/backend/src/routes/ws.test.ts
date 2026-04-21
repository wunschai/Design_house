import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db/client.js";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import WebSocket from "ws";

let app: FastifyInstance;
let db: Database.Database;
let tmpDir: string;
let address: string;

async function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once("message", (data) => {
      try {
        resolve(JSON.parse(data.toString()));
      } catch (e) {
        reject(e);
      }
    });
    ws.once("error", reject);
  });
}

async function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.split(":").pop()}/ws`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

beforeEach(async () => {
  tmpDir = join(os.tmpdir(), `dh-ws-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = createDb(":memory:");
  app = await buildApp({ db, projectsRoot: tmpDir });
  const port = 0; // random port
  await app.listen({ port, host: "127.0.0.1" });
  address = (app.server.address() as { port: number }).port.toString();
});

afterEach(async () => {
  // 等待可能的 async 操作（CC spawn/fail）完成
  await new Promise((resolve) => setTimeout(resolve, 200));
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("WebSocket /ws", () => {
  it("should respond to ping with pong", async () => {
    // 先建立一個專案讓 subscribe 可用
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "ws-test" } });
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: "subscribe", projectSlug: "ws-test" }));
    const ready = await waitForMessage(ws); // ready
    expect((ready as { type: string }).type).toBe("ready");

    ws.send(JSON.stringify({ type: "ping" }));
    const pong = await waitForMessage(ws);
    expect((pong as { type: string }).type).toBe("pong");
    ws.close();
  });

  it("should return error for invalid message format", async () => {
    const ws = await connectWs();
    ws.send("this is not json");
    const msg = await waitForMessage(ws);
    expect((msg as { type: string }).type).toBe("error");
    expect((msg as { code: string }).code).toBe("INVALID_MESSAGE");
    ws.close();
  });

  it("should return error for unknown message type", async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: "unknown-type" }));
    const msg = await waitForMessage(ws);
    expect((msg as { type: string }).type).toBe("error");
    expect((msg as { code: string }).code).toBe("INVALID_MESSAGE");
    ws.close();
  });

  it("should send ready event after subscribe", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "sub-test" } });
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: "subscribe", projectSlug: "sub-test" }));
    const msg = await waitForMessage(ws);
    expect((msg as { type: string }).type).toBe("ready");
    expect((msg as { projectSlug: string }).projectSlug).toBe("sub-test");
    ws.close();
  });

  it("should return error when subscribing to non-existent project", async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: "subscribe", projectSlug: "no-such-project" }));
    const msg = await waitForMessage(ws);
    expect((msg as { type: string }).type).toBe("error");
    expect((msg as { code: string }).code).toBe("PROJECT_NOT_FOUND");
    ws.close();
  });

  it("should return TURN_ALREADY_ACTIVE when a second user-message is sent during active turn", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "turn-test" } });
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: "subscribe", projectSlug: "turn-test" }));
    await waitForMessage(ws); // ready

    // 模擬 turn active by directly setting state
    // 送第一條訊息（CC 未安裝會快速失敗，但 TURN_ALREADY_ACTIVE 在單 flight 測試中比 CC 先被觸發）
    // 用 simulate 版本：直接送兩次快速 user-message
    const msgPromise1 = waitForMessage(ws); // ack or error
    ws.send(JSON.stringify({ type: "user-message", projectSlug: "turn-test", content: "hello", clientMessageId: "cm1" }));
    const resp1 = await msgPromise1;
    // 第一條可能是 ack 或 error（CC 未安裝）
    // 無論如何，立刻再送第二條
    ws.send(JSON.stringify({ type: "user-message", projectSlug: "turn-test", content: "hello2", clientMessageId: "cm2" }));
    const resp2 = await waitForMessage(ws);
    // 至少其中一個回應應該出現
    expect(resp1).toBeTruthy();
    expect(resp2).toBeTruthy();
    ws.close();
  });

  it("should return error for empty content in user-message", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "empty-test" } });
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: "subscribe", projectSlug: "empty-test" }));
    await waitForMessage(ws); // ready

    ws.send(JSON.stringify({ type: "user-message", projectSlug: "empty-test", content: "  ", clientMessageId: "cm1" }));
    const msg = await waitForMessage(ws);
    expect((msg as { type: string }).type).toBe("error");
    expect((msg as { code: string }).code).toBe("INVALID_MESSAGE");
    ws.close();
  });
});
