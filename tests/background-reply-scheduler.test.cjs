const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const replyCore = require("../x-native-scheduler-test-plugin/reply-core.js");
const timezoneCore = require("../x-native-scheduler-test-plugin/timezone-core.js");

test("persists a reply without sending, then sends it when its alarm becomes due", async () => {
  const harness = createBackgroundHarness(1_000_000);
  const scheduledAt = harness.now() + 60_000;

  const start = await harness.sendRuntimeMessage({
    type: "xns-start-reply-queue",
    tabId: 7,
    delayMs: 600,
    items: [{
      id: "reply-001",
      text: "scheduled reply",
      targetUrl: "https://x.com/example/status/123",
      targetStatusId: "123",
      targetTimezone: "Asia/Shanghai",
      dateMs: scheduledAt
    }]
  });

  assert.equal(start.ok, true);
  assert.equal(harness.sentReplyMessages.length, 0);
  assert.equal(harness.alarms.get("xns.reply.next"), scheduledAt);
  assert.equal(harness.storage["xns.replyRunState"].items[0].status, "pending");

  harness.setNow(scheduledAt);
  harness.fireAlarm("xns.reply.next");
  await eventually(() => assert.equal(harness.tab.url, "https://x.com/example/status/123"));
  assert.equal(harness.sentReplyMessages.length, 0);

  harness.completeTabLoad();
  await eventually(() => assert.equal(harness.storage["xns.replyRunState"].status, "done"));
  assert.equal(harness.sentReplyMessages.length, 1);
  assert.equal(harness.sentReplyMessages[0].type, "xns-send-reply-now");
  assert.equal(harness.storage["xns.replyRunState"].items[0].status, "sent");
});

test("stopping a scheduled reply clears the alarm and preserves the pending item", async () => {
  const harness = createBackgroundHarness(2_000_000);
  const scheduledAt = harness.now() + 60_000;
  await harness.sendRuntimeMessage({
    type: "xns-start-reply-queue",
    tabId: 7,
    items: [{
      id: "reply-001",
      text: "do not send",
      targetUrl: "https://x.com/example/status/123",
      targetStatusId: "123",
      dateMs: scheduledAt
    }]
  });

  const stopped = await harness.sendRuntimeMessage({ type: "xns-stop-reply-queue" });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.state.status, "stopped");
  assert.equal(stopped.state.items[0].status, "pending");
  assert.equal(harness.alarms.has("xns.reply.next"), false);
  assert.equal(harness.sentReplyMessages.length, 0);
});

test("browser startup restores a missing alarm for a pending reply", async () => {
  const harness = createBackgroundHarness(3_000_000);
  const scheduledAt = harness.now() + 60_000;
  await harness.sendRuntimeMessage({
    type: "xns-start-reply-queue",
    tabId: 7,
    items: [{
      id: "reply-001",
      text: "restore me",
      targetUrl: "https://x.com/example/status/123",
      targetStatusId: "123",
      dateMs: scheduledAt
    }]
  });
  harness.alarms.clear();
  harness.fireStartup();
  await eventually(() => assert.equal(harness.alarms.get("xns.reply.next"), scheduledAt));
  assert.equal(harness.sentReplyMessages.length, 0);
});

test("browser startup does not blindly resend an interrupted processing item", async () => {
  const harness = createBackgroundHarness(4_000_000);
  await harness.sendRuntimeMessage({
    type: "xns-start-reply-queue",
    tabId: 7,
    items: [{
      id: "reply-001",
      text: "check before retry",
      targetUrl: "https://x.com/example/status/123",
      targetStatusId: "123",
      dateMs: harness.now() + 60_000
    }]
  });
  harness.storage["xns.replyRunState"].items[0].status = "processing";
  harness.fireStartup();
  await eventually(() => assert.equal(harness.storage["xns.replyRunState"].status, "failed"));
  assert.match(harness.storage["xns.replyRunState"].items[0].error, /结果未知/);
  assert.equal(harness.sentReplyMessages.length, 0);
});

test("a redirect away from the target post fails instead of leaving the queue stuck", async () => {
  const harness = createBackgroundHarness(5_000_000);
  const scheduledAt = harness.now() + 60_000;
  await harness.sendRuntimeMessage({
    type: "xns-start-reply-queue",
    tabId: 7,
    items: [{
      id: "reply-001",
      text: "redirect test",
      targetUrl: "https://x.com/example/status/123",
      targetStatusId: "123",
      dateMs: scheduledAt
    }]
  });
  harness.setNow(scheduledAt);
  harness.fireAlarm("xns.reply.next");
  await eventually(() => assert.equal(harness.tab.url, "https://x.com/example/status/123"));
  harness.completeTabLoad("https://x.com/i/flow/login");
  await eventually(() => assert.equal(harness.storage["xns.replyRunState"].status, "failed"));
  assert.match(harness.storage["xns.replyRunState"].items[0].error, /重定向/);
  assert.equal(harness.sentReplyMessages.length, 0);
});

