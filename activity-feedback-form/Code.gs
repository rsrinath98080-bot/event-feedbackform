const SHEET_HEADERS = [
  "Timestamp",
  "Student Name",
  "Year",
  "Semester",
  "Department",
  "College Name",
  "Email",
  "Mobile Number",
  "Q1",
  "Q1 Reason",
  "Q2",
  "Q2 Reason",
  "Q3",
  "Q3 Reason",
  "Q4",
  "Q4 Reason",
  "Q5",
  "Q5 Tool",
  "Q6",
  "Q6 Reason",
  "Q7",
  "Q7 Reason",
  "Q8",
  "Q8 Reason",
  "Q9",
  "Q9 Reason",
  "Q10",
  "Q10 Reason",
  "Q11",
  "Q11 Reason",
  "Q12",
  "Q12 Reason",
  "Q13",
  "Q13 Reason",
  "Q14",
  "Q14 Reason",
  "Any Other Comments",
];

function doPost(e) {
  let submissionId = e && e.parameter ? e.parameter.submissionId || "" : "";

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No JSON form data was received.");
    }

    const data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("The submitted form data is invalid.");
    }

    submissionId = data.submissionId || submissionId;
    if (!/^[A-Za-z0-9-]{1,100}$/.test(submissionId)) {
      throw new Error("The submission ID is missing or invalid.");
    }

    const cache = CacheService.getScriptCache();
    const cacheKey = `feedback:${submissionId}`;
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const previousResult = cache.get(cacheKey);
      if (previousResult) return jsonResponse(JSON.parse(previousResult));

      validateSubmission(data);
      const value = (key) => data[key] == null ? "" : String(data[key]).trim();
      const sheet = SpreadsheetApp.openById("YOUR_GOOGLE_SHEET_ID").getSheets()[0];
      ensureSheetHeaders(sheet);

      const row = [
        new Date(),
        value("studentName"),
        value("year"),
        value("semester"),
        value("department"),
        value("collegeName"),
        value("email"),
        value("mobileNumber"),
        value("q1"),
        value("q1Reason"),
        value("q2"),
        value("q2Reason"),
        value("q3"),
        value("q3Reason"),
        value("q4"),
        value("q4Reason"),
        value("q5"),
        value("q5ToolName"),
        value("q6"),
        value("q6Reason"),
        value("q7"),
        value("q7Reason"),
        value("q8"),
        value("q8Reason"),
        value("q9"),
        value("q9Reason"),
        value("q10"),
        value("q10Reason"),
        value("q11"),
        value("q11Reason"),
        value("q12"),
        value("q12Reason"),
        value("q13"),
        value("q13Reason"),
        value("q14"),
        value("q14Reason"),
        value("comments"),
      ];

      if (row.length !== SHEET_HEADERS.length) {
        throw new Error("The feedback row does not match the configured sheet columns.");
      }

      sheet.appendRow(row);
      SpreadsheetApp.flush();
      const result = { success: true, message: "Feedback saved successfully." };
      cache.put(cacheKey, JSON.stringify(result), 21600);
      return jsonResponse(result);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    const result = { success: false, error: error.message || "Unable to save feedback." };
    if (submissionId && /^[A-Za-z0-9-]{1,100}$/.test(submissionId)) {
      CacheService.getScriptCache().put(`feedback:${submissionId}`, JSON.stringify(result), 21600);
    }
    return jsonResponse(result);
  }
}

function doGet(e) {
  const submissionId = e && e.parameter ? e.parameter.submissionId || "" : "";
  const callback = e && e.parameter ? e.parameter.callback || "" : "";

  if (!/^[A-Za-z_$][\w$]*$/.test(callback) || !/^[A-Za-z0-9-]{1,100}$/.test(submissionId)) {
    return jsonResponse({ success: false, error: "Invalid status request." });
  }

  const savedResult = CacheService.getScriptCache().get(`feedback:${submissionId}`);
  const result = savedResult ? JSON.parse(savedResult) : { pending: true };
  const jsonp = `${callback}(${JSON.stringify(result)});`;
  return ContentService
    .createTextOutput(jsonp)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function validateSubmission(data) {
  const requiredFields = [
    "studentName", "year", "semester", "department", "collegeName", "email", "mobileNumber",
  ];

  requiredFields.forEach((key) => {
    if (!String(data[key] ?? "").trim()) throw new Error(`${key} is required.`);
  });

  if (!["I Year", "II Year", "III Year", "IV Year"].includes(String(data.year).trim())) {
    throw new Error("Select a valid year.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
    throw new Error("Enter a valid email address.");
  }
  if (!/^[6-9]\d{9}$/.test(String(data.mobileNumber).trim())) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }

  for (let questionNumber = 1; questionNumber <= 14; questionNumber += 1) {
    const questionKey = `q${questionNumber}`;
    const answer = String(data[questionKey] ?? "").trim();
    if (answer !== "Yes" && answer !== "No") {
      throw new Error(`Select Yes or No for question ${questionNumber}.`);
    }

    if (questionNumber === 5 && answer === "Yes" && !String(data.q5ToolName ?? "").trim()) {
      throw new Error("Enter the tool name for question 5.");
    }
    if (questionNumber !== 5 && answer === "No" && !String(data[`${questionKey}Reason`] ?? "").trim()) {
      throw new Error(`Enter a reason for question ${questionNumber}.`);
    }
  }
}

function ensureSheetHeaders(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), SHEET_HEADERS.length);
  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  if (currentHeaders.every((header) => header === "")) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    return;
  }

  const headersMatch = SHEET_HEADERS.every((header, index) => currentHeaders[index] === header);
  const hasExtraHeaders = currentHeaders.slice(SHEET_HEADERS.length).some((header) => header !== "");
  if (!headersMatch || hasExtraHeaders) {
    throw new Error("Google Sheet headers must exactly match the required 37 columns and order.");
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}