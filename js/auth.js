/* =========================================================
   Demo people. There is no login: the patient page is always
   "Demo patient" and the provider page is always Dr. Taylor Morgan,
   so two devices can run a visit together straight away.
   ========================================================= */
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