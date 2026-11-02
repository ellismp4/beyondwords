/* =========================================================
   Provider page (provider.html)
   Depends on js/shared.js
   ========================================================= */

(() => {
  const {
    $, $$, readStore, writeStore, showScreen,
    bindScreenNav, initToolPanel, bindToggle, showMessage
  } = BW;

  const PATIENT_KEY = "BeyondWordsAphasia";
  const APPOINTMENTS_KEY = "BeyondWordsAppointments";
  const NOTES_KEY = "beyondWordsProviderNotes";
  const SUMMARY_KEY = "beyondWordsProviderDemoSummary";

  const callScreen = $("#call");
  let activeAppointmentId = null;

  /* ---------- Shared patient and appointment data ---------- */

  function getPatient() {
    return readStore(PATIENT_KEY, {}) || {};
  }

  function getAppointments() {
    const saved = readStore(APPOINTMENTS_KEY, []);
    return Array.isArray(saved) ? saved : [];
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

  function setText(id, value, fallback = "Not provided") {
    const element = document.getElementById(id);
    if (element) element.textContent = value || fallback;
  }

  /* ---------- Communication preference labels ---------- */

  const METHOD_LABELS = {
    "Speaking": "Speaking",
    "Writing or typing": "Writing or typing",
    "Pictures or symbols": "Pictures or symbols",
    "Gestures or drawing": "Gestures or drawing",
    "Extra time": "Extra time to respond",
    "Support person": "Having a support person involved"
  };

  const METHOD_TIPS = {
    "Speaking": "Speak directly with the patient using short, clear sentences.",
    "Writing or typing": "Offer a way to write or type a reply.",
    "Pictures or symbols": "Use pictures or symbols alongside speech.",
    "Gestures or drawing": "Welcome gestures and drawing as answers.",
    "Extra time": "Allow extra time for the patient to respond.",
    "Support person": "Include the support person in the way the patient requested."
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
    const methods = Array.isArray(saved.methods) ? saved.methods : [];
    const recipients = Array.isArray(saved.summaryRecipients)
      ? saved.summaryRecipients
      : [];

    const completed = Boolean(
      saved.profileCompleted || methods.length || saved.caregiver
    );

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
    }
  });

  /* ---------- Call screen ---------- */

  const panels = initToolPanel(callScreen);

  $("#callHelp")?.addEventListener("click", () => {
    panels.open("support");
  });

  $("#providerShowMessage")?.addEventListener("click", () => {
    showMessage(
      $("#providerMessagePreview"),
      $("#providerMessage")?.value.trim()
    );
  });

  bindToggle($("#muteButton"), {
    label: "Mute",
    activeLabel: "Unmute",
    icon: "fa-microphone",
    activeIcon: "fa-microphone-slash"
  });

  bindToggle($("#cameraButton"), {
    label: "Turn camera off",
    activeLabel: "Turn camera on",
    icon: "fa-video",
    activeIcon: "fa-video-slash",
    onChange: off => {
      $(".call-stage", callScreen)?.classList.toggle("camera-off", off);
    }
  });

  $("#endCallButton")?.addEventListener("click", () => {
    panels.close();
    showScreen("dashboard");
  });

  /* ---------- Provider visit notes ---------- */

  const visitNotes = $("#providerVisitNotes");

  if (visitNotes) {
    visitNotes.value = readStore(NOTES_KEY, "");

    visitNotes.addEventListener("input", () => {
      writeStore(NOTES_KEY, visitNotes.value);
    });
  }

  /* ---------- After-visit summary ---------- */

  const summaryFields = [
    "visitTopics",
    "visitDiscussion",
    "visitNextSteps",
    "visitQuestions",
    "providerNotes"
  ];

  const statusField = $("#reviewStatus");
  const statusMessage = $("#summaryStatus");

  function say(message) {
    if (statusMessage) statusMessage.textContent = message;
  }

  function getSummaryData() {
    const data = {};

    summaryFields.forEach(id => {
      const field = $(`#${id}`);
      data[id] = field?.value || "";
    });

    if (statusField) data.reviewStatus = statusField.value;

    return data;
  }

  function fillSummary(data) {
    summaryFields.forEach(id => {
      const field = $(`#${id}`);
      if (field && typeof data?.[id] === "string") {
        field.value = data[id];
      }
    });

    if (statusField && data?.reviewStatus) {
      statusField.value = data.reviewStatus;
    }
  }

  function loadSummaryForAppointment() {
    const appointment = getActiveAppointment();
    const savedDraft = readStore(SUMMARY_KEY, null);

    if (appointment?.afterVisitSummary) {
      fillSummary(appointment.afterVisitSummary);
    } else if (savedDraft) {
      fillSummary(savedDraft);
    }

    const patientTopics = appointment?.todayTopics || "";

    const topicsField = $("#visitTopics");
    if (topicsField && !topicsField.value.trim() && patientTopics) {
      topicsField.value = patientTopics;
    }
  }

  function saveSummaryToAppointment(summary) {
    const appointments = getAppointments();
    const appointment = appointments.find(
      item => item.id === activeAppointmentId
    );

    if (!appointment) return false;

    appointment.afterVisitSummary = summary;
    appointment.summary = [
      summary.visitTopics,
      summary.visitDiscussion,
      summary.visitNextSteps,
      summary.visitQuestions
    ].filter(Boolean).join("\n\n");

    appointment.status = "completed";
    appointment.completedAt = appointment.completedAt || new Date().toISOString();

    saveAppointments(appointments);
    return true;
  }

  $("#saveDraft")?.addEventListener("click", () => {
    const summary = getSummaryData();

    writeStore(SUMMARY_KEY, summary);
    saveSummaryToAppointment(summary);

    say("Summary draft saved in this browser.");
  });

  $("#summaryForm")?.addEventListener("submit", event => {
    event.preventDefault();

    const summary = getSummaryData();
    writeStore(SUMMARY_KEY, summary);
    saveSummaryToAppointment(summary);

    const labels = {
      draft: "Draft saved.",
      reviewing: "Ready to review together.",
      confirmed: "Marked as reviewed with the patient."
    };

    say(
      statusField
        ? labels[statusField.value] || "Summary updated."
        : "Summary updated."
    );
  });

  $("#readSummary")?.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      say("Read-aloud is not supported in this browser.");
      return;
    }

    const labels = [
      ["What we talked about", "visitTopics"],
      ["What we discussed", "visitDiscussion"],
      ["My next steps", "visitNextSteps"],
      ["Questions or things I still need help with", "visitQuestions"]
    ];

    const spokenText = labels
      .map(([label, id]) => `${label}. ${$(`#${id}`)?.value || ""}`)
      .join(". ");

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = 0.85;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    say("Reading the summary aloud.");
  });

  $("#printSummary")?.addEventListener("click", () => {
    window.print();
  });

  /* ---------- Start-up ---------- */

  activeAppointmentId = getActiveAppointment()?.id || null;
  renderPatient();
  loadSummaryForAppointment();
})();
