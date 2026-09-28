let view, flag, len32;
console.log("[worker] booted");
onmessage = (e) => {
  const msg = e.data;
  console.log("[worker] got:", msg.type);
  if (msg.type === "channel") {
    view = new Uint8Array(msg.sab);
    flag = new Int32Array(msg.sab, 0, 1);
    len32 = new Uint32Array(msg.sab, 4, 1);
    const bytes = Buffer.from(JSON.stringify({ ok: true, value: "hello" }), "utf8");
    view.set(bytes, 8);
    Atomics.store(len32, 0, bytes.length);
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0);
  }
};
