/* =========================================================
   Patient page (index.html)
   Depends on js/shared.js
   ========================================================= */

(() => {
  const {
    $, $$, readStore, writeStore, showScreen: showScreenRaw,
    bindScreenNav, initToolPanel, bindToggle, showMessage,
    speak, stopSpeaking, isSpeakingFor, canSpeak,
    featuresForMethods, normalizeMethods, applyFeatures, initGestureBank, showGesture,
    withVisitDefaults, formatDay, formatClock, startsInText,
    downloadCalendarFile, loadAppointments, media, createClock, initConnection, initDeviceCheck,
    renderSummaryDocument
  } = BW;

  // Show a screen and keep the header links ("Home", "My visits") in step.
  function showScreen(id) {
    showScreenRaw(id);
    $$("[data-nav], [data-nav-current]", $("#headerNav")).forEach(link => {
      const current = (link.dataset.nav || link.dataset.navCurrent) === id;
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  $$("[data-nav]").forEach(link => {
    link.addEventListener("click", () => {
      stopSpeaking();
      showScreen(link.dataset.nav);
    });
  });

  const STORAGE_KEY = "BeyondWordsAphasia";
  const APPOINTMENTS_KEY = "BeyondWordsAppointments";

  // Sample after-visit summary shown for the demo past visit.
  const DEMO_VISIT_SUMMARY = {
    topics: "How my communication tools work\nWhat I want to practise this month",
    discussion: "We went over the tools that help me communicate during video visits.\nWe agreed to keep appointments short and slow.",
    nextSteps: "Practise my gestures for five minutes each day\nWrite down new words I want to say\nJoin my follow-up visit",
    questions: "Can my caregiver join the next visit?",
    status: "confirmed"
  };

  let state = {};
  let appointments = [];
  let activeAppointmentId = null;
  let editingProfile = false;
  let troubleshootReturn = "home";
  const { live, collab } = BW;

  const form = $("#prepareForm");
  const checkinForm = $("#checkinForm");
  const appointmentScreen = $("#appointment");
  const callMessage = $("#callMessage");

  /* ---------- Storage and demo data ---------- */
  function saveAppointments() {
    writeStore(APPOINTMENTS_KEY, appointments);
  }

function loadState() {
  const saved = readStore(STORAGE_KEY, null);

  if (saved && typeof saved === "object") {
    state = { ...saved };
    state.methods = normalizeMethods(state.methods);
  } else {
    state = {
      methods: [],
      supports: [],
      caregiver: "",
      topics: [],
      extraNotes: "",
      wantsSummary: "",
      summaryRecipients: [],
      visitNotes: "",
      nextSteps: "",
      drawing: "",
      completedAt: "",
      profileCompleted: false
    };

    writeStore(STORAGE_KEY, state);
  }
}

  function persistState() {
    writeStore(STORAGE_KEY, state);

    // Keep the provider's view of this profile up to date.
    if (state.profileCompleted) {
      if (live.status === "idle") startLive();
      else if (live.isConnected()) sendHello();
    }
  }

  function setText(id, value, fallback = "Not provided") {
    const element = document.getElementById(id);
    if (element) element.textContent = value || fallback;
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value || "";
  }

  function formatDate(value, options = {}) {
    if (!value) return "Date to be confirmed";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date to be confirmed";

    return date.toLocaleString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...options
    });

    
  }

  function resetDemoData() {
  if (!confirm("Reset BeyondWords to the first-time patient experience?")) {
    return;
  }

  localStorage.removeItem("BeyondWordsAphasia");
  localStorage.removeItem("BeyondWordsAppointments");
  localStorage.removeItem("beyondWordsProviderDemoSummary");

  location.reload();
}

const resetButton = $("#resetDemoDataButton");

if (resetButton) {
  resetButton.addEventListener("click", resetDemoData);
}

  /* ---------- Profile questionnaire ---------- */

  const valueFor = (name) =>
    form?.querySelector(`[name="${name}"]:checked`)?.value || "";

  const valuesFor = (name) =>
    form ? $$(`[name="${name}"]:checked`, form).map(input => input.value) : [];

  function check(name, value) {
    if (!form || !value) return;

    const input = [...form.querySelectorAll(`[name="${name}"]`)]
      .find(item => item.value === value);

    if (input) input.checked = true;
  }

  function restoreForm() {
    if (!form) return;

    // Start from a clean form so choices the patient removed stay removed.
    form.reset();

    check("caregiverInvolvement", state.caregiver);
    check("wantsSummary", state.wantsSummary);

    [
      "methods", "supports", "topics", "summaryRecipients"
    ].forEach(name => {
      (Array.isArray(state[name]) ? state[name] : [])
        .forEach(value => check(name, value));
    });

    setValue("supportPerson", state.extraNotes);
    setValue("visitNotes", state.visitNotes);
    setValue("nextSteps", state.nextSteps);
  }

  form?.addEventListener("submit", event => {
    event.preventDefault();

    state.methods = valuesFor("methods");
    state.supports = valuesFor("supports");
    state.caregiver = valueFor("caregiverInvolvement");
    state.extraNotes = $("#supportPerson")?.value.trim() || "";
    state.wantsSummary = valueFor("wantsSummary");
    state.summaryRecipients = valuesFor("summaryRecipients");
    state.profileCompleted = true;
    state.completedAt = new Date().toISOString();

    persistState();
    updateSummary();
    renderHomeDashboard();

    if (editingProfile) {
      stopEditing();
      showScreen("home");
      flashHomeStatus("Your profile has been saved.");
    } else {
      showScreen("home");
    }
  });

  /* ---------- Profile quiz navigation ---------- */

  const pages = $$(".quiz-page");
  const prepareScreen = $("#prepare");
  const progressBox = $(".quiz-progress");
  const backButton = $("#quizBack");
  const nextButton = $("#quizNext");
  const finishButton = $("#quizFinish");
  const saveEditButton = $("#quizSaveEdit");
  const cancelEditButton = $("#quizCancelEdit");
  const progressFill = $("#quizProgressFill");
  const progressText = $("#quizProgressText");

  let currentPage = 0;

  // First time: one question per step.
  // Editing later: every question on one page with a single Save button.
  function showQuizPage(index) {
    if (!pages.length) return;

    prepareScreen?.classList.toggle("is-editing", editingProfile);
    setText("prepareEyebrow", editingProfile ? "MY PROFILE" : "BEFORE YOUR VISIT");
    setText(
      "prepareTitle",
      editingProfile ? "Edit my profile" : "Let's get ready for your visit."
    );
    setText(
      "prepareIntro",
      editingProfile
        ? "Change anything you like, then press Save."
        : "Choose your answers. You can go back at any time."
    );

    if (progressBox) progressBox.hidden = editingProfile;
    if (saveEditButton) saveEditButton.hidden = !editingProfile;
    if (cancelEditButton) cancelEditButton.hidden = !editingProfile;

    if (editingProfile) {
      pages.forEach(page => { page.hidden = false; });
      [backButton, nextButton, finishButton].forEach(button => {
        if (button) button.hidden = true;
      });
      return;
    }

    currentPage = Math.max(0, Math.min(pages.length - 1, index));

    pages.forEach((page, i) => {
      page.hidden = i !== currentPage;
    });

    const lastPage = currentPage === pages.length - 1;

    if (backButton) {
      backButton.hidden = false;
      backButton.disabled = currentPage === 0;
    }
    if (nextButton) nextButton.hidden = lastPage;
    if (finishButton) finishButton.hidden = !lastPage;

    if (progressFill) {
      progressFill.style.width =
        `${((currentPage + 1) / pages.length) * 100}%`;
    }

    if (progressText) {
      progressText.textContent = `Step ${currentPage + 1} of ${pages.length}`;
    }

    const heading = $("h3", pages[currentPage]);
    heading?.focus?.({ preventScroll: true });
  }

  showQuizPage(0);

  backButton?.addEventListener("click", () => showQuizPage(currentPage - 1));
  nextButton?.addEventListener("click", () => showQuizPage(currentPage + 1));

  $("#setupProfileButton")?.addEventListener("click", () => {
    editingProfile = false;
    showScreen("prepare");
    showQuizPage(0);
  });

  /* ---------- Editing an existing profile ---------- */

  let homeStatusTimer;

  function flashHomeStatus(text) {
    const elements = [$("#homeStatus"), $("#visitsStatus")].filter(Boolean);
    if (!elements.length) return;

    elements.forEach(element => showMessage(element, text));
    clearTimeout(homeStatusTimer);
    homeStatusTimer = setTimeout(
      () => elements.forEach(element => showMessage(element, "")),
      8000
    );
  }

  function startEditing() {
    editingProfile = true;
    restoreForm();
    showScreen("prepare");
    showQuizPage(0);
  }

  function stopEditing() {
    editingProfile = false;
    showQuizPage(0);
  }

  $("#editProfileButton")?.addEventListener("click", startEditing);

  cancelEditButton?.addEventListener("click", () => {
    stopEditing();
    showScreen("home");
  });

  /* ---------- Troubleshooting ---------- */

  function openTroubleshooting(returnTo) {
    troubleshootReturn = returnTo || "home";
    const label = $("#troubleshootBackLabel");

    if (label) {
      label.textContent = troubleshootReturn === "appointment"
        ? "Back to my call"
        : "Go back";
    }

    stopSpeaking();
    setText("soundTestStatus", "", "");
    showScreen("troubleshoot");
  }

  $$("[data-open-troubleshoot]").forEach(button => {
    button.addEventListener("click", () => {
      const current = $$(".screen").find(screen => !screen.hidden)?.id;
      openTroubleshooting(current === "troubleshoot" ? troubleshootReturn : current);
    });
  });

  $("#troubleshootBack")?.addEventListener("click", () => {
    stopSpeaking();
    showScreen(troubleshootReturn);
  });

  $("#soundTestButton")?.addEventListener("click", () => {
    const ok = speak("If you can hear this, your sound is working.", { rate: 0.85 });
    setText(
      "soundTestStatus",
      ok
        ? "Playing a test sound. If you hear nothing, turn up your volume."
        : "This browser cannot play spoken sound. Try a different browser.",
      ""
    );
  });

  /* ---------- Patient summary and provider profile ---------- */

  function updateSummary() {
    setText(
      "summaryTopics",
      state.topics?.length ? state.topics.join(", ") : "No topics selected."
    );

    const preferences = [
      state.methods?.length && `Communication: ${state.methods.join(", ")}`,
      state.caregiver && `Caregiver involvement: ${state.caregiver}`,
      state.extraNotes && `Support person: ${state.extraNotes}`
    ].filter(Boolean);

    setText(
      "summaryPreferences",
      preferences.join(". ") || "No preferences saved."
    );

    setValue("nextSteps", state.nextSteps);
  }

  function updateProvider() {
    setText("providerMethods", state.methods?.join(", "));
    setText("providerSupports", state.supports?.join(", "));
    setText("providerCaregiver", state.caregiver);
    setText("providerTopics", state.topics?.join(", "));
    setText("providerNotes", state.extraNotes);
  }

  /* ---------- Patient dashboard ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function detailLine(iconClass, text) {
    const line = el("p", "appointment-line");
    const icon = el("i", `fa-regular ${iconClass}`);
    icon.setAttribute("aria-hidden", "true");
    line.append(icon, el("span", "", text));
    return line;
  }

  function actionButton(label, className, onClick) {
    const button = el("button", `button ${className}`, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function createAppointmentCard(rawItem, isPast = false, isNext = false, compact = false) {
    const item = withVisitDefaults(rawItem);
    const card = el("article", "appointment-card");
    if (isNext) card.classList.add("is-next");

    const details = el("div", "appointment-details");

    if (isNext) {
      details.append(el("p", "next-tag", `NEXT VISIT · ${startsInText(item.date)}`));
    }

    details.append(el("h3", "", item.title || "Healthcare appointment"));
    details.append(el("span", "visit-type", item.visitType));

    if (isPast) {
      details.append(detailLine("fa-calendar", `Completed ${formatDay(item.completedAt || item.date)}`));
    } else {
      details.append(detailLine("fa-calendar", formatDay(item.date)));
      details.append(detailLine("fa-clock", `${formatClock(item.date)} · ${item.durationMin} minutes`));
    }

    details.append(detailLine("fa-user", `${item.provider}`));

    if (item.demo) details.append(el("span", "demo-label", "Demo appointment"));
    card.append(details);

    const actions = el("div", "appointment-actions");

    if (isPast) {
      actions.append(actionButton("View summary", "button-primary", () => openSummary(rawItem)));
    } else {
      const joinButton = actionButton("Join visit", "button-primary", () => beginVisit(rawItem));

      actions.append(joinButton);

      if (!compact) {
        const more = el("div", "appointment-more");
        more.append(
          actionButton("Reschedule", "button-small", () => openReschedule(rawItem)),
          actionButton("Add to calendar", "button-small", () => downloadCalendarFile(item)),
          actionButton("Cancel visit", "button-small button-quiet", () => cancelVisit(rawItem))
        );
        actions.append(more);
      }
    }

    card.append(actions);
    return card;
  }

  function renderHomeDashboard() {
const returning = Boolean(state.profileCompleted);

    const firstVisit = $("#firstVisitWelcome");
    const returningWelcome = $("#returningWelcome");
    const dashboard = $("#returningDashboard");

    const howItWorks = $("#howItWorks");
    if (howItWorks) howItWorks.hidden = returning;

    if (firstVisit) firstVisit.hidden = returning;

    if (returningWelcome) returningWelcome.hidden = !returning;
    if (dashboard) dashboard.hidden = !returning;

    $$("[data-returning-only]").forEach(link => { link.hidden = !returning; });

    if (!returning) return;

    const nextContainer = $("#nextVisit");
    const upcomingContainer = $("#upcomingAppointments");
    const pastContainer = $("#pastAppointments");

    if (!upcomingContainer || !pastContainer || !nextContainer) return;

    nextContainer.replaceChildren();
    upcomingContainer.replaceChildren();
    pastContainer.replaceChildren();

    const upcoming = appointments
      .filter(item => item.status === "upcoming")
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const past = appointments
      .filter(item => item.status === "completed")
      .sort((a, b) =>
        new Date(b.completedAt || b.date) - new Date(a.completedAt || a.date)
      );

    if (upcoming.length) {
      nextContainer.append(createAppointmentCard(upcoming[0], false, true, true));
    } else {
      nextContainer.textContent = "No upcoming appointments are listed yet.";
    }

    if (!upcoming.length) {
      upcomingContainer.textContent = "No upcoming appointments are listed yet.";
    } else {
      upcoming.forEach((item, index) => {
        upcomingContainer.append(createAppointmentCard(item, false, index === 0));
      });
    }

    if (!past.length) {
      pastContainer.textContent =
        "Your visit summaries will appear here after your appointments.";
    } else {
      past.forEach(item => {
        pastContainer.append(createAppointmentCard(item, true));
      });
    }
  }

  /* ---------- Before-appointment check-in ---------- */

  function prepareCheckin(appointment) {
    if (!checkinForm) return;

    checkinForm.reset();

    const mood = appointment?.todayMood;
    if (mood) {
      const moodInput = checkinForm.querySelector(
        `[name="todayMood"][value="${CSS.escape(mood)}"]`
      );
      if (moodInput) moodInput.checked = true;
    }

    setValue("todayTopics", appointment?.todayTopics || "");
  }

  const checkinValueFor = name =>
    checkinForm?.querySelector(`[name="${name}"]:checked`)?.value || "";

  checkinForm?.addEventListener("submit", event => {
    event.preventDefault();

    const mood = checkinValueFor("todayMood");
    const topics = $("#todayTopics")?.value.trim() || "";

    if (!mood) {
      $("#checkinForm [name='todayMood']")?.focus();
      return;
    }

    let appointment = appointments.find(
      item => item.id === activeAppointmentId
    );

    if (!appointment) {
      appointment = {
        id: `visit-${Date.now()}`,
        title: "Healthcare appointment",
        provider: "Dr. Taylor Morgan",
        date: new Date().toISOString(),
        status: "upcoming"
      };
      appointments.push(appointment);
      activeAppointmentId = appointment.id;
    }

    appointment.todayMood = mood;
    appointment.todayTopics = topics;
    appointment.checkinAt = new Date().toISOString();
    appointment.phase = "checked-in";

    saveAppointments();
    deviceCheck.enter();
    showScreen("devicecheck");
  });

  $("#checkinBackButton")?.addEventListener("click", () => {
    showScreen("home");
  });

  /* ---------- Visit actions: join, reschedule, cancel ---------- */

  const currentAppointment = () =>
    appointments.find(item => item.id === activeAppointmentId);

  function setPhase(phase, extra = {}) {
    const appointment = currentAppointment();
    if (!appointment) return;
    Object.assign(appointment, { phase }, extra);
    saveAppointments();
    live.send({ type: "presence", phase });
  }

  function beginVisit(item) {
    activeAppointmentId = item.id;
    prepareCheckin(item);
    showScreen("checkin");
  }

  const rescheduleDialog = $("#rescheduleDialog");
  let rescheduleTarget = null;

  const pad2 = number => String(number).padStart(2, "0");

  function openReschedule(item) {
    if (!rescheduleDialog?.showModal) return;
    rescheduleTarget = item;

    const date = new Date(item.date);
    $("#rescheduleDate").value =
      `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    $("#rescheduleDate").min = new Date().toISOString().slice(0, 10);
    $("#rescheduleTime").value = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

    rescheduleDialog.showModal();
  }

  $("#rescheduleCancel")?.addEventListener("click", () => rescheduleDialog.close());

  $("#rescheduleForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const newDate = new Date(`${$("#rescheduleDate").value}T${$("#rescheduleTime").value}`);
    if (Number.isNaN(newDate.getTime()) || !rescheduleTarget) return;

    rescheduleTarget.date = newDate.toISOString();
    rescheduleTarget.rescheduledAt = new Date().toISOString();
    saveAppointments();
    rescheduleDialog.close();
    renderHomeDashboard();
    flashHomeStatus(`Your visit is now ${formatDay(newDate)} at ${formatClock(newDate)}.`);
  });

  function cancelVisit(item) {
    if (!confirm("Are you sure you want to cancel this visit? ")) return;
    item.status = "cancelled";
    item.cancelledAt = new Date().toISOString();
    saveAppointments();
    renderHomeDashboard();
    flashHomeStatus("Your visit was cancelled.");
  }

  // Keep "Join" buttons and "Starts in" text fresh.
  setInterval(() => {
    if (!$("#home")?.hidden || !$("#visits")?.hidden) renderHomeDashboard();
  }, 30000);

  /* ---------- Device check and waiting room ---------- */

  const deviceCheck = initDeviceCheck({
    onContinue: enterWaitingRoom,
    onBack: () => showScreen("checkin")
  });

  function enterWaitingRoom() {
    const appointment = currentAppointment();
    if (!appointment) { showScreen("home"); return; }

    const visit = withVisitDefaults(appointment);
    setText("waitingVisit", visit.title);
    setText("waitingProvider", `${visit.provider}`);
    setText("waitingTime", `${formatClock(visit.date)} · ${visit.durationMin} minutes`);

    setPhase("waiting", { patientPresent: true });
    updateWaitingText();
    showScreen("waiting");
    if (live.status === "idle") startLive();
    else if (live.isConnected()) sendHello();
    if (appointment.providerPresent) admitSoon();
  }

  function updateWaitingText() {
    const appointment = currentAppointment();
    const ready = Boolean(appointment?.providerPresent);
    setText("waitingTitle", ready ? "Your provider is ready" : "You're in the waiting room");
    setText(
      "waitingText",
      ready
        ? "Joining your visit now..."
        : "Your provider will let you in soon. You do not need to do anything."
    );
  }

  let admitTimer;
  function admitSoon() {
    updateWaitingText();
    clearTimeout(admitTimer);
    admitTimer = setTimeout(enterCall, 1500);
  }

  $("#waitingLeave")?.addEventListener("click", () => {
    clearTimeout(admitTimer);
    live.stop();
    media.stop();
    setPhase("scheduled", { patientPresent: false });
    activeAppointmentId = null;
    renderHomeDashboard();
    showScreen("home");
  });

  /* ---------- Call chrome: status, timer, self view ---------- */

  const callClock = createClock($("#callTimer"));
  initConnection(appointmentScreen);

  const callPill = $("#callPill");
  const callToast = $("#callToast");
  const selfVideo = $("#selfVideo");
  let toastTimer;

  function setPill(state, text) {
    if (!callPill) return;
    callPill.dataset.state = state;
    setText("callPillText", text, "");
  }

  function toast(text) {
    if (!callToast) return;
    callToast.textContent = text;
    callToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { callToast.hidden = true; }, 5000);
  }

  function updateProviderPresence() {
    const appointment = currentAppointment();
    if (!appointment) return;
    const visit = withVisitDefaults(appointment);

    setText("callProviderName", visit.provider);

    if (appointment.providerPresent) setPill("live", "Provider joined");
    else setPill("waiting", "Provider left the call");
  }

  function enterCall() {
    const appointment = currentAppointment();
    if (!appointment) { showScreen("home"); return; }

    setPhase("in-visit", { patientPresent: true, startedAt: new Date().toISOString() });
    applyCallFeatures();

    media.attach(selfVideo);
    const hasVideo = media.hasVideo();
    selfVideo.hidden = !hasVideo;
    $(".self-avatar", appointmentScreen).hidden = hasVideo;

    updateProviderPresence();
    callClock.start();
    showScreen("appointment");
    toast(`${withVisitDefaults(appointment).provider} joined the visit.`);

    mountSummary(appointment);
    if (!live.isConnected() && live.status === "idle") startLive();
    if (live.isConnected()) {
      live.startCall();
      sendAv();
      live.send(summaryCollab.full());
    }
  }

  /* ---------- Patient call tools ---------- */

  const panels = initToolPanel(appointmentScreen);

  // Show only the tools the patient chose in their profile.
  let callFeatures = new Set();

  function applyCallFeatures() {
    callFeatures = featuresForMethods(state.methods);
    applyFeatures(appointmentScreen, callFeatures);
    panels.close();
  }

  $("#callHelp")?.addEventListener("click", () => {
    panels.close();
    openTroubleshooting("appointment");
  });

  $("#useTranscript")?.addEventListener("click", () => {
    const text = $("#transcriptText")?.value.trim();
    showMessage(callMessage, text);
    if (text) live.send({ type: "message", text });
  });

  /* ---------- Text to speech ---------- */

  $("#readTranscript")?.addEventListener("click", () => {
    const readButton = $("#readTranscript");
    if (isSpeakingFor(readButton)) {
      stopSpeaking();
      setText("transcriptStatus", "", "");
      return;
    }
    const text = $("#transcriptText")?.value.trim();
    const rate = Number($("#transcriptSpeed")?.value) || 0.9;

    if (!canSpeak()) {
      setText("transcriptStatus", "Read-aloud is not supported in this browser.", "");
    } else if (!text) {
      setText("transcriptStatus", "Type a message first, then press Read aloud.", "");
    } else {
      showMessage(callMessage, text);
      live.send({ type: "message", text });
      speak(text, { rate, button: readButton });
      setText("transcriptStatus", "Reading your message aloud.", "");
    }
  });

  /* ---------- Gestures ---------- */

  const PATIENT_GESTURES = [
    { label: "Yes", icon: "fa-thumbs-up" },
    { label: "No", icon: "fa-thumbs-down" },
    { label: "Stop", icon: "fa-hand" },
    { label: "Wait", icon: "fa-hourglass-half", say: "Please wait" },
    { label: "Say it again", icon: "fa-rotate-right", say: "Please say that again" },
    { label: "Slower", icon: "fa-person-walking", say: "Please go slower" },
    { label: "I don't understand", icon: "fa-circle-question" },
    { label: "I need help", icon: "fa-hand-holding-heart" },
    { label: "Thank you", icon: "fa-heart" }
  ];

  initGestureBank($("#patientGestureBank"), PATIENT_GESTURES, item => {
    showGesture(callMessage, item);
    live.send({ type: "gesture", item: { label: item.label, icon: item.icon } });

    // Speak the gesture aloud when the patient chose text to speech.
    if (callFeatures.has("tts")) {
      speak(item.say || item.label, {
        rate: Number($("#transcriptSpeed")?.value) || 0.9
      });
    }
  });

  $("#visitNotes")?.addEventListener("input", event => {
    state.visitNotes = event.target.value;
    persistState();
  });

  /* ---------- Drawing board ---------- */

  const canvas = $("#drawingCanvas");
  const ctx = canvas?.getContext("2d");
  const PEN_COLOR = "#7a5a70";

  // The latest picture, kept so it can be sent again when the call connects.
  let drawingImage = "";
  let drawingTimer = null;

  function sendDrawing() {
    live.send({ type: "drawing", image: drawingImage });
  }

  function shareDrawing(now = false) {
    clearTimeout(drawingTimer);
    const run = () => {
      // White background so the provider sees it clearly, not transparent.
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const flatCtx = flat.getContext("2d");
      flatCtx.fillStyle = "#ffffff";
      flatCtx.fillRect(0, 0, flat.width, flat.height);
      flatCtx.drawImage(canvas, 0, 0);
      drawingImage = hasInk ? flat.toDataURL("image/jpeg", 0.7) : "";
      sendDrawing();
    };
    if (now) run(); else drawingTimer = setTimeout(run, 400);
  }

  let hasInk = false;

  if (canvas && ctx) {
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = PEN_COLOR;

    let drawing = false;
    let erasing = false;
    let strokes = [];
    let currentStroke = null;

    function canvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    }

    function redrawCanvas() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      strokes.forEach(stroke => {
        if (!stroke.points.length) return;

        ctx.globalCompositeOperation =
          stroke.erase ? "destination-out" : "source-over";
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

        stroke.points.slice(1).forEach(point => {
          ctx.lineTo(point.x, point.y);
        });

        if (stroke.points.length === 1) {
          ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
        }

        ctx.stroke();
      });

      ctx.globalCompositeOperation = "source-over";
    }

    canvas.addEventListener("pointerdown", event => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);

      currentStroke = {
        erase: erasing,
        color: ctx.strokeStyle,
        width: ctx.lineWidth,
        points: [canvasPoint(event)]
      };

      strokes.push(currentStroke);
      redrawCanvas();
    });

    canvas.addEventListener("pointermove", event => {
      if (!drawing || !currentStroke) return;
      currentStroke.points.push(canvasPoint(event));
      redrawCanvas();
    });

    const finishStroke = () => {
      if (!drawing) return;
      drawing = false;
      currentStroke = null;
      hasInk = strokes.some(stroke => !stroke.erase);
      shareDrawing();
    };

    canvas.addEventListener("pointerup", finishStroke);
    canvas.addEventListener("pointercancel", finishStroke);

    $("#penButton")?.addEventListener("click", () => {
      erasing = false;
      ctx.strokeStyle = PEN_COLOR;
      ctx.lineWidth = 4;
    });

    $("#eraserButton")?.addEventListener("click", () => {
      erasing = true;
      ctx.lineWidth = 24;
    });

    $("#undoButton")?.addEventListener("click", () => {
      strokes.pop();
      redrawCanvas();
      hasInk = strokes.some(stroke => !stroke.erase);
      shareDrawing(true);
    });

    $("#clearButton")?.addEventListener("click", () => {
      strokes = [];
      redrawCanvas();
      hasInk = false;
      shareDrawing(true);
    });

    $("#saveDrawingButton")?.addEventListener("click", () => {
      state.drawing = canvas.toDataURL("image/png");
      persistState();

      const link = document.createElement("a");
      link.href = state.drawing;
      link.download = "my-visit-drawing.png";
      link.click();

      setText("drawingStatus", "Drawing saved as a PNG file on your device.");
    });
  }

  /* ---------- End appointment ---------- */

  // Wrap up the visit. Used when the patient ends it and when the provider does.
  function finishVisit(byProvider = false) {
    setFocusMode(false);
    panels.close();
    stopSpeaking();
    showMessage(callMessage, "");
    callClock.stop();
    media.stop();
    if (selfVideo) selfVideo.srcObject = null;
    hideRemoteStream();

    if (!byProvider) live.send({ type: "left" });
    live.stop();

    const appointment = currentAppointment();

    if (appointment) {
      const written = appointment.afterVisitSummary || {};
      const sharedText = [
        written.visitTopics, written.visitDiscussion,
        written.visitNextSteps
      ].filter(Boolean).join("\n\n");

      appointment.status = "completed";
      appointment.phase = "completed";
      appointment.patientPresent = false;
      appointment.providerPresent = false;
      appointment.completedAt = new Date().toISOString();

      appointment.summary = sharedText || [
        $("#visitNotes")?.value.trim(),
        $("#nextSteps")?.value.trim()
      ].filter(Boolean).join("\n\n") ||
        "Your visit is complete. Your provider can add an after-visit summary.";

      saveAppointments();

      // A next visit booked in the summary shows up under My visits.
      if (BW.addFollowUpVisit(appointment)) appointments = loadAppointments();
    }

    activeAppointmentId = null;
    summaryCollab = null;
    renderHomeDashboard();
    showScreen("home");
    flashHomeStatus(
      byProvider
        ? "Your provider ended the visit. Your summary is under My visits."
        : "Your visit is finished. Your summary is under My visits."
    );
  }

  $("#endCallButton")?.addEventListener("click", () => finishVisit(false));

  /* ---------- After-visit summary document ---------- */

  let summaryReturn = "visits";

  function openSummary(rawItem) {
    const item = withVisitDefaults(rawItem);
    const fromProvider = rawItem.afterVisitSummary
      ? {
          topics: rawItem.afterVisitSummary.visitTopics,
          discussion: rawItem.afterVisitSummary.visitDiscussion,
          nextSteps: rawItem.afterVisitSummary.visitNextSteps
        }
      : null;
    const written = fromProvider || (rawItem.id === "demo-past-1" ? DEMO_VISIT_SUMMARY : {});
    const fallbackNotes = rawItem.summary && !rawItem.demo ? rawItem.summary : "";
    const end = new Date(rawItem.completedAt || rawItem.date);

    renderSummaryDocument($("#summaryDocument"), {
      visitType: item.title,
      patient: "You",
      provider: `${item.provider}`,
      dateText: formatDay(item.date),
      timeText: formatClock(item.date),
      durationText: `${item.durationMin} minutes`,
      topics: written.topics || rawItem.todayTopics || "",
      discussion: written.discussion || fallbackNotes,
      nextSteps: written.nextSteps || "",
      followUp: rawItem.afterVisitSummary?.followUp || ""
    });

    setText("summarySendStatus", "", "");
    summaryReturn = "visits";
    showScreen("summaryView");
  }

  $("#summaryBack")?.addEventListener("click", () => {
    stopSpeaking();
    showScreen(summaryReturn);
  });
  $("#summaryRead")?.addEventListener("click", event =>
    BW.readSummaryAloud($("#summaryDocument"), event.currentTarget));
  $("#summaryPrint")?.addEventListener("click", () => window.print());
  $("#summaryPdf")?.addEventListener("click", () => {
    setText("summarySendStatus", 'In the print window, choose "Save as PDF" as the destination.', "");
    window.print();
  });
  $("#summarySend")?.addEventListener("click", () => {
    const who = state.extraNotes ? ` (${state.extraNotes})` : "";
    setText(
      "summarySendStatus",
      `Demonstration: a copy would be sent to your caregiver${who}. Nothing was actually sent.`,
      ""
    );
  });

  /* ---------- Focus mode ---------- */

  const focusButton = $("#focusButton");
  const exitFocusButton = $("#exitFocusButton");

  const fullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement;

  // Ask the browser for true full screen (hides tabs and the address bar).
  // If it says no, the page-level focus mode below still works.
  function setBrowserFullscreen(enabled) {
    try {
      const root = document.documentElement;

      if (enabled && !fullscreenElement()) {
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        request?.call(root)?.catch?.(() => {});
      } else if (!enabled && fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        exit?.call(document)?.catch?.(() => {});
      }
    } catch (error) {
      console.warn("Full screen is not available.", error);
    }
  }

  function setFocusMode(enabled) {
    appointmentScreen?.classList.toggle("focus-mode", enabled);
    focusButton?.setAttribute("aria-pressed", String(enabled));

    if (exitFocusButton) exitFocusButton.hidden = !enabled;
    if (enabled) panels.close();

    setBrowserFullscreen(enabled);
  }

  // Esc (or the browser leaving full screen) also leaves focus mode.
  ["fullscreenchange", "webkitfullscreenchange"].forEach(name => {
    document.addEventListener(name, () => {
      if (!fullscreenElement() &&
          appointmentScreen?.classList.contains("focus-mode")) {
        setFocusMode(false);
      }
    });
  });

  focusButton?.addEventListener("click", () => {
    setFocusMode(!appointmentScreen.classList.contains("focus-mode"));
  });

  exitFocusButton?.addEventListener("click", () => setFocusMode(false));

  /* ---------- Mute and camera ---------- */

  bindToggle($("#muteButton"), {
    label: "Mute",
    activeLabel: "Unmute",
    icon: "fa-microphone",
    activeIcon: "fa-microphone-slash",
    onChange: muted => {
      media.setAudioEnabled(!muted);
      const badge = $("#selfMuted");
      if (badge) badge.hidden = !muted;
      myMuted = muted;
      sendAv();
      if (!muted) toast("Your microphone is on.");
    }
  });

  bindToggle($("#cameraButton"), {
    label: "Turn camera off",
    activeLabel: "Turn camera on",
    icon: "fa-video",
    activeIcon: "fa-video-slash",
    onChange: off => {
      media.setVideoEnabled(!off);
      $(".call-stage", appointmentScreen)?.classList.toggle("camera-off", off);
      const selfOff = $(".self-off", appointmentScreen);
      if (selfOff) selfOff.hidden = !off;
      myCameraOff = off;
      sendAv();
    }
  });

  /* ---------- Live connection to the provider's device ---------- */

  const remoteVideo = $("#remoteVideo");
  const providerTile = $("#providerVideo");
  let summaryCollab = null;
  let myMuted = false;
  let myCameraOff = false;
  let remoteHasVideo = false;
  let remoteCameraOff = false;

  const providerShortName = () =>
    withVisitDefaults(currentAppointment() || {}).provider.replace(/^(Dr\.)\s+\S+\s+/, "$1 ");

  function paintLiveStatus() {
    summaryCollab?.setConnected(live.isConnected());
  }


  function profileForProvider() {
    // The communication profile the provider sees. Not the drawing or personal notes.
    const { drawing, visitNotes, nextSteps, ...shareable } = state;
    return shareable;
  }

  function sendHello() {
    const appointment = currentAppointment();
    live.send({
      type: "hello",
      role: "patient",
      name: BW.demo.patient.name,
      appointmentId: appointment?.id || null,
      profile: profileForProvider(),
      checkin: {
        mood: appointment?.todayMood || "",
        topics: appointment?.todayTopics || "",
        at: appointment?.checkinAt || ""
      },
      phase: appointment?.phase || "waiting",
      // True once the patient has checked in; false when the page is just open.
      present: Boolean(appointment?.patientPresent)
    });
  }

  function sendAv() {
    live.send({ type: "av", muted: myMuted, cameraOff: myCameraOff });
  }

  function startLive() {
    live.start("patient", {
      status: paintLiveStatus,
      open: () => {
        sendHello();
        paintLiveStatus();
        if (!appointmentScreen.hidden) {
          live.startCall();
          sendAv();
          if (summaryCollab) live.send(summaryCollab.full());
          if (drawingImage) sendDrawing();
        }
      },
      message: handleLiveMessage,
      close: () => {
        const appointment = currentAppointment();
        if (appointment && !appointmentScreen.hidden) {
          appointment.providerPresent = false;
          saveAppointments();
          updateProviderPresence();
          toast("Your provider left the call.");
        }
        paintLiveStatus();
      },
      stream: showRemoteStream,
      streamEnded: hideRemoteStream
    }, media);
    paintLiveStatus();
  }

  function showRemoteStream(stream) {
    if (!remoteVideo || !providerTile) return;
    remoteHasVideo = stream.getVideoTracks().length > 0;
    remoteVideo.srcObject = stream;
    remoteVideo.hidden = false;
    remoteVideo.play?.().catch(() => {});
    providerTile.classList.add("has-remote");
    $("#remoteTag").hidden = false;
    setText("remoteTagName", providerShortName(), "Your provider");
    applyRemoteAv();
  }

  function hideRemoteStream() {
    if (!remoteVideo || !providerTile) return;
    remoteVideo.srcObject = null;
    remoteVideo.hidden = true;
    providerTile.classList.remove("has-remote", "remote-cam-off");
    $("#remoteTag").hidden = true;
    const muted = $("#remoteMuted");
    if (muted) muted.hidden = true;
  }

  function applyRemoteAv() {
    providerTile?.classList.toggle("remote-cam-off", !remoteHasVideo || remoteCameraOff);
  }

  function handleLiveMessage(message) {
    const appointment = currentAppointment();

    switch (message.type) {
      case "admit":
        if (appointment) {
          appointment.providerPresent = true;
          saveAppointments();
        }
        if (!$("#waiting").hidden) admitSoon();
        else if (!appointmentScreen.hidden) updateProviderPresence();
        break;

      case "message":
        showMessage(callMessage, `${providerShortName()}: ${message.text}`);
        break;

      case "gesture":
        if (message.item) showGesture(callMessage, message.item);
        break;

      case "av": {
        remoteCameraOff = Boolean(message.cameraOff);
        const badge = $("#remoteMuted");
        if (badge) badge.hidden = !message.muted;
        applyRemoteAv();
        break;
      }

      case "summary":
      case "summary-full":
        if (summaryCollab?.receive(message)) saveSharedSummary();
        break;

      case "end":
        if (!appointmentScreen.hidden) finishVisit(true);
        break;

      default:
        break;
    }
  }

  /* ---------- Shared after-visit summary (written together during the call) ---------- */

  function saveSharedSummary() {
    const appointment = currentAppointment();
    if (!appointment || !summaryCollab) return;

    appointment.afterVisitSummary = {
      ...(appointment.afterVisitSummary || {}),
      ...summaryCollab.snapshot()
    };
    saveAppointments();
  }

  function mountSummary(appointment) {
    summaryCollab = collab.mount($("#summaryPanel"), {
      role: "patient",
      otherName: providerShortName(),
      getStored: () => appointment.afterVisitSummary,
      onChange: change => {
        live.send({ type: "summary", ...change });
        saveSharedSummary();
      }
    });

    summaryCollab.seed("visitTopics", appointment.todayTopics);
    summaryCollab.setConnected(live.isConnected());
  }

window.addEventListener("storage", event => {
  if (event.key === APPOINTMENTS_KEY || event.key === null) {
    appointments = loadAppointments();
    renderHomeDashboard();

    const visible = $$(".screen").find(screen => !screen.hidden)?.id;
    const appointment = currentAppointment();
    if (!appointment) return;

    if (visible === "waiting" && appointment.providerPresent) admitSoon();

    if (visible === "appointment") {
      const wasPresent = $("#callPillText")?.textContent === "Provider joined";
      updateProviderPresence();
      if (wasPresent && !appointment.providerPresent) toast("Your provider left the call.");
      if (!wasPresent && appointment.providerPresent) toast("Your provider joined the visit.");
    }
  }
});

  /* ---------- Start-up ---------- */

  loadState();
  appointments = loadAppointments();
  restoreForm();
  updateSummary();
  updateProvider();
  renderHomeDashboard();
  bindScreenNav();

  // Ensure a newly opened page starts on the home dashboard.
  showScreen("home");

  // Once the profile exists, stay reachable so the provider's view fills in
  // with this patient's details even before they join the waiting room.
  if (state.profileCompleted) startLive();

})();