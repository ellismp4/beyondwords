/* =========================================================
   Helpers shared by the patient page (index.html)
   and the provider page (provider.html).
   ========================================================= */
window.BW = (() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* ---------- Screens ---------- */

  // Show one ".screen" by id and hide the others.
  function showScreen(screenId) {
    $$(".screen").forEach((screen) => {
      screen.hidden = screen.id !== screenId;
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // Any element with data-go="screenId" switches to that screen.
  function bindScreenNav() {
    $$("[data-go]").forEach((button) => {
      button.addEventListener("click", () => showScreen(button.dataset.go));
    });
  }

  /* ---------- localStorage (may be unavailable) ---------- */

  function readStore(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn(`Could not read "${key}".`, error);
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Could not save "${key}".`, error);
      return false;
    }
  }

  /* ---------- Call controls ---------- */

  // Mute / camera style toggle: swaps aria-pressed, label and icon.
  function bindToggle(button, { label, activeLabel, icon, activeIcon, onChange }) {
    if (!button) return;
    const text = $("span", button);
    const iconEl = $("i", button);

    button.addEventListener("click", () => {
      const active = button.getAttribute("aria-pressed") !== "true";

      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
      if (text) text.textContent = active ? activeLabel : label;
      if (iconEl) iconEl.className = `fa-solid ${active ? activeIcon : icon}`;

      if (onChange) onChange(active);
    });
  }

  // Floating tool popup. Buttons use data-tool="x"; panels use data-panel="x".
  // The popup title comes from the tool button's own label.
  function initToolPanel(root = document) {
    const panel = $(".call-tool-panel", root);
    if (!panel) return { open() {}, close() {} };

    const heading = $(".panel-heading h2", panel);
    const toolButtons = $$(".call-tool[data-tool]", root);
    const contents = $$(".call-panel-content", panel);

    const contentFor = (tool) => $(`[data-panel="${tool}"]`, panel);
    const isOpen = (tool) => !panel.hidden && contentFor(tool)?.hidden === false;

    function close() {
      panel.hidden = true;
      contents.forEach((content) => { content.hidden = true; });
      toolButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    }

    function open(tool) {
      const content = contentFor(tool);
      const button = $(`.call-tool[data-tool="${tool}"]`, root);
      if (!content) return;

      close();
      content.hidden = false;
      panel.hidden = false;

      if (heading) {
        heading.textContent = $("span", button)?.textContent || "Communication tool";
      }
      if (button) button.setAttribute("aria-pressed", "true");
    }

    toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool;
        if (isOpen(tool)) close();
        else open(tool);
      });
    });

    $(".panel-close", panel)?.addEventListener("click", close);

    return { open, close };
  }

  // Elements with data-autofade="15000" fade out and hide themselves
  // that many milliseconds after their content last changed.
  const FADE_MS = 3000;
  const fadeTimers = new WeakMap();

  function scheduleFade(element) {
    (fadeTimers.get(element) || []).forEach(clearTimeout);
    element.classList.remove("is-fading");

    const delay = Number(element.dataset.autofade);
    if (element.hidden || !delay) return;

    const startFade = setTimeout(() => element.classList.add("is-fading"), delay);
    const finish = setTimeout(() => {
      element.hidden = true;
      element.classList.remove("is-fading", "has-gesture");
      element.textContent = "";
    }, delay + FADE_MS);

    fadeTimers.set(element, [startFade, finish]);
  }

  // Show (or hide, when empty) a short message in an element.
  function showMessage(element, text) {
    if (!element) return;
    element.textContent = text || "";
    element.classList.remove("has-gesture");
    element.hidden = !text;
    scheduleFade(element);
  }

  /* ---------- Text to speech ---------- */

  const canSpeak = () => "speechSynthesis" in window;

  // The button that started the current reading. While it reads, that button
  // turns into a Stop button, and goes back to normal when the reading ends.
  let speakingButton = null;
  let currentUtterance = null;

  function resetSpeakingButton() {
    if (!speakingButton) return;
    speakingButton.innerHTML = speakingButton.dataset.idleHtml;
    speakingButton.classList.remove("is-speaking");
    delete speakingButton.dataset.idleHtml;
    speakingButton = null;
  }

  const isSpeakingFor = (button) => Boolean(button) && speakingButton === button;

  // Read text aloud. Returns false when there is nothing to say or the
  // browser has no speech support. Pass { button } to make that button
  // show "Stop" while the reading lasts.
  function speak(text, { rate = 0.9, button = null } = {}) {
    const clean = (text || "").trim();
    if (!clean || !canSpeak()) return false;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = rate;
    currentUtterance = utterance;

    resetSpeakingButton();
    window.speechSynthesis.cancel();

    if (button) {
      button.dataset.idleHtml = button.innerHTML;
      button.innerHTML = '<i class="fa-solid fa-stop" aria-hidden="true"></i> Stop';
      button.classList.add("is-speaking");
      speakingButton = button;
    }

    const finished = () => {
      if (currentUtterance === utterance) resetSpeakingButton();
    };
    utterance.onend = finished;
    utterance.onerror = finished;

    window.speechSynthesis.speak(utterance);
    return true;
  }

  function stopSpeaking() {
    currentUtterance = null;
    resetSpeakingButton();
    if (canSpeak()) window.speechSynthesis.cancel();
  }

  // One button that starts reading, and stops it when pressed again.
  function toggleSpeech(button, getText, options = {}) {
    if (isSpeakingFor(button)) {
      stopSpeaking();
      return false;
    }
    return speak(getText(), { ...options, button });
  }

  /* ---------- Tools chosen in the questionnaire ---------- */

  // Which telehealth tools each questionnaire answer turns on.
  // Tool names match data-feature attributes in the HTML.
  const METHOD_FEATURES = {
    "Writing or typing": ["message", "notes"],
    "Drawing": ["drawing"],
    "Gestures": ["gesture"],
    "Text to speech": ["tts", "message"]
  };

  // Older saved profiles used different names. Rename them so they still work.
  const LEGACY_METHODS = {
    "Gestures or drawing": "Drawing",
    "Gesture bank": "Gestures",
    "Pictures or symbols": "Gestures"
  };

  function normalizeMethods(methods) {
    const list = (Array.isArray(methods) ? methods : [])
      .map((method) => LEGACY_METHODS[method] || method);
    return [...new Set(list)];
  }

  function featuresForMethods(methods) {
    const features = new Set();
    normalizeMethods(methods).forEach((method) => {
      (METHOD_FEATURES[method] || []).forEach((name) => features.add(name));
    });
    return features;
  }

  // Hide every [data-feature] element whose feature is not in the set.
  function applyFeatures(root, features) {
    $$("[data-feature]", root).forEach((element) => {
      element.hidden = !features.has(element.dataset.feature);
    });
  }

  /* ---------- Gestures ---------- */

  // Fill a container with one big button per gesture.
  // items: [{ label, icon, say? }]. onSelect receives the chosen item.
  function initGestureBank(container, items, onSelect) {
    if (!container) return;
    container.replaceChildren();

    items.forEach((item) => {
      const button = document.createElement("button");
      const icon = document.createElement("i");
      const label = document.createElement("span");

      button.type = "button";
      button.className = "gesture-tile";
      icon.className = `fa-solid ${item.icon}`;
      icon.setAttribute("aria-hidden", "true");
      label.textContent = item.label;

      button.append(icon, label);
      button.addEventListener("click", () => onSelect(item));
      container.append(button);
    });
  }

  // Show a chosen gesture (icon + words) in a call message element.
  function showGesture(element, item) {
    if (!element) return;
    const icon = document.createElement("i");
    const label = document.createElement("span");

    icon.className = `fa-solid ${item.icon}`;
    icon.setAttribute("aria-hidden", "true");
    label.textContent = item.label;

    element.replaceChildren(icon, label);
    element.classList.add("has-gesture");
    element.hidden = false;
    scheduleFade(element);
  }

  /* ---------- Visit details, dates and calendar file ---------- */

  const VISIT_DEFAULTS = {
    visitType: "Follow-up",
    provider: "Dr. Taylor Morgan",
    durationMin: 30
  };

  // Older saved appointments do not have every field. Fill the gaps.
  const withVisitDefaults = (item) => ({ ...VISIT_DEFAULTS, ...item });

  function formatDay(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date to be confirmed";
    return date.toLocaleDateString([], {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
  }

  function formatClock(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function startsInText(value) {
    const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
    if (Number.isNaN(minutes)) return "";
    if (minutes >= 2880) return `Starts in ${Math.round(minutes / 1440)} days`;
    if (minutes >= 1440) return "Starts in 1 day";
    if (minutes >= 60) return `Starts in ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    if (minutes > 1) return `Starts in ${minutes} minutes`;
    if (minutes >= -5) return "Starting now";
    return "Started";
  }

  // Visits can be joined at any time.
  function joinState() {
    return { enabled: true, text: "" };
  }

  /* ---------- Shared appointments (patient and provider read the same list) ---------- */

  const APPOINTMENTS_KEY = "BeyondWordsAppointments";

  const dayOffset = (days, hour, minute) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  // The demo visit is the next half hour (at least 10 minutes away), and always
  // today, so it counts under "Visits today" for both people.
  const soonDemoDate = () => {
    const now = new Date();
    const date = new Date(now.getTime() + 10 * 60000);
    date.setMinutes(date.getMinutes() <= 30 ? 30 : 60, 0, 0);
    if (date.toDateString() !== now.toDateString()) {
      date.setTime(now.getTime());
      date.setHours(23, 50, 0, 0);
    }
    return date.toISOString();
  };

  const demoAppointments = () => [
    {
      id: "demo-upcoming-1",
      title: "Follow-up Appointment",
      provider: "Dr. Taylor Morgan",
      date: soonDemoDate(),
      status: "upcoming",
      demo: true
    },
    {
      id: "demo-past-1",
      title: "Intake Appointment",
      visitType: "Intake",
      provider: "Dr. Taylor Morgan",
      date: dayOffset(-14, 11, 0),
      completedAt: dayOffset(-14, 11, 45),
      status: "completed",
      summary: "Intake visit completed. Your provider reviewed your communication preferences.",
      demo: true
    }
  ];

  // Loads the one shared appointment list. Whichever page opens first adds the
  // demo visits, so both pages always show the same appointment.
  function loadAppointments() {
    const saved = readStore(APPOINTMENTS_KEY, []);
    let items = Array.isArray(saved) ? saved : [];
    let changed = !Array.isArray(saved);

    // Remove the stray visit an older provider page used to create.
    const cleaned = items.filter((item) => item.id !== "beyondwords-demo-appointment");
    if (cleaned.length !== items.length) { items = cleaned; changed = true; }

    demoAppointments().forEach((demo) => {
      const existing = items.find((item) => item.id === demo.id);
      if (!existing) {
        items.push(demo);
        changed = true;
      } else if (
        demo.id === "demo-upcoming-1" &&
        existing.status === "upcoming" &&
        !existing.rescheduledAt &&
        existing.phase !== "in-visit" &&
        (
          new Date(existing.date).toDateString() !== new Date().toDateString() ||
          new Date(existing.date) < new Date(Date.now() - 30 * 60000)
        )
      ) {
        // Left over from an earlier day or an unfinished test: bring it to today, fresh.
        Object.assign(existing, {
          date: demo.date,
          phase: "scheduled",
          patientPresent: false,
          providerPresent: false,
          todayMood: "",
          todayTopics: "",
          checkinAt: ""
        });
        changed = true;
      }
    });

    // Nothing left to attend, and no demo visit was finished today (for example
    // it was cancelled, or it is a new day)? Add one for today.
    const startedToday = new Date().toDateString();
    const finishedDemoToday = items.some(item =>
      String(item.id).startsWith("demo-upcoming") &&
      item.status === "completed" &&
      new Date(item.completedAt || item.date).toDateString() === startedToday
    );
    // (A visit finished today stays finished. Use "Reset demo" to run it again.)
    if (!finishedDemoToday && !items.some(item => item.status === "upcoming")) {
      const count = items.filter(item => String(item.id).startsWith("demo-upcoming")).length;
      items.push({ ...demoAppointments()[0], id: `demo-upcoming-${count + 1}` });
      changed = true;
    }

    if (changed) writeStore(APPOINTMENTS_KEY, items);
    return items;
  }

  // A follow-up visit picked in the after-visit summary becomes an upcoming
  // appointment (once). Returns true when one was added.
  function addFollowUpVisit(visit) {
    const when = new Date(visit?.afterVisitSummary?.followUp);
    if (Number.isNaN(when.getTime()) || when < new Date()) return false;

    const items = readStore(APPOINTMENTS_KEY, []);
    const id = `followup-${visit.id}`;
    if (!Array.isArray(items) || items.some(item => item.id === id)) return false;

    items.push({
      id,
      title: "Follow-up",
      provider: visit.provider || VISIT_DEFAULTS.provider,
      date: when.toISOString(),
      durationMin: VISIT_DEFAULTS.durationMin,
      status: "upcoming",
      phase: "scheduled",
      patientPresent: false,
      providerPresent: false,
      fromSummary: true
    });
    writeStore(APPOINTMENTS_KEY, items);
    return true;
  }

  // Add to calendar: downloads a standard .ics file.
  function downloadCalendarFile(item) {
    const visit = withVisitDefaults(item);
    const start = new Date(visit.date);
    if (Number.isNaN(start.getTime())) return;

    const end = new Date(start.getTime() + visit.durationMin * 60000);
    const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BeyondWords//Demo//EN",
      "BEGIN:VEVENT",
      `UID:${visit.id || start.getTime()}@beyondwords.demo`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${visit.title || visit.visitType} with ${visit.provider}`,
      "DESCRIPTION:Video visit on BeyondWords (demonstration).",
      "END:VEVENT",
      "END:VCALENDAR"
    ];

    const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "beyondwords-visit.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Camera and microphone ---------- */

  const media = (() => {
    let stream = null;
    let audioContext = null;
    let stopMeter = () => {};

    // Ask for camera and microphone. Falls back to just one if the other fails.
    async function start() {
      stop();
      const result = { camera: false, microphone: false, error: null };

      if (!navigator.mediaDevices?.getUserMedia) {
        result.error = "unsupported";
        return result;
      }

      const attempts = [
        { video: true, audio: true },
        { video: false, audio: true },
        { video: true, audio: false }
      ];

      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          result.camera = stream.getVideoTracks().length > 0;
          result.microphone = stream.getAudioTracks().length > 0;
          result.error = null;
          return result;
        } catch (error) {
          result.error = error.name || "error";
          if (error.name === "NotAllowedError" || error.name === "SecurityError") return result;
        }
      }
      return result;
    }

    function attach(videoElement) {
      if (videoElement && stream) videoElement.srcObject = stream;
    }

    function startMeter(onLevel) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!stream || !stream.getAudioTracks().length || !Context) return () => {};

      stopMeter();
      audioContext = new Context();

      const source = audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      let active = true;
      let frame = 0;

      const tick = () => {
        if (!active) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        samples.forEach((value) => {
          const level = (value - 128) / 128;
          sum += level * level;
        });
        onLevel(Math.sqrt(sum / samples.length));
        frame = requestAnimationFrame(tick);
      };
      tick();

      stopMeter = () => {
        active = false;
        cancelAnimationFrame(frame);
        try { source.disconnect(); } catch (error) { /* already closed */ }
        audioContext?.close?.();
        audioContext = null;
        stopMeter = () => {};
      };
      return () => stopMeter();
    }

    function stop() {
      stopMeter();
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    const setTracks = (kind, on) => {
      stream?.[kind]().forEach((track) => { track.enabled = on; });
    };

    return {
      start, stop, attach, startMeter,
      getStream: () => stream,
      setAudioEnabled: (on) => setTracks("getAudioTracks", on),
      setVideoEnabled: (on) => setTracks("getVideoTracks", on),
      hasVideo: () => Boolean(stream && stream.getVideoTracks().length)
    };
  })();

  /* ---------- Call clock and connection status ---------- */

  function createClock(element) {
    let timer = null;
    let startedAt = 0;

    const pad = (number) => String(number).padStart(2, "0");

    function render() {
      if (!element) return;
      const total = Math.floor((Date.now() - startedAt) / 1000);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      element.textContent = hours
        ? `${hours}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
    }

    function stop() {
      clearInterval(timer);
      timer = null;
    }

    function start() {
      stop();
      startedAt = Date.now();
      render();
      timer = setInterval(render, 1000);
    }

    function reset() {
      stop();
      if (element) element.textContent = "00:00";
    }

    return { start, stop, reset };
  }

  function connectionLevel() {
    if (!navigator.onLine) return "offline";
    const type = navigator.connection?.effectiveType;
    if (type === "slow-2g" || type === "2g") return "poor";
    if (type === "3g") return "fair";
    return "good";
  }

  const CONNECTION_TEXT = { good: "Good", fair: "Fair", poor: "Weak", offline: "Offline" };

  // Keeps the call's connection indicator and "Reconnecting" banner up to date.
  function initConnection(root) {
    const indicator = $("[data-conn]", root);
    const banner = $("[data-reconnect]", root);

    function update() {
      const level = connectionLevel();
      if (indicator) {
        indicator.dataset.level = level;
        $(".conn-text", indicator).textContent = CONNECTION_TEXT[level];
        indicator.setAttribute("aria-label", `Connection: ${CONNECTION_TEXT[level]}`);
      }
      if (banner) banner.hidden = level !== "offline";
    }

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    navigator.connection?.addEventListener?.("change", update);
    update();

    return { update };
  }

  /* ---------- Pre-call device check ---------- */

  function initDeviceCheck({ onContinue, onBack } = {}) {
    const root = $("#devicecheck");
    if (!root) return { enter() {} };

    const video = $("#checkVideo", root);
    const placeholder = $("#checkPlaceholder", root);
    const meterFill = $("#meterFill", root);
    const startButton = $("#checkStart", root);
    const speakerPlay = $("#checkSpeakerPlay", root);
    const speakerYes = $("#checkSpeakerYes", root);
    const speakerNo = $("#checkSpeakerNo", root);
    let stopLevel = () => {};

    const STATE_TEXT = { pending: "Not checked yet", ok: "Working", warn: "Needs attention" };

    function setRow(name, state, detail) {
      const row = $(`[data-check="${name}"]`, root);
      if (!row) return;
      row.dataset.state = state;
      $(".check-state", row).textContent = STATE_TEXT[state];
      if (detail) $(".check-detail", row).textContent = detail;
    }

    function checkConnection() {
      const level = connectionLevel();
      if (level === "offline") {
        setRow("connection", "warn", "You seem to be offline. Check your Wi-Fi or network cable.");
      } else if (level === "poor") {
        setRow("connection", "warn", "Your connection is weak. Video may freeze. Try moving closer to your router.");
      } else if (level === "fair") {
        setRow("connection", "ok", "Your connection is fair. Turning your camera off can help if the call is slow.");
      } else {
        setRow("connection", "ok", "Your connection looks good.");
      }
    }

    function stopPreview() {
      stopLevel();
      stopLevel = () => {};
      media.stop();
      if (video) { video.srcObject = null; video.hidden = true; }
      if (placeholder) placeholder.hidden = false;
      if (meterFill) meterFill.style.width = "0%";
    }

    function reset() {
      stopPreview();
      stopSpeaking();
      setRow("camera", "pending", 'Press "Check my camera and microphone".');
      setRow("microphone", "pending", "A bar will move when you speak.");
      setRow("speakers", "pending", "Play a sound and tell us if you can hear it.");
      if (speakerYes) speakerYes.hidden = true;
      if (speakerNo) speakerNo.hidden = true;
      if (startButton) $("span", startButton).textContent = "Check my camera and microphone";
      checkConnection();
    }

    async function runCheck() {
      startButton.disabled = true;
      setRow("camera", "pending", "Asking your browser for permission...");
      setRow("microphone", "pending", "Asking your browser for permission...");

      const result = await media.start();
      startButton.disabled = false;
      $("span", startButton).textContent = "Check again";

      if (result.camera) {
        media.attach(video);
        video.hidden = false;
        placeholder.hidden = true;
        setRow("camera", "ok", "Your camera is on. You should see yourself above.");
      } else {
        const blocked = result.error === "NotAllowedError" || result.error === "SecurityError";
        setRow("camera", "warn", blocked
          ? "Your camera is blocked. Allow it in your browser settings, or join without video."
          : "No camera was found. You can still join with voice or typed messages.");
      }

      if (result.microphone) {
        let heard = false;
        setRow("microphone", "ok", "Your microphone is on. Say something and watch the bar.");
        stopLevel = media.startMeter((level) => {
          meterFill.style.width = `${Math.min(100, Math.round(level * 300))}%`;
          if (level > 0.04 && !heard) {
            heard = true;
            setRow("microphone", "ok", "We can hear you.");
          }
        });
      } else {
        const blocked = result.error === "NotAllowedError" || result.error === "SecurityError";
        setRow("microphone", "warn", blocked
          ? "Your microphone is blocked. Allow it in your browser settings, or use typed messages."
          : "No microphone was found. You can use typed messages and gestures instead.");
      }
    }

    startButton?.addEventListener("click", runCheck);

    speakerPlay?.addEventListener("click", () => {
      const ok = speak("If you can hear this, your speakers are working.", { rate: 0.9 });
      if (!ok) {
        setRow("speakers", "warn", "This browser cannot play spoken sound. Try a different browser.");
        return;
      }
      speakerYes.hidden = false;
      speakerNo.hidden = false;
      setRow("speakers", "pending", "Did you hear a voice?");
    });

    speakerYes?.addEventListener("click", () => {
      setRow("speakers", "ok", "Your speakers are working.");
      speakerYes.hidden = true;
      speakerNo.hidden = true;
    });

    speakerNo?.addEventListener("click", () => {
      setRow("speakers", "warn", "Turn up your volume, check headphones, then try again.");
      speakerYes.hidden = true;
      speakerNo.hidden = true;
    });

    $("#checkContinue", root)?.addEventListener("click", () => {
      stopLevel();
      stopLevel = () => {};
      stopSpeaking();
      onContinue?.();
    });

    $("#checkBack", root)?.addEventListener("click", () => {
      stopPreview();
      stopSpeaking();
      onBack?.();
    });

    window.addEventListener("online", () => { if (!root.hidden) checkConnection(); });
    window.addEventListener("offline", () => { if (!root.hidden) checkConnection(); });

    return { enter: reset };
  }

  /* ---------- After-visit summary document ---------- */

  // Draws a formatted, printable summary into a container.
  function renderSummaryDocument(container, data) {
    if (!container) return;

    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    container.replaceChildren();

    const header = make("header", "doc-header");
    const logo = make("img", "doc-logo");
    logo.src = "images/logo.png";
    logo.alt = "BeyondWords";

    const title = make("div", "doc-title");
    title.append(
      make("p", "doc-kicker", "AFTER-VISIT SUMMARY"),
      make("h2", "doc-heading", data.visitType || "Video visit")
    );
    header.append(logo, title);

    const meta = make("dl", "doc-meta");
    [
      ["Patient", data.patient],
      ["Provider", data.provider],
      ["Date", data.dateText],
      ["Time", data.timeText],
      ["Length", data.durationText]
    ].filter(([, value]) => value !== undefined).forEach(([term, value]) => {
      const group = make("div");
      group.append(make("dt", "", term), make("dd", "", value || "Not provided"));
      meta.append(group);
    });

    container.append(header, meta);

    // A small "listen" button beside a heading reads that section aloud.
    const listenButton = (label, getText) => {
      const button = make("button", "doc-listen no-print");
      button.type = "button";
      button.setAttribute("aria-label", `Read aloud: ${label}`);
      button.innerHTML = '<i class="fa-solid fa-volume-high" aria-hidden="true"></i> Listen';
      button.disabled = !canSpeak();
      button.addEventListener("click", () => toggleSpeech(button, getText));
      return button;
    };

    const addSection = (heading, text, asList) => {
      const section = make("section", "doc-section");
      const lines = (text || "").split("\n").map((line) => line.trim()).filter(Boolean);

      const top = make("div", "doc-section-top");
      top.append(
        make("h3", "", heading),
        listenButton(heading, () => (lines.length ? `${heading}. ${lines.join(". ")}` : `${heading}. Nothing added yet.`))
      );
      section.append(top);

      if (!lines.length) {
        section.append(make("p", "doc-empty", "Nothing added yet."));
      } else if (asList) {
        const list = make("ol", "doc-list");
        lines.forEach((line) => list.append(make("li", "", line)));
        section.append(list);
      } else {
        lines.forEach((line) => section.append(make("p", "", line)));
      }
      container.append(section);
    };

    addSection("What we talked about", data.topics);
    addSection("What we discussed", data.discussion);
    addSection("My next steps", data.nextSteps, true);

    // Next visit, if the provider booked one during the call.
    const nextVisit = new Date(data.followUp);
    if (data.followUp && !Number.isNaN(nextVisit.getTime())) {
      const when = `${formatDay(nextVisit)} at ${formatClock(nextVisit)}`;
      const section = make("section", "doc-section doc-next-visit");
      const top = make("div", "doc-section-top");
      top.append(make("h3", "", "Next visit"), listenButton("Next visit", () => `Next visit. ${when}.`));
      section.append(top, make("p", "", when));

      const add = make("button", "button button-secondary button-small no-print");
      add.type = "button";
      add.innerHTML = '<i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> Add to calendar';
      add.addEventListener("click", () => downloadCalendarFile({
        id: `followup-${nextVisit.getTime()}`,
        title: "Follow-up",
        provider: data.provider,
        date: nextVisit.toISOString(),
        durationMin: VISIT_DEFAULTS.durationMin
      }));
      section.append(add);
      container.append(section);
    }

    container.append(make(
      "p",
      "doc-footer",
      "Prepared by your provider for your reference. This is a demonstration " +
      "document and is not medical advice."
    ));
  }

  // Reads the whole summary aloud, section by section.
  function readSummaryAloud(container, button) {
    const parts = [...container.querySelectorAll(".doc-section")].map((section) => {
      const heading = section.querySelector("h3")?.textContent || "";
      const body = [...section.querySelectorAll("p, li")].map((node) => node.textContent.trim()).filter(Boolean);
      return `${heading}. ${body.join(". ")}`;
    });
    return toggleSpeech(button, () => parts.join(". "));
  }

  return {
    $, $$,
    showScreen, bindScreenNav, readSummaryAloud,
    readStore, writeStore,
    bindToggle, initToolPanel, showMessage,
    speak, stopSpeaking, toggleSpeech, isSpeakingFor, canSpeak,
    featuresForMethods, normalizeMethods, applyFeatures,
    initGestureBank, showGesture,
    VISIT_DEFAULTS, withVisitDefaults, formatDay, formatClock,
    startsInText, joinState, downloadCalendarFile, addFollowUpVisit, loadAppointments,
    media, createClock, initConnection, initDeviceCheck,
    renderSummaryDocument
  };
})();

/* Demo people. There is no login: the patient page is always "Demo patient"
   and the provider page is always Dr. Taylor Morgan, so two devices can run a
   visit together straight away. */
BW.demo = {
  patient: {
    name: "Demo patient",
    // Used on the provider page until the patient's own device sends their profile.
    profile: {
      methods: ["Writing or typing", "Gestures", "Text to speech"],
      supports: ["Extra time"],
      caregiver: "Some",
      topics: ["Speech practice", "Medication check-in"],
      extraNotes: "My daughter, Sam",
      wantsSummary: "Yes",
      summaryRecipients: ["Both"],
      profileCompleted: true
    }
  },
  provider: { name: "Dr. Taylor Morgan" }
};