/* =========================================================
   Patient page (index.html)
   Depends on js/shared.js
   ========================================================= */

(() => {
  const {
    $, $$, readStore, writeStore, showScreen,
    bindScreenNav, initToolPanel, bindToggle, showMessage
  } = BW;

  const STORAGE_KEY = "BeyondWordsAphasia";
  const APPOINTMENTS_KEY = "BeyondWordsAppointments";

  const makeDemoDate = (daysFromToday, hour = 10, minute = 30) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  const DEMO_APPOINTMENTS = [
    {
      id: "demo-upcoming-1",
      title: "Follow-up Appointment",
      provider: "Dr. Taylor Morgan",
      date: makeDemoDate(2, 10, 30),
      status: "upcoming",
      demo: true
    },
    {
      id: "demo-past-1",
      title: "Intake Appointment",
      provider: "Dr. Taylor Morgan",
      date: makeDemoDate(-14, 11, 0),
      completedAt: makeDemoDate(-14, 11, 45),
      status: "completed",
      summary: "This will have a button to access/download the after-visit summary later.",
      demo: true
    }
  ];

  let state = {};
  let appointments = [];
  let activeAppointmentId = null;

  const form = $("#prepareForm");
  const checkinForm = $("#checkinForm");
  const appointmentScreen = $("#appointment");
  const callMessage = $("#callMessage");

  /* ---------- Storage and demo data ---------- */
function loadAppointments() {
  const saved = readStore(APPOINTMENTS_KEY, []);
  const existing = Array.isArray(saved) ? saved : [];

  const missingDemos = DEMO_APPOINTMENTS.filter(
    demo => !existing.some(item => item.id === demo.id)
  );

  const combined = [...existing, ...missingDemos];
  writeStore(APPOINTMENTS_KEY, combined);

  return combined;
}

  function saveAppointments() {
    writeStore(APPOINTMENTS_KEY, appointments);
  }

function loadState() {
  const saved = readStore(STORAGE_KEY, null);

  if (saved && typeof saved === "object") {
    state = { ...saved };
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
    showScreen("home");
  });

  /* ---------- Profile quiz navigation ---------- */

  const pages = $$(".quiz-page");
  const backButton = $("#quizBack");
  const nextButton = $("#quizNext");
  const finishButton = $("#quizFinish");
  const progressFill = $("#quizProgressFill");
  const progressText = $("#quizProgressText");

  let currentPage = 0;

  function showQuizPage(index) {
    if (!pages.length) return;

    currentPage = Math.max(0, Math.min(pages.length - 1, index));

    pages.forEach((page, i) => {
      page.hidden = i !== currentPage;
    });

    const lastPage = currentPage === pages.length - 1;

    if (backButton) backButton.disabled = currentPage === 0;
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
    showScreen("prepare");
    showQuizPage(0);
  });

  $("#editProfileButton")?.addEventListener("click", () => {
  restoreForm();
  showScreen("prepare");
  showQuizPage(0);
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

  function createAppointmentCard(item, isPast = false) {
    const card = document.createElement("article");
    card.className = "appointment-card";

    const details = document.createElement("div");
    details.className = "appointment-details";

    const title = document.createElement("h3");
    title.textContent = item.title || "Healthcare appointment";

    const date = document.createElement("p");
    date.textContent = isPast
      ? `Completed ${formatDate(item.completedAt || item.date, {
          hour: undefined,
          minute: undefined
        })}`
      : formatDate(item.date);

    details.append(title, date);

    if (item.provider) {
      const provider = document.createElement("p");
      provider.textContent = `Provider: ${item.provider}`;
      details.append(provider);
    }

    if (item.demo) {
      const demo = document.createElement("span");
      demo.className = "demo-label";
      demo.textContent = "Demo appointment";
      details.append(demo);
    }

    card.append(details);

    if (isPast) {
      const summary = document.createElement("div");
      summary.className = "appointment-summary";

      const summaryHeading = document.createElement("h4");
      summaryHeading.textContent = "After-visit summary";

      const summaryText = document.createElement("p");
      summaryText.textContent = item.summary || "No visit summary is available yet.";

      summary.append(summaryHeading, summaryText);
      card.append(summary);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-primary";
      button.textContent = "Join Appointment";

      button.addEventListener("click", () => {
        activeAppointmentId = item.id;
        prepareCheckin(item);
        showScreen("checkin");
      });

      card.append(button);
    }

    return card;
  }

  function renderHomeDashboard() {
const returning = Boolean(state.profileCompleted);

    const firstVisit = $("#firstVisitWelcome");
    const returningWelcome = $("#returningWelcome");
    const dashboard = $("#returningDashboard");

    if (firstVisit) firstVisit.hidden = returning;
    if (returningWelcome) returningWelcome.hidden = !returning;
    if (dashboard) dashboard.hidden = !returning;

    if (!returning) return;

    const upcomingContainer = $("#upcomingAppointments");
    const pastContainer = $("#pastAppointments");

    if (!upcomingContainer || !pastContainer) return;

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

    if (!upcoming.length) {
      upcomingContainer.textContent = "No upcoming appointments are listed yet.";
    } else {
      upcoming.forEach(item => {
        upcomingContainer.append(createAppointmentCard(item));
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

    saveAppointments();
    showScreen("appointment");
  });

  $("#checkinBackButton")?.addEventListener("click", () => {
    showScreen("home");
  });

  /* ---------- Patient call tools ---------- */

  const panels = initToolPanel(appointmentScreen);

  $("#callHelp")?.addEventListener("click", () => {
    panels.open("transcript");
    showMessage(callMessage, "Choose a tool to help you communicate.");
  });

  $("#useTranscript")?.addEventListener("click", () => {
    showMessage(callMessage, $("#transcriptText")?.value.trim());
  });

  $("#visitNotes")?.addEventListener("input", event => {
    state.visitNotes = event.target.value;
    persistState();
  });

  /* ---------- Drawing board ---------- */

  const canvas = $("#drawingCanvas");
  const ctx = canvas?.getContext("2d");
  const PEN_COLOR = "#7a5a70";

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
      drawing = false;
      currentStroke = null;
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
    });

    $("#clearButton")?.addEventListener("click", () => {
      strokes = [];
      redrawCanvas();
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

  $("#endCallButton")?.addEventListener("click", () => {
    panels.close();

    const appointment = appointments.find(
      item => item.id === activeAppointmentId
    );

    if (appointment) {
      appointment.status = "completed";
      appointment.completedAt = new Date().toISOString();

      appointment.summary = [
        $("#visitNotes")?.value.trim(),
        $("#nextSteps")?.value.trim()
      ].filter(Boolean).join("\n\n") ||
        "Your visit is complete. Your provider can add an after-visit summary.";

      saveAppointments();
    }

    activeAppointmentId = null;
    renderHomeDashboard();
    showScreen("home");
  });

  /* ---------- Focus mode ---------- */

  const focusButton = $("#focusButton");
  const exitFocusButton = $("#exitFocusButton");

  function setFocusMode(enabled) {
    appointmentScreen?.classList.toggle("focus-mode", enabled);
    focusButton?.setAttribute("aria-pressed", String(enabled));

    if (exitFocusButton) exitFocusButton.hidden = !enabled;
    if (enabled) panels.close();
  }

  focusButton?.addEventListener("click", () => {
    setFocusMode(!appointmentScreen.classList.contains("focus-mode"));
  });

  exitFocusButton?.addEventListener("click", () => setFocusMode(false));

  /* ---------- Mute and camera ---------- */

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
      $(".call-stage", appointmentScreen)?.classList.toggle("camera-off", off);
    }
  });
window.addEventListener("storage", event => {
  if (event.key === APPOINTMENTS_KEY || event.key === null) {
    appointments = loadAppointments();
    renderHomeDashboard();
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
})();