function createBackgroundHarness(initialNow) {
  let fakeNow = initialNow;
  const storage = {};
  const alarms = new Map();
  const sentReplyMessages = [];
  const tab = {
    id: 7,
    windowId: 1,
    active: true,
    status: "complete",
    url: "https://x.com/home"
  };

  const events = {
    runtimeMessage: createEvent(),
    runtimeStartup: createEvent(),
    runtimeInstalled: createEvent(),
    actionClicked: createEvent(),
    windowRemoved: createEvent(),
    tabUpdated: createEvent(),
    tabRemoved: createEvent(),
    alarm: createEvent()
  };

  class FakeDate extends Date {
    static now() {
      return fakeNow;
    }
  }

  const chrome = {
    runtime: {
      onMessage: events.runtimeMessage,
      onStartup: events.runtimeStartup,
      onInstalled: events.runtimeInstalled,
      getURL: (value) => `chrome-extension://test/${value}`
    },
    action: { onClicked: events.actionClicked },
    windows: {
      onRemoved: events.windowRemoved,
      update: async () => ({}),
      create: async () => ({ id: 2 })
    },
    tabs: {
      onUpdated: events.tabUpdated,
      onRemoved: events.tabRemoved,
      get: async (tabId) => {
        if (tabId !== tab.id) throw new Error("tab not found");
        return { ...tab };
      },
      query: async () => [{ ...tab }],
      create: async ({ url, active }) => {
        Object.assign(tab, { url, active, status: "loading" });
        return { ...tab };
      },
      update: async (tabId, changes) => {
        if (tabId !== tab.id) throw new Error("tab not found");
        Object.assign(tab, changes, { status: "loading" });
        return { ...tab };
      },
      sendMessage: async (_tabId, message) => {
        if (message.type === "xns-get-status") return { ok: true };
        if (message.type === "xns-send-reply-now") {
          sentReplyMessages.push(message);
          return { ok: true, status: "sent" };
        }
        if (message.type === "xns-stop-reply-item") return { ok: true };
        throw new Error(`unexpected tab message: ${message.type}`);
      }
    },
    alarms: {
      onAlarm: events.alarm,
      clear: async (name) => alarms.delete(name),
      create: async (name, options) => {
        alarms.set(name, options.when);
      }
    },
    storage: {
      local: {
        get: async (key) => {
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((item) => [item, storage[item]]));
          }
          return { [key]: storage[key] };
        },
        set: async (values) => {
          Object.assign(storage, values);
        }
      }
    },
    scripting: {
      executeScript: async () => []
    },
    debugger: {
      attach: async () => {},
      sendCommand: async () => {},
      detach: async () => {}
    }
  };

  const sandbox = {
    chrome,
    URL,
    Date: FakeDate,
    console,
    setTimeout,
    clearTimeout,
    importScripts: (...files) => {
      assert.deepEqual(files, ["timezone-core.js", "reply-core.js"]);
      sandbox.XnsTimezone = timezoneCore;
      sandbox.XnsReply = replyCore;
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const backgroundPath = path.join(__dirname, "../x-native-scheduler-test-plugin/background.js");
  vm.runInContext(fs.readFileSync(backgroundPath, "utf8"), sandbox, { filename: backgroundPath });

  return {
    alarms,
    sentReplyMessages,
    storage,
    tab,
    now: () => fakeNow,
    setNow: (value) => {
      fakeNow = value;
    },
    fireAlarm: (name) => {
      events.alarm.emit({ name });
    },
    fireStartup: () => {
      events.runtimeStartup.emit();
    },
    completeTabLoad: (url = tab.url) => {
      tab.url = url;
      tab.status = "complete";
      events.tabUpdated.emit(tab.id, { status: "complete" }, { ...tab });
    },
    sendRuntimeMessage: (message) => new Promise((resolve, reject) => {
      const listener = events.runtimeMessage.listeners[0];
      const timeout = setTimeout(() => reject(new Error(`message timeout: ${message.type}`)), 1000);
      listener(message, {}, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    })
  };
}

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      for (const listener of listeners) listener(...args);
    }
  };
}

async function eventually(assertion, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError || new Error("condition not reached");
}
