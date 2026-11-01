/* =========================================================
   Patient page (index.html)
   Depends on js/shared.js
   ========================================================= */
const { $, $$, readStore, writeStore, showScreen, bindScreenNav, initToolPanel, bindToggle, showMessage } = BW;

const STORAGE_KEY = "BeyondWordsAphasia";

const state = {
  mood: "",
  methods: [],
  supports: [],
  caregiver: "",
  topics: [],
  extraNotes: "",
  wantsSummary: "",
  summaryRecipients: [],
  visitNotes: "",
  nextSteps: "",
  drawing: ""
};

const form = $("#prepareForm");
const appointment = $("#appointment");
const callMessage = $("#callMessage");

/* ---------- Saved data ---------- */

function loadState() {
  Object.assign(state, readStore(STORAGE_KEY, {}));
}

function persistState() {
  writeStore(STORAGE_KEY, state);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || "Not provided";
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value || "";
}

/* ---------- Questionnaire form ---------- */

const valueFor = (name) => form.querySelector(`[name="${name}"]:checked`)?.value || "";
const valuesFor = (name) => $$(`[name="${name}"]:checked`, form).map((input) => input.value);

function check(name, value) {
  const input = form.querySelector(`[name="${name}"][value="${CSS.escape(value)}"]`);
  if (input) input.checked = true;
}

function restoreForm() {
  [
    ["mood", state.mood],
    ["caregiverInvolvement", state.caregiver],
    ["wantsSummary", state.wantsSummary]
  ].forEach(([name, value]) => {
    if (value) check(name, value);
  });

  ["methods", "supports", "topics", "summaryRecipients"].forEach((name) => {
    state[name].forEach((value) => check(name, value));
  });

  setValue("supportPerson", state.extraNotes);
  setValue("visitNotes", state.visitNotes);
  setValue("nextSteps", state.nextSteps);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  state.mood = valueFor("mood");
  state.methods = valuesFor("methods");
  state.caregiver = valueFor("caregiverInvolvement");
  state.extraNotes = $("#supportPerson")?.value.trim() || "";
  state.wantsSummary = valueFor("wantsSummary");
  state.summaryRecipients = valuesFor("summaryRecipients");

  persistState();
  updateSummary();
  updateProvider();
  showScreen("appointment");
});

/* ---------- Back / Next ---------- */

const pages = $$(".quiz-page");
const backButton = $("#quizBack");
const nextButton = $("#quizNext");
const finishButton = $("#quizFinish");
const progressFill = $("#quizProgressFill");
const progressText = $("#quizProgressText");

let currentPage = 0;

function showQuizPage(index) {
  currentPage = Math.max(0, Math.min(pages.length - 1, index));

  pages.forEach((page, i) => {
    page.hidden = i !== currentPage;
  });

  const isLast = currentPage === pages.length - 1;
  backButton.disabled = currentPage === 0;
  nextButton.hidden = isLast;
  finishButton.hidden = !isLast;

  progressFill.style.width = `${((currentPage + 1) / pages.length) * 100}%`;
  progressText.textContent = `Step ${currentPage + 1} of ${pages.length}`;

  // Move keyboard focus to the new question.
  const heading = $("h3", pages[currentPage]);
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

backButton.addEventListener("click", () => showQuizPage(currentPage - 1));
nextButton.addEventListener("click", () => showQuizPage(currentPage + 1));

/* ---------- Summary / provider read-outs ---------- */

function updateSummary() {
  setText(
    "summaryTopics",
    state.topics.length ? state.topics.join(", ") : "No topics selected."
  );

  const prefs = [
    state.mood && `Feeling: ${state.mood}`,
    state.methods.length && `Communication: ${state.methods.join(", ")}`,
    state.caregiver && `Caregiver involvement: ${state.caregiver}`,
    state.extraNotes && `Support person: ${state.extraNotes}`
  ].filter(Boolean);

  setText("summaryPreferences", prefs.join(". ") || "No preferences saved.");

  const visitNotes = $("#visitNotes");
  if (visitNotes && !visitNotes.value) visitNotes.value = state.visitNotes || "";

  setValue("nextSteps", state.nextSteps);
}

function updateProvider() {
  setText("providerMood", state.mood);
  setText("providerMethods", state.methods.join(", "));
  setText("providerSupports", state.supports.join(", "));
  setText("providerCaregiver", state.caregiver);
  setText("providerTopics", state.topics.join(", "));
  setText("providerNotes", state.extraNotes);
}

$("#visitNotes").addEventListener("input", (event) => {
  state.visitNotes = event.target.value;
});

/* ---------- Drawing board (mouse, touch and stylus) ---------- */

const PEN_COLOR = "#7a5a70";
const canvas = $("#drawingCanvas");
const ctx = canvas.getContext("2d");

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

  strokes.forEach((stroke) => {
    if (!stroke.points.length) return;

    ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
    }
    ctx.stroke();
  });

  ctx.globalCompositeOperation = "source-over";
}

function finishStroke() {
  drawing = false;
  currentStroke = null;
}

canvas.addEventListener("pointerdown", (event) => {
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

canvas.addEventListener("pointermove", (event) => {
  if (!drawing || !currentStroke) return;
  currentStroke.points.push(canvasPoint(event));
  redrawCanvas();
});

canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);

$("#penButton").onclick = () => {
  erasing = false;
  ctx.strokeStyle = PEN_COLOR;
  ctx.lineWidth = 4;
};

$("#eraserButton").onclick = () => {
  erasing = true;
  ctx.lineWidth = 24;
};

$("#undoButton").onclick = () => {
  strokes.pop();
  redrawCanvas();
};

$("#clearButton").onclick = () => {
  strokes = [];
  redrawCanvas();
};

$("#saveDrawingButton").onclick = () => {
  state.drawing = canvas.toDataURL("image/png");
  persistState();

  const link = document.createElement("a");
  link.href = state.drawing;
  link.download = "my-visit-drawing.png";
  link.click();

  $("#drawingStatus").textContent = "Drawing saved as a PNG file on your device.";
};

/* ---------- Call screen ---------- */

const panels = initToolPanel(appointment);

// "Need help?" always opens the typed-message tool.
$("#callHelp").addEventListener("click", () => {
  panels.open("transcript");
  showMessage(callMessage, "Choose a tool to help you communicate.");
});

// Show the typed message in the call area.
$("#useTranscript").addEventListener("click", () => {
  showMessage(callMessage, $("#transcriptText").value.trim());
});

$("#endCallButton").addEventListener("click", () => {
  panels.close();
  showScreen("home");
});

/* Focus mode */
const focusButton = $("#focusButton");
const exitFocusButton = $("#exitFocusButton");

function setFocusMode(enabled) {
  appointment.classList.toggle("focus-mode", enabled);
  focusButton.setAttribute("aria-pressed", String(enabled));
  exitFocusButton.hidden = !enabled;

  if (enabled) panels.close();
}

focusButton.addEventListener("click", () => {
  setFocusMode(!appointment.classList.contains("focus-mode"));
});

exitFocusButton.addEventListener("click", () => setFocusMode(false));

/* Mute and camera (interface demonstration only) */
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
  onChange: (off) => $(".call-stage", appointment).classList.toggle("camera-off", off)
});

/* ---------- Start-up ---------- */

bindScreenNav();
loadState();
restoreForm();
updateSummary();
updateProvider();
