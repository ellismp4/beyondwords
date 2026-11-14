/* =========================================================
   Provider page (provider.html)
   Depends on js/shared.js
   ========================================================= */

(() => {
  const {
    $, $$, readStore, writeStore, showScreen: showScreenRaw,
    bindScreenNav, initToolPanel, bindToggle, showMessage,
    speak, stopSpeaking, isSpeakingFor, canSpeak,
    featuresForMethods, normalizeMethods, applyFeatures, initGestureBank, showGesture,
    withVisitDefaults, formatDay, formatClock, media, createClock,
    initConnection, initDeviceCheck, loadAppointments, renderSummaryDocument
  } = BW;

  const { live, collab } = BW;

  const PATIENT_KEY = "BeyondWordsAphasia";
  const REMOTE_KEY = "BeyondWordsRemotePatient";
  const APPOINTMENTS_KEY = "BeyondWordsAppointments";
  const NOTES_KEY = "beyondWordsProviderNotes";
  const SUMMARY_KEY = "beyondWordsProviderDemoSummary";

  const callScreen = $("#call");
  let activeAppointmentId = null;

  /* ---------- Shared patient and appointment data ---------- */

  // The patient's profile: what their device sent, else this browser's copy,
  // else the pre-made demo patient (Demo patient).
  const getRemote = () => readStore(REMOTE_KEY, null);

  function getPatient() {
    const remote = getRemote()?.profile;
    const local = readStore(PATIENT_KEY, null);
    const hasLocal = local && Object.keys(local).length > 0;

    // Live connection first, then this browser's copy (same computer),
    // then the last profile a patient device sent, then the demo patient.
    if (live.isConnected() && remote) return remote;
    return (hasLocal && local) || remote || BW.demo.patient.profile;
  }

  const patientName = () => BW.demo.patient.name;
  const patientFirst = () => patientName().split(/\s+/)[0];
  const providerName = () => BW.demo.provider.name;

  let alertTimer;
  function alertProvider(text) {
    const box = $("#providerAlert");
    if (!box) return;
    showMessage(box, text);
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => showMessage(box, ""), 7000);
  }

  // The same shared list the patient page uses.
  function getAppointments() {
    return loadAppointments();
  }

  function saveAppointments(items) {
    writeStore(APPOINTMENTS_KEY, items);
  }

  function getActiveAppointment() {
    const appointments = getAppointments();

    return appointments.find(item => item.id === activeAppointmentId) ||
      appointments.find(item => item.status === "upcoming") ||
      appointments[0] ||
      null;
  }

  function formatDate(value) {
    if (!value) return "Date to be confirmed";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date to be confirmed";

    return date.toLocaleString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function showScreen(id) {
    showScreenRaw(id);
    $$("[data-nav-current]").forEach(link => {
      if (link.dataset.navCurrent === id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function setText(id, value, fallback = "Not provided") {
    const element = document.getElementById(id);
    if (element) element.textContent = value || fallback;
  }

  /* ---------- Communication preference labels ---------- */

  const METHOD_LABELS = {
    "Speaking": "Speaking",
    "Writing or typing": "Writing or typing",
    "Drawing": "Drawing",
    "Gestures": "Gestures",
    "Extra time": "Extra time to respond",
    "Support person": "Having a support person involved",
    "Text to speech": "Text to speech (hearing typed messages read aloud)"
  };

  const METHOD_TIPS = {
    "Speaking": "Speak directly with the patient using short, clear sentences.",
    "Writing or typing": "Offer a way to write or type a reply.",
    "Drawing": "Welcome drawing as a way to answer.",
    "Gestures": "Use the gestures tool to show pictures, and watch for the patient's picks.",
    "Extra time": "Allow extra time for the patient to respond.",
    "Support person": "Include the support person in the way the patient requested.",
    "Text to speech": "Typed messages can be read aloud, so you can type and let the voice speak."
  };

  const CAREGIVER_TEXT = {
    None: "The patient would like to take part on their own, without caregiver help.",
    Some: "A caregiver may help when the patient asks for it.",
    Throughout: "The patient would like their caregiver to help throughout the visit."
  };

  const RECIPIENT_TEXT = {
    Me: "sent to the patient",
    Caregiver: "sent to their caregiver",
    Both: "sent to the patient and their caregiver"
  };

  function fillList(list, items, emptyText) {
    if (!list) return;

    list.replaceChildren();

    (items.length ? items : [emptyText]).forEach(value => {
      const li = document.createElement("li");
      const icon = document.createElement("i");
      const span = document.createElement("span");

      icon.className = "fa-solid fa-check";
      icon.setAttribute("aria-hidden", "true");
      span.textContent = value;

      li.append(icon, span);
      list.append(li);
    });
  }

  /* ---------- Patient overview ---------- */

  function renderPatient() {
    const saved = getPatient();
    const methods = normalizeMethods(saved.methods);
    const recipients = Array.isArray(saved.summaryRecipients)
      ? saved.summaryRecipients
      : [];

    const completed = Boolean(
      saved.profileCompleted || methods.length || saved.caregiver
    );

    const visitItem = getActiveAppointment();
    setText(
      "patientVisitTime",
      visitItem
        ? `${formatDay(visitItem.date)} at ${formatClock(visitItem.date)}`
        : "No visit scheduled",
      ""
    );
    setText("patientName", patientName(), "");
    setText("dashPatientName", patientName(), "");
    setText(
      "patientStatus",
      completed
        ? "Patient communication profile is available."
        : "Waiting for the patient to complete their profile."
    );

    fillList(
      $("#patientMethods"),
      methods.map(method => METHOD_LABELS[method] || method),
      "No communication methods selected yet."
    );

    const tips = methods.map(method => METHOD_TIPS[method]).filter(Boolean);

    if (CAREGIVER_TEXT[saved.caregiver]) {
      tips.push(CAREGIVER_TEXT[saved.caregiver]);
    }

    if (saved.extraNotes) {
      tips.push(`Support person joining: ${saved.extraNotes}.`);
    }

    if (completed) tips.push("Check understanding respectfully.");

    fillList(
      $("#patientSupport"),
      tips,
      "Support suggestions will appear once the patient completes their profile."
    );

    setText(
      "patientCaregiver",
      CAREGIVER_TEXT[saved.caregiver] || "Not answered"
    );

    const summaryPreference =
      saved.wantsSummary === "Yes"
        ? `Would like a visit summary${RECIPIENT_TEXT[recipients[0]]
            ? `, ${RECIPIENT_TEXT[recipients[0]]}`
            : ""}.`
        : saved.wantsSummary === "No"
          ? "Does not want a visit summary."
          : "Not answered";

    setText("patientSummaryPref", summaryPreference);

    renderCurrentCheckin();

    // Never touch the open call tools while a visit is going on.
    if ($("#call").hidden) applyCallFeatures();
  }

  function renderCurrentCheckin() {
    const appointment = getActiveAppointment();

    setText(
      "patientMood",
      appointment?.todayMood
        ? `${appointment.todayMood} today.`
        : "The patient has not submitted today's check-in yet."
    );

    setText(
      "patientTodayTopics",
      appointment?.todayTopics || "The patient has not added discussion topics yet."
    );

    setText(
      "patientCheckinDate",
      appointment?.checkinAt
        ? `Submitted ${formatDate(appointment.checkinAt)}`
        : "No check-in submitted yet."
    );

    setText(
      "patientAppointmentDate",
      appointment?.date ? formatDate(appointment.date) : "No appointment selected."
    );
  }

  /* ---------- Dashboard numbers and status chip ---------- */

  const STATUS_CHIPS = {
    scheduled: ["Scheduled", "fa-calendar"],
    "checked-in": ["Checked in", "fa-circle-check"],
    waiting: ["Waiting", "fa-hourglass-half"],
    "in-visit": ["In visit", "fa-video"],
    completed: ["Completed", "fa-check-double"]
  };

  const phaseOf = item =>
    item.status === "completed" ? "completed" : (item.phase || "scheduled");

function renderDashboard() {
  const now = new Date();
  const today = now.toDateString();

  const items = getAppointments().filter(item =>
    item.status !== "cancelled"
  );

  // Everything on today's schedule: this visit, plus the visits already
  // completed today that are listed below.
  const todayItems = items.filter(item =>
    new Date(item.date).toDateString() === today ||
    (item.completedAt && new Date(item.completedAt).toDateString() === today)
  );

  const sampleToday = SAMPLE_COMPLETED.filter(item =>
    new Date(item.date).toDateString() === today
  ).length;

  setText("metricToday", String(todayItems.length + sampleToday), "0");

  // Patients waiting right now
  setText("metricWaiting", String(
    todayItems.filter(item => phaseOf(item) === "waiting").length
  ), "0");

  // The next visit that has not happened yet (earliest first)
  const nextToday = todayItems
    .filter(item => phaseOf(item) !== "completed" && item.status !== "completed")
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  setText(
    "metricNext",
    nextToday ? formatClock(nextToday.date) : "--"
  );

  // Update upcoming appointment card
  $("#dashCard")?.classList.toggle("is-empty", !nextToday);
  const dashEmpty = $("#dashEmpty");
  if (dashEmpty) dashEmpty.hidden = Boolean(nextToday);

  if (nextToday) {
    const visit = withVisitDefaults(nextToday);
    const isToday = new Date(nextToday.date).toDateString() === today;
    setText(
      "nextVisitLine",
      `Your visit with ${patientName()} is ${isToday ? "today" : "on " + formatDay(nextToday.date)} at ${formatClock(nextToday.date)}`,
      ""
    );
    setText("callVisitTimeText", `Visit ${formatClock(nextToday.date)}`, "");
    setText("dashDay", isToday ? "Today" : formatDay(nextToday.date), "");
    setText(
      "dashTime",
      `${formatClock(nextToday.date)} · ${visit.durationMin} minutes`
    );

    const chip = $("#dashStatus");

    if (chip) {
      const phase = phaseOf(nextToday);
      const [label, icon] =
        STATUS_CHIPS[phase] || STATUS_CHIPS.scheduled;

      chip.className = `status-chip status-${phase}`;
      chip.replaceChildren();

      const i = document.createElement("i");
      i.className = `fa-solid ${icon}`;
      i.setAttribute("aria-hidden", "true");

      chip.append(i, document.createTextNode(` ${label}`));
    }
  } else {
    setText("dashTime", "", "");
    setText("nextVisitLine", "No upcoming appointments.", "");

    const chip = $("#dashStatus");

    if (chip) {
      chip.className = "status-chip";
      chip.textContent = "No upcoming visits";
    }
  }
}

  const daysAgo = (days, hour, minute) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  const SAMPLE_COMPLETED = [
    { name: "Sample patient A", type: "Video follow-up", date: daysAgo(0, 9, 0), minutes: 28,
      review: "Reviewed with the patient", afterVisitSummary: {
        visitTopics: "Managing daily routines and communicating needs.",
        visitDiscussion: "We discussed giving the patient more time to respond and using written choices when helpful.",
        visitNextSteps: "Practice using a short written checklist before the next visit.",
      } },
    { name: "Sample patient B", type: "Video intake", date: daysAgo(1, 15, 30), minutes: 42,
      review: "Summary draft", afterVisitSummary: {
        visitTopics: "Getting comfortable with virtual appointments.",
        visitDiscussion: "We reviewed preferred ways to communicate and how to pause when more time is needed.",
        visitNextSteps: "Try the drawing and typing tools during the next visit.",
      } },
    { name: "Sample patient C", type: "Video follow-up", date: daysAgo(3, 10, 0), minutes: 25,
      review: "Reviewed with the patient", afterVisitSummary: {
        visitTopics: "Progress since the previous appointment.",
        visitDiscussion: "We discussed what has been working well and where additional support may be useful.",
        visitNextSteps: "Continue with the strategies discussed during the visit.",
      } }
  ];

  function completedRow(row) {
    const item = document.createElement("div");
    item.className = "completed-row";
    item.setAttribute("role", "listitem");
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.flexWrap = "wrap";
    item.style.gap = "16px";

    const when = document.createElement("div");
    when.className = "schedule-when";
    when.style.flex = "0 1 140px";
    const day = document.createElement("strong");
    day.textContent = formatDay(row.date).replace(/, \d{4}$/, "");
    const time = document.createElement("span");
    time.className = "muted";
    time.textContent = `${formatClock(row.date)} · ${row.minutes} min`;
    when.append(day, time);

    const who = document.createElement("div");
    who.className = "schedule-who";
    who.style.flex = "1 1 180px";
    const name = document.createElement("strong");
    name.textContent = row.name;
    const type = document.createElement("span");
    type.className = "muted";
    type.textContent = row.type;
    who.append(name, type);

    const status = document.createElement("div");
    status.className = "schedule-status";
    status.style.flex = "1 1 150px";
    const chip = document.createElement("span");
    chip.className = "status-chip status-completed";
    chip.innerHTML = '<i class="fa-solid fa-check-double" aria-hidden="true"></i> Completed';
    const review = document.createElement("span");
    review.className = "muted";
    review.textContent = row.review;
    status.append(chip, review);

    const reviewButton = document.createElement("button");
    reviewButton.type = "button";
    reviewButton.className = "button button-small button-secondary";
    reviewButton.textContent = row.afterVisitSummary ? "Review summary" : "No summary yet";
    reviewButton.disabled = !row.afterVisitSummary;
    reviewButton.style.marginLeft = "auto";
    if (row.afterVisitSummary) {
      reviewButton.addEventListener("click", () => openCompletedSummary(row));
    }

    item.append(when, who, status, reviewButton);
    return item;
  }
function renderCompleted() {
  const list = $("#completedList");
  if (!list) return;

  const today = new Date().toDateString();

  const real = getAppointments()
    .filter(item => item.status === "completed")
    .map(item => ({
      id: item.id,
      name: patientName(),
      type: withVisitDefaults(item).visitType,
      date: item.completedAt || item.date,
      minutes: withVisitDefaults(item).durationMin,
      review: item.afterVisitSummary ? "Summary written" : "No summary yet",
      afterVisitSummary: item.afterVisitSummary || null
    }))
    // Only show appointments completed today
    .filter(item => new Date(item.date).toDateString() === today);

  const sampleRows = SAMPLE_COMPLETED
    .filter(item => new Date(item.date).toDateString() === today)
    .map(item => ({ ...item, sample: true }));

  const rows = [...real, ...sampleRows]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  list.replaceChildren(...rows.map(completedRow));

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No completed appointments today.";
    list.append(empty);
  }
}

  function openCompletedSummary(row) {
    const summary = row.afterVisitSummary || {};
    const visit = withVisitDefaults({ date: row.date, durationMin: row.minutes });

    renderSummaryDocument($("#summaryDocument"), {
      visitType: row.type,
      patient: row.name,
      provider: visit.provider,
      dateText: formatDay(row.date),
      timeText: formatClock(row.date),
      durationText: `${row.minutes} minutes`,
      topics: summary.visitTopics || "",
      discussion: summary.visitDiscussion || "",
      nextSteps: summary.visitNextSteps || "",
      followUp: summary.followUp || ""
    });

    setText("reviewStatusNote", "", "");
    showScreen("summaryReview");
  }

  $("#reviewRead")?.addEventListener("click", event =>
    BW.readSummaryAloud($("#summaryDocument"), event.currentTarget));
  $("#reviewPrint")?.addEventListener("click", () => window.print());
  $("#reviewPdf")?.addEventListener("click", () => {
    setText("reviewStatusNote", 'In the print window, choose "Save as PDF" as the destination.', "");
    window.print();
  });

  $("#summaryReviewBack")?.addEventListener("click", () => {
    stopSpeaking();
    showScreen("dashboard");
  });

    /* ---------- Navigation ---------- */

  bindScreenNav();

  document.querySelectorAll('[data-go="patient"]').forEach(button => {
    button.addEventListener("click", () => {
      activeAppointmentId = getActiveAppointment()?.id || null;
      renderPatient();
    });
  });

  document.querySelectorAll('[data-go="call"]').forEach(button => {
    button.addEventListener("click", () => {
      activeAppointmentId = getActiveAppointment()?.id || null;
    });
  });

  window.addEventListener("storage", event => {
    if (
      event.key === PATIENT_KEY ||
      event.key === APPOINTMENTS_KEY ||
      event.key === null
    ) {
      renderPatient();
      renderDashboard();
      renderCompleted();
      if (!$("#call").hidden) updatePatientPresence(true);
    }
  });

  /* ---------- Call screen ---------- */

  const panels = initToolPanel(callScreen);

  const callMessage = $("#callMessage");
  let callFeatures = new Set();
  let troubleshootReturn = "dashboard";

  // Show only the tools the patient chose in their profile.
  // Before the patient finishes a profile, show every tool for the demo.
  function applyCallFeatures() {
    const saved = getPatient();
    const methods = normalizeMethods(saved.methods);
    const completed = Boolean(saved.profileCompleted || methods.length);

    callFeatures = completed
      ? featuresForMethods(methods)
      : new Set(["message", "gesture", "tts"]);

    applyFeatures(callScreen, callFeatures);
    panels.close();
  }

  function updateAppointment(change) {
    const items = getAppointments();
    const item = items.find(entry => entry.id === activeAppointmentId);
    if (!item) return null;
    Object.assign(item, change);
    saveAppointments(items);
    return item;
  }

  /* ---------- Join flow and call chrome ---------- */

  const callClock = createClock($("#callTimer"));
  initConnection(callScreen);

  const callPill = $("#callPill");
  const callToast = $("#callToast");
  const selfVideo = $("#selfVideo");
  let toastTimer;
  let lastPatientPresent = null;

  function toast(text) {
    if (!callToast) return;
    callToast.textContent = text;
    callToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { callToast.hidden = true; }, 5000);
  }

  function updatePatientPresence(announce = false) {
    const appointment = getActiveAppointment();
    const present = Boolean(appointment?.patientPresent) &&
      ["waiting", "in-visit"].includes(appointment?.phase);

    if (callPill) {
      callPill.dataset.state = present ? "live" : "waiting";
      setText("callPillText", present
        ? (appointment.phase === "in-visit" ? "Patient joined" : "Patient in waiting room")
        : "Waiting for patient", "");
    }

    setText("callPatientName", present ? patientName() : "Waiting for your patient", "");
    setText(
      "callPatientNote",
      present ? "Aphasia communication support" : "The patient will appear here when they join.",
      ""
    );

    if (announce && lastPatientPresent !== null && present !== lastPatientPresent) {
      toast(present ? "Your patient joined." : "Your patient left the call.");
    }

    lastPatientPresent = present;
  }

  const deviceCheck = initDeviceCheck({
    onContinue: enterCall,
    onBack: () => { renderPatient(); showScreen("patient"); }
  });

  $("#providerJoin")?.addEventListener("click", () => {
    activeAppointmentId = getActiveAppointment()?.id || null;
    deviceCheck.enter();
    showScreen("devicecheck");
  });

  function enterCall() {
    updateAppointment({ providerPresent: true });
    applyCallFeatures();
    mountSummary();

    media.attach(selfVideo);
    const hasVideo = media.hasVideo();
    selfVideo.hidden = !hasVideo;
    $(".self-avatar", callScreen).hidden = hasVideo;

    lastPatientPresent = null;
    updatePatientPresence();
    callClock.start();
    showScreen("call");
    toast("You joined the visit.");
    renderDashboard();

    // Let the patient in (if they are on another device) and start the video call.
    if (live.isConnected()) {
      live.send({ type: "admit" });
      sendAv();
      live.send(summaryCollab.full());
    }
  }

  /* ---------- Troubleshooting ---------- */

  function openTroubleshooting(returnTo) {
    troubleshootReturn = returnTo || "dashboard";

    const label = $("#troubleshootBackLabel");
    if (label) {
      label.textContent = troubleshootReturn === "call"
        ? "Back to the call"
        : "Go back";
    }

    stopSpeaking();
    setText("soundTestStatus", "", "");
    showScreen("troubleshoot");
  }

  $("#callHelp")?.addEventListener("click", () => {
    panels.close();
    openTroubleshooting("call");
  });

  // Home tab in the header: back to the dashboard (not during a live call).
  $("#providerHomeNav")?.addEventListener("click", () => {
    if (!callScreen.hidden) {
      toast("Use End call to leave the visit.");
      return;
    }
    stopSpeaking();
    renderDashboard();
    showScreen("dashboard");
  });

  $$("[data-open-troubleshoot]").forEach(button => {
    button.addEventListener("click", () => {
      const current = $$(".screen").find(screen => !screen.hidden)?.id;
      openTroubleshooting(
        current === "troubleshoot" ? troubleshootReturn : current
      );
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

  /* ---------- Messages, text to speech and gestures ---------- */

  $("#providerShowMessage")?.addEventListener("click", () => {
    const text = $("#providerMessage")?.value.trim();
    showMessage($("#providerMessagePreview"), text);
    showMessage(callMessage, text);
    if (text) live.send({ type: "message", text });
  });

  $("#providerReadAloud")?.addEventListener("click", () => {
    const readButton = $("#providerReadAloud");
    if (isSpeakingFor(readButton)) {
      stopSpeaking();
      setText("providerSpeechStatus", "", "");
      return;
    }
    const text = $("#providerMessage")?.value.trim();
    const rate = Number($("#providerSpeed")?.value) || 0.9;

    if (!canSpeak()) {
      setText("providerSpeechStatus", "Read-aloud is not supported in this browser.", "");
    } else if (!text) {
      setText("providerSpeechStatus", "Type a message first, then press Read aloud.", "");
    } else {
      showMessage($("#providerMessagePreview"), text);
      showMessage(callMessage, text);
      live.send({ type: "message", text });
      speak(text, { rate, button: readButton });
      setText("providerSpeechStatus", "Reading your message aloud.", "");
    }
  });

  const PROVIDER_GESTURES = [
    { label: "Yes", icon: "fa-thumbs-up" },
    { label: "No", icon: "fa-thumbs-down" },
    { label: "Take your time", icon: "fa-hourglass-half" },
    { label: "Show me", icon: "fa-hand-point-up", say: "Can you show me?" },
    { label: "Point to it", icon: "fa-hand-point-right", say: "Please point to it" },
    { label: "Do you understand?", icon: "fa-circle-question" },
    { label: "I will repeat", icon: "fa-rotate-right", say: "I will say that again" },
    { label: "Draw it", icon: "fa-pen", say: "Can you draw it?" },
    { label: "Does it hurt?", icon: "fa-heart-pulse" },
    { label: "Let's take a break", icon: "fa-mug-hot" },
    { label: "Good job", icon: "fa-star" },
    { label: "Thank you", icon: "fa-heart" }
  ];

  initGestureBank($("#providerGestureBank"), PROVIDER_GESTURES, item => {
    showGesture(callMessage, item);
    live.send({ type: "gesture", item: { label: item.label, icon: item.icon } });

    if (callFeatures.has("tts")) {
      speak(item.say || item.label, {
        rate: Number($("#providerSpeed")?.value) || 0.9
      });
    }
  });

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
      $(".call-stage", callScreen)?.classList.toggle("camera-off", off);
      const selfOff = $(".self-off", callScreen);
      if (selfOff) selfOff.hidden = !off;
      myCameraOff = off;
      sendAv();
    }
  });

  $("#endCallButton")?.addEventListener("click", () => {
    panels.close();
    stopSpeaking();
    showMessage(callMessage, "");
    callClock.stop();
    media.stop();
    if (selfVideo) selfVideo.srcObject = null;
    hideRemoteStream();

    // Close out the visit with whatever was written together.
    const appointment = getActiveAppointment();
    const written = summaryCollab ? summaryCollab.snapshot() : (appointment?.afterVisitSummary || {});
    const summary = {
      ...(appointment?.afterVisitSummary || {}),
      ...written
    };

    live.send({ type: "end" });

    updateAppointment({
      providerPresent: false,
      patientPresent: false,
      status: "completed",
      phase: "completed",
      completedAt: new Date().toISOString(),
      afterVisitSummary: summary,
      summary: [
        summary.visitTopics, summary.visitDiscussion,
        summary.visitNextSteps
      ].filter(Boolean).join("\n\n")
    });

    summaryCollab = null;
    BW.addFollowUpVisit(getAppointments().find(item => item.id === activeAppointmentId));
    showRemoteDrawing("");
    renderDashboard();
    renderCompleted();
    showScreen("dashboard");
    alertProvider("Visit ended. You can review the summary under Completed visits.");

    // Stay reachable for the next patient.
    setTimeout(startLive, 600);
  });

  /* ---------- Provider visit notes ---------- */

  const visitNotes = $("#providerVisitNotes");

  if (visitNotes) {
    visitNotes.value = readStore(NOTES_KEY, "");

    visitNotes.addEventListener("input", () => {
      writeStore(NOTES_KEY, visitNotes.value);
    });
  }
  /* ---------- Live connection and shared summary ---------- */

  const remoteVideo = $("#remoteVideo");
  const providerTile = $("#providerVideo");
  let summaryCollab = null;
  let myMuted = false;
  let myCameraOff = false;
  let remoteHasVideo = false;
  let remoteCameraOff = false;

  function paintLiveStatus() {
    summaryCollab?.setConnected(live.isConnected());
  }


  function sendAv() {
    live.send({ type: "av", muted: myMuted, cameraOff: myCameraOff });
  }

  function startLive() {
    live.start("provider", {
      status: paintLiveStatus,
      open: () => {
        live.send({ type: "hello", role: "provider", name: providerName() });
        paintLiveStatus();
        if (!callScreen.hidden) {
          live.send({ type: "admit" });
          sendAv();
          if (summaryCollab) live.send(summaryCollab.full());
        }
      },
      message: handleLiveMessage,
      close: () => patientGone("Your patient disconnected."),
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
    setText("remoteTagName", patientName(), "Your patient");
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

  function patientGone(text) {
    const appointment = getActiveAppointment();
    if (appointment && appointment.status !== "completed") {
      updateAppointment({ patientPresent: false, phase: "scheduled" });
    }
    renderDashboard();
    renderPatient();
    updatePatientPresence(true);
    if (!callScreen.hidden) toast(text); else alertProvider(text);
  }

  function applyPatientHello(message) {
    writeStore(REMOTE_KEY, {
      name: message.name || "Patient",
      profile: message.profile || {},
      at: Date.now()
    });

    const items = getAppointments();
    const target = items.find(item => item.id === message.appointmentId) ||
      items.find(item => item.id === activeAppointmentId) ||
      items.find(item => item.status === "upcoming");

    if (target) {
      activeAppointmentId = target.id;
      if (message.present) {
        Object.assign(target, {
          patientPresent: true,
          phase: callScreen.hidden ? "waiting" : "in-visit",
          todayMood: message.checkin?.mood || target.todayMood,
          todayTopics: message.checkin?.topics || target.todayTopics,
          checkinAt: message.checkin?.at || target.checkinAt
        });
        saveAppointments(items);
      }
    }

    renderPatient();
    renderDashboard();

    // Only profile details so far: the patient's device is open but not in the waiting room.
    if (!message.present) return;

    if (callScreen.hidden) {
      alertProvider(`${patientFirst()} is in the waiting room. Open Review patient, then Join visit.`);
    } else {
      live.send({ type: "admit" });
      updatePatientPresence(true);
    }
  }

  function handleLiveMessage(message) {
    switch (message.type) {
      case "hello":
        if (message.role === "patient") applyPatientHello(message);
        break;

      case "presence":
        updateAppointment({
          patientPresent: message.phase !== "scheduled",
          phase: message.phase
        });
        renderDashboard();
        updatePatientPresence(true);
        break;

      case "message":
        showMessage(callMessage, `${patientFirst()}: ${message.text}`);
        break;

      case "gesture":
        if (message.item) showGesture(callMessage, message.item);
        break;

      case "drawing":
        showRemoteDrawing(message.image);
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

      case "left":
        patientGone("Your patient left the call.");
        break;

      default:
        break;
    }
  }

  // The patient's drawing, shown in its own panel during the call.
  function showRemoteDrawing(image) {
    const img = $("#remoteDrawing");
    const empty = $("#remoteDrawingEmpty");
    if (!img || !empty) return;

    const hasImage = typeof image === "string" && image.startsWith("data:image/");
    img.hidden = !hasImage;
    empty.hidden = hasImage;
    if (hasImage) img.src = image; else img.removeAttribute("src");

    if (!hasImage || callScreen.hidden) return;
    toast(`${patientFirst()} is drawing. Open "Patient drawing" to see it.`);
    if (!$$(".call-panel-content", callScreen).some(panel => !panel.hidden)) {
      $('[data-tool="drawing"]', callScreen)?.click();
    }
  }

  function saveSharedSummary() {
    const appointment = getActiveAppointment();
    if (!appointment || !summaryCollab) return;

    const previous = appointment.afterVisitSummary || {};
    updateAppointment({
      afterVisitSummary: {
        ...previous,
        ...summaryCollab.snapshot()
      }
    });
  }

  function mountSummary() {
    const appointment = getActiveAppointment();

    summaryCollab = collab.mount($("#summaryPanel"), {
      role: "provider",
      otherName: patientFirst(),
      getStored: () => appointment?.afterVisitSummary,
      onChange: change => {
        live.send({ type: "summary", ...change });
        saveSharedSummary();
      }
    });

    summaryCollab.seed("visitTopics", appointment?.todayTopics);
    summaryCollab.setConnected(live.isConnected());
  }

  $("#providerResetDemo")?.addEventListener("click", () => {
    if (!confirm("Reset the demo visit so it can be run again?")) return;
    live.stop();
    localStorage.removeItem(APPOINTMENTS_KEY);
    localStorage.removeItem(REMOTE_KEY);
    localStorage.removeItem(SUMMARY_KEY);
    location.reload();
  });

  /* ---------- Start-up ---------- */
  activeAppointmentId = getActiveAppointment()?.id || null;
  renderPatient();
  renderDashboard();
  renderCompleted();

  startLive();
})();