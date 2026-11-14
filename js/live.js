/* =========================================================
   Live visit: a real video call and shared writing between a
   patient on one device and a provider on another.

   Uses PeerJS (WebRTC). Video and audio go straight between
   the two browsers. PeerJS's free public service only helps
   them find each other at the start.
   Depends on js/shared.js and the PeerJS script.
   ========================================================= */
BW.live = (() => {
  const { readStore } = BW;

  const ROOM = "demo-room";

  let peer = null;
  let conn = null;
  let media = null;
  let role = null;
  let handlers = {};
  let status = "idle";
  let stopped = true;
  let retryTimer = null;
  let idAttempts = 0;
  let silent = null;

  const idFor = which => `beyondwords-${ROOM}-${which}`;
  const other = () => (role === "patient" ? "provider" : "patient");

  /* ----- Status ----- */

  function setStatus(next) {
    if (status === next) return;
    status = next;
    handlers.status?.(status);
  }

  /* ----- Starting and stopping ----- */

  function start(asRole, newHandlers = {}, mediaApi = null) {
    stop();
    role = asRole;
    handlers = newHandlers;
    media = mediaApi;
    stopped = false;
    idAttempts = 0;

    if (!window.Peer) {
      setStatus("unavailable");
      return false;
    }

    setStatus("connecting");
    openPeer();
    return true;
  }

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    try { conn?.close(); } catch (error) { /* already closed */ }
    try { peer?.destroy(); } catch (error) { /* already closed */ }
    conn = null;
    peer = null;
    status = "idle";
  }

  function openPeer() {
    try {
      // Optional: point at a different PeerJS server (for example one you host yourself).
      const server = readStore("BeyondWordsPeerServer", null) || {};

      peer = new window.Peer(idFor(role), {
        debug: 0,
        ...(server.host ? server : {}),
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478" }
          ]
        }
      });
    } catch (error) {
      setStatus("unavailable");
      return;
    }

    const mine = peer;

    mine.on("open", () => {
      if (stopped || peer !== mine) return;
      idAttempts = 0;
      setStatus(role === "patient" ? "waiting-peer" : "online");
      if (role === "patient") connectToProvider();
    });

    mine.on("connection", incoming => adopt(incoming));
    mine.on("call", incoming => answer(incoming));

    mine.on("disconnected", () => {
      if (stopped || peer !== mine) return;
      try { mine.reconnect(); } catch (error) { /* will retry on its own */ }
    });

    mine.on("error", error => {
      if (stopped || peer !== mine) return;

      if (error.type === "unavailable-id") {
        // Usually our own earlier tab or refresh that the service has not forgotten yet.
        idAttempts += 1;
        if (idAttempts > 6) { setStatus("id-taken"); return; }
        try { mine.destroy(); } catch (e) { /* ignore */ }
        peer = null;
        retryTimer = setTimeout(() => { if (!stopped) openPeer(); }, 4000);
      } else if (error.type === "peer-unavailable") {
        setStatus("waiting-peer");
        scheduleConnect();
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(error.type)) {
        setStatus("offline");
        retryTimer = setTimeout(() => {
          if (stopped) return;
          try { mine.destroy(); } catch (e) { /* ignore */ }
          peer = null;
          openPeer();
        }, 5000);
      }
    });
  }

  /* ----- Data connection ----- */

  function scheduleConnect() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (!stopped && role === "patient" && !(conn && conn.open)) connectToProvider();
    }, 3000);
  }

  function connectToProvider() {
    if (!peer || peer.destroyed || !peer.open) return;
    adopt(peer.connect(idFor("provider"), { reliable: true }));
  }

  function adopt(next) {
    if (conn && conn !== next) {
      try { conn.close(); } catch (error) { /* ignore */ }
    }
    conn = next;

    next.on("open", () => {
      if (conn !== next) return;
      setStatus("connected");
      handlers.open?.();
    });

    next.on("data", data => {
      if (conn === next && data && typeof data === "object") handlers.message?.(data);
    });

    const lost = () => {
      if (conn !== next) return;
      conn = null;
      if (stopped) return;
      setStatus(role === "patient" ? "waiting-peer" : "online");
      handlers.close?.();
      if (role === "patient") scheduleConnect();
    };

    next.on("close", lost);
    next.on("error", lost);
  }

  const isConnected = () => Boolean(conn && conn.open);

  function send(message) {
    if (!isConnected()) return false;
    try {
      conn.send(message);
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ----- Video and audio ----- */

  // PeerJS needs a stream to start a call, even when there is no camera.
  function silentStream() {
    if (silent) return silent;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      silent = new Context().createMediaStreamDestination().stream;
    } catch (error) {
      silent = new MediaStream();
    }
    return silent;
  }

  const localStream = () => media?.getStream?.() || silentStream();

  function wireCall(call) {
    call.on("stream", remote => handlers.stream?.(remote));
    call.on("close", () => handlers.streamEnded?.());
    call.on("error", () => handlers.streamEnded?.());
  }

  function startCall() {
    if (!peer || !isConnected()) return false;
    try {
      wireCall(peer.call(idFor(other()), localStream()));
      return true;
    } catch (error) {
      return false;
    }
  }

  function answer(incoming) {
    incoming.answer(localStream());
    wireCall(incoming);
  }

  return {
    start, stop, send, startCall, isConnected,
    get status() { return status; }
  };
})();

