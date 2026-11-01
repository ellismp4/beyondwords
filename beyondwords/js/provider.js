/* =========================================================
   Provider page (provider.html)
   Depends on js/shared.js
   ========================================================= */
(() => {
  const { $, readStore, writeStore, showScreen, bindScreenNav, initToolPanel, bindToggle, showMessage } = BW;

  const callScreen = $("#call");

  bindScreenNav();

  /* ---------- Call screen ---------- */

  const panels = initToolPanel(callScreen);

  // "Need help?" opens the communication tips.
  $("#callHelp").addEventListener("click", () => panels.open("support"));

  $("#providerShowMessage").addEventListener("click", () => {
    showMessage($("#providerMessagePreview"), $("#providerMessage").value.trim());
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
    onChange: (off) => $(".call-stage", callScreen).classList.toggle("camera-off", off)
  });

  $("#endCallButton").addEventListener("click", () => {
    panels.close();
    showScreen("dashboard");
  });

  /* ---------- Visit notes (saved in this browser) ---------- */

  const NOTES_KEY = "beyondWordsProviderNotes";
  const visitNotes = $("#providerVisitNotes");

  visitNotes.value = readStore(NOTES_KEY, "");
  visitNotes.addEventListener("input", () => writeStore(NOTES_KEY, visitNotes.value));

  /* ---------- After-visit summary ---------- */

  const SUMMARY_KEY = "beyondWordsProviderDemoSummary";
  const summaryFields = [
    "visitTopics",
    "visitDiscussion",
    "visitNextSteps",
    "visitQuestions",
    "providerNotes"
  ];

  const statusField = $("#reviewStatus"); // optional
  const statusMessage = $("#summaryStatus");
  const say = (text) => { statusMessage.textContent = text; };

  function getSummaryData() {
    const data = {};
    summaryFields.forEach((id) => { data[id] = $(`#${id}`).value; });
    if (statusField) data.reviewStatus = statusField.value;
    return data;
  }

  function fillSummary(data) {
    summaryFields.forEach((id) => {
      if (typeof data[id] === "string") $(`#${id}`).value = data[id];
    });
    if (statusField && data.reviewStatus) statusField.value = data.reviewStatus;
  }

  const savedDraft = readStore(SUMMARY_KEY);
  if (savedDraft) fillSummary(savedDraft);

  $("#saveDraft").addEventListener("click", () => {
    say(writeStore(SUMMARY_KEY, getSummaryData())
      ? "Draft saved in this browser."
      : "The draft could not be saved in this browser.");
  });

  $("#summaryForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const labels = {
      draft: "Draft — still being edited",
      reviewing: "Reviewing together",
      confirmed: "Marked as reviewed with the patient"
    };
    const label = statusField ? labels[statusField.value] : "Summary updated";

    say(`${label}. This is a demo status, not a verified signature.`);
  });

  $("#readSummary").addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      say("Read-aloud is not supported in this browser.");
      return;
    }

    const sections = [
      ["What we talked about", "visitTopics"],
      ["What we discussed", "visitDiscussion"],
      ["My next steps", "visitNextSteps"],
      ["Questions or things I still need help with", "visitQuestions"]
    ];

    const text = sections
      .map(([label, id]) => `${label}. ${$(`#${id}`).value}`)
      .join(". ");

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    say("Reading the summary aloud.");
  });

  $("#printSummary").addEventListener("click", () => window.print());
})();