/* =========================================================
   Shared writing: the after-visit summary both people can
   edit during the call. Each field keeps the time of its last
   edit and the newest edit wins, so nothing is lost when both
   people type in different boxes.
   ========================================================= */
BW.collab = (() => {
  const { $ } = BW;

  // The date and time of the next visit. The provider sets it; the patient sees it.
  const FOLLOW_UP = ["followUp", "Next visit"];

  const FIELDS = [
    ["visitTopics", "What we talked about"],
    ["visitDiscussion", "What we discussed"],
    ["visitNextSteps", "My next steps"]
  ];

  function mount(container, options) {
    const { role, otherName, onChange, getStored } = options;
    const isProvider = role === "provider";

    // value + time of the last edit, for every shared field
    const data = {};
    [...FIELDS, FOLLOW_UP].forEach(([id]) => { data[id] = { v: "", t: 0 }; });

    const stored = getStored?.() || {};
    [...FIELDS, FOLLOW_UP].forEach(([id]) => { if (typeof stored[id] === "string") data[id].v = stored[id]; });

    container.replaceChildren();

    const intro = document.createElement("p");
    intro.className = "helper-text";
    intro.textContent = isProvider
      ? "Write this together with your patient. What either of you types appears on both screens."
      : "You and your provider write this together. What either of you types appears on both screens.";

    const live = document.createElement("p");
    live.className = "collab-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");

    container.append(intro, live);

    const inputs = {};
    let typingTimer;

    function setLive(state, text) {
      live.dataset.state = state;
      live.textContent = text;
    }

    function pulse(field) {
      const el = inputs[field];
      if (!el) return;
      el.classList.remove("just-updated");
      void el.offsetWidth;
      el.classList.add("just-updated");
    }

    FIELDS.forEach(([id, label]) => {
      const wrap = document.createElement("div");
      wrap.className = "collab-field";

      const lab = document.createElement("label");
      lab.htmlFor = `collab-${id}`;
      lab.textContent = label;

      const area = document.createElement("textarea");
      area.id = `collab-${id}`;
      area.rows = 3;
      area.value = data[id].v;

      area.addEventListener("input", () => {
        data[id] = { v: area.value, t: Date.now() };
        onChange?.({ field: id, ...data[id] }, snapshot());
      });

      inputs[id] = area;
      wrap.append(lab, area);
      container.append(wrap);
    });

    // Next visit: the provider picks a day and time, the patient sees it.
    const followWrap = document.createElement("div");
    followWrap.className = "collab-field";
    const followLabel = document.createElement("label");
    followLabel.htmlFor = "collab-followUp";
    followLabel.textContent = isProvider ? "Book the next visit (optional)" : "Next visit";

    const followInput = document.createElement("input");
    followInput.id = "collab-followUp";
    followInput.type = "datetime-local";
    followInput.value = data.followUp.v;
    followInput.disabled = !isProvider;

    const followNote = document.createElement("p");
    followNote.className = "helper-text";

    const paintFollow = () => {
      followNote.textContent = data.followUp.v
        ? "This visit will be added to My visits when the call ends."
        : isProvider ? "Pick a day and time, and it appears on your patient's screen." : "Your provider has not picked a day yet.";
    };
    paintFollow();

    followInput.addEventListener("input", () => {
      data.followUp = { v: followInput.value, t: Date.now() };
      paintFollow();
      onChange?.({ field: "followUp", ...data.followUp }, snapshot());
    });
    inputs.followUp = followInput;
    followWrap.append(followLabel, followInput, followNote);
    container.append(followWrap);

    setLive("off", "Not connected yet. Your changes are saved on this device.");

    function snapshot() {
      const out = {};
      [...FIELDS, FOLLOW_UP].forEach(([id]) => { out[id] = data[id].v; });
      return out;
    }

    // Apply someone else's newer edit. Keeps the cursor where it was.
    function merge(field, value, time) {
      if (!(field in data) || typeof value !== "string") return false;
      if (time <= data[field].t) return false;
      data[field] = { v: value, t: time };

      const el = inputs[field];
      if (el && el.value !== value) {
        const focused = document.activeElement === el;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = value;
        if (focused && el.setSelectionRange && el.type !== "datetime-local") {
          el.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length));
        }
        if (field === "followUp") paintFollow();
        pulse(field);
      }
      return true;
    }

    return {
      snapshot,

      // Everything we have, to send when the connection opens.
      full() {
        return { type: "summary-full", data };
      },

      // Handle a summary message from the other person.
      receive(message) {
        if (message.type === "summary") {
          const changed = merge(message.field, message.v, message.t);
          if (changed) {
            setLive("typing", `${otherName} is writing…`);
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => setLive("on", `Live with ${otherName}.`), 2200);
          }
          return changed;
        }

        if (message.type === "summary-full" && message.data) {
          let changed = false;
          Object.keys(message.data).forEach(field => {
            const item = message.data[field];
            if (item && merge(field, item.v, item.t)) changed = true;
          });
          return changed;
        }
        return false;
      },

      // Show the connection state above the writing boxes.
      setConnected(connected) {
        setLive(
          connected ? "on" : "off",
          connected
            ? `Live with ${otherName}.`
            : "Not connected yet. Your changes are saved on this device and will sync when you connect."
        );
      },

      // Pre-fill an empty box (for example with the patient's check-in topics).
      seed(field, value) {
        if (data[field] && !data[field].v.trim() && value) {
          data[field].v = value;
          inputs[field].value = value;
        }
      }
    };
  }

  return { mount, FIELDS };
})();