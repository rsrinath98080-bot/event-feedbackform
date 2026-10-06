const form = document.querySelector("#feedbackForm");
const submissionError = document.querySelector("#submissionError");
const submitButton = document.querySelector("#submitButton");
const resetButton = document.querySelector("#resetButton");
const yearSelect = document.querySelector("#year");
const selectedYearDisplay = document.querySelector("#selectedYearDisplay");
const selectedYearValue = document.querySelector("#selectedYearValue");
const CONFIG = {
  APPS_SCRIPT_WEB_APP_URL: "", // Paste the deployed Google Apps Script Web App URL here.
};
const submitButtonLabel = submitButton.textContent;
let isSubmitting = false;
let pendingSubmissionId = null;

function getSubmissionEndpoint() {
  const configuredUrl = CONFIG.APPS_SCRIPT_WEB_APP_URL.trim();
  if (!configuredUrl) {
    throw new Error("Google Apps Script is not configured. Add its deployed Web App URL in js/script.js.");
  }

  let endpoint;
  try {
    endpoint = new URL(configuredUrl);
  } catch {
    throw new Error("The Google Apps Script Web App URL is invalid. Check the URL in js/script.js.");
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)
  ) {
    throw new Error("Use the deployed Google Apps Script Web App URL ending in /exec.");
  }

  return endpoint;
}

function createSubmissionId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requestSubmissionStatus(endpoint, submissionId) {
  return new Promise((resolve, reject) => {
    const callbackName = `feedbackStatus_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const statusUrl = new URL(endpoint);
    statusUrl.searchParams.set("submissionId", submissionId);
    statusUrl.searchParams.set("callback", callbackName);

    const script = document.createElement("script");
    let settled = false;
    const timeout = window.setTimeout(() => finish(reject, new Error("Timed out while checking the save status.")), 10000);

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      callback(value);
    }

    window[callbackName] = (result) => finish(resolve, result);
    script.onerror = () => finish(reject, new Error("Could not check the Google Sheets save status."));
    script.src = statusUrl.toString();
    document.head.append(script);
  });
}

async function waitForSubmissionStatus(endpoint, submissionId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await requestSubmissionStatus(endpoint, submissionId);
    if (!result.pending) return result;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  throw new Error("Timed out while waiting for Google Sheets to save your feedback.");
}

function updateSelectedYearDisplay() {
  selectedYearValue.textContent = yearSelect.value;
  selectedYearDisplay.hidden = !yearSelect.value;
}

function showError(control, message) {
  const errorId = control.type === "radio"
    ? `q${control.name.slice(1)}Error`
    : control.getAttribute("aria-describedby");
  const error = errorId ? document.querySelector(`#${errorId}`) : null;
  if (error) error.textContent = message;
  control.setAttribute("aria-invalid", "true");
}

function clearControlError(control) {
  const errorId = control.type === "radio"
    ? `q${control.name.slice(1)}Error`
    : control.getAttribute("aria-describedby");
  const error = errorId ? document.querySelector(`#${errorId}`) : null;
  if (error) error.textContent = "";
  control.removeAttribute("aria-invalid");
}

function clearAllErrors() {
  form.querySelectorAll("[aria-invalid='true']").forEach((control) => {
    control.removeAttribute("aria-invalid");
  });
  form.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}

function updateQuestionResponses(questionNumber) {
  const selectedAnswer = form.querySelector(`input[name='q${questionNumber}']:checked`);
  const motionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;

  form.querySelectorAll(`.conditional-field[data-question='${questionNumber}']`).forEach((field) => {
    const isVisible = selectedAnswer?.value === field.dataset.answer;
    const response = field.querySelector("input, textarea");
    field.getAnimations().forEach((animation) => animation.cancel());
    response.required = isVisible;
    response.disabled = !isVisible;
    field.inert = !isVisible;
    field.setAttribute("aria-hidden", String(!isVisible));

    if (isVisible) {
      field.hidden = false;
      field.animate(
        [
          { height: "0px", opacity: 0, transform: "translateY(-4px)" },
          { height: `${field.scrollHeight}px`, opacity: 1, transform: "translateY(0)" },
        ],
        { duration: motionDuration, easing: "ease-out" },
      );
      return;
    }

    response.value = "";
    clearControlError(response);
    if (field.hidden) return;

    const animation = field.animate(
      [
        { height: `${field.scrollHeight}px`, opacity: 1, transform: "translateY(0)" },
        { height: "0px", opacity: 0, transform: "translateY(-4px)" },
      ],
      { duration: motionDuration, easing: "ease-in" },
    );
    animation.onfinish = () => {
      if (field.inert) field.hidden = true;
    };
  });
}

function validateForm() {
  clearAllErrors();
  let firstInvalid = null;

  form.querySelectorAll(".form-field input[required], .form-field select[required]").forEach((control) => {
    if (!control.value.trim()) {
      showError(control, "This field is required.");
      firstInvalid ??= control;
    } else if (control.type === "email" && !control.validity.valid) {
      showError(control, "Enter a valid email address.");
      firstInvalid ??= control;
    } else if (control.type === "tel" && !/^[6-9]\d{9}$/.test(control.value.trim())) {
      showError(control, "Enter a valid 10-digit Indian mobile number.");
      firstInvalid ??= control;
    }
  });

  for (let questionNumber = 1; questionNumber <= 14; questionNumber += 1) {
    const answer = form.querySelector(`input[name='q${questionNumber}']:checked`);
    if (!answer) {
      const firstOption = form.querySelector(`input[name='q${questionNumber}']`);
      showError(firstOption, "Please select an answer.");
      firstInvalid ??= firstOption;
    } else {
      const response = form.querySelector(`.conditional-field[data-question='${questionNumber}'][data-answer='${answer.value}'] input, .conditional-field[data-question='${questionNumber}'][data-answer='${answer.value}'] textarea`);
      if (response && !response.value.trim()) {
        showError(response, "Please provide a response.");
        firstInvalid ??= response;
      }
    }
  }

  if (firstInvalid) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  return true;
}

form.addEventListener("change", (event) => {
  const control = event.target;
  if (control === yearSelect) updateSelectedYearDisplay();
  const questionMatch = control.name.match(/^q(\d+)$/);
  if (control.type === "radio" && questionMatch) updateQuestionResponses(questionMatch[1]);

  if (control.matches("input, select")) {
    if (control.type === "radio") {
      form.querySelectorAll(`input[name='${control.name}']`).forEach(clearControlError);
    } else {
      clearControlError(control);
    }
  }
});

form.addEventListener("input", (event) => {
  if (event.target.matches("input, select, textarea")) clearControlError(event.target);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submissionError.hidden = true;
  submissionError.textContent = "";

  if (isSubmitting || !validateForm()) return;

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  submitButton.textContent = "Submitting...";

  try {
    const endpoint = getSubmissionEndpoint();
    pendingSubmissionId ??= createSubmissionId();
    const value = (name) => form.elements.namedItem(name)?.value?.trim() ?? "";
    const data = {
      submissionId: pendingSubmissionId,
      studentName: value("studentName"),
      year: value("year"),
      semester: value("semester"),
      department: value("department"),
      collegeName: value("collegeName"),
      email: value("email"),
      mobileNumber: value("mobileNumber"),
      q1: value("q1"),
      q1Reason: value("q1Reason"),
      q2: value("q2"),
      q2Reason: value("q2Reason"),
      q3: value("q3"),
      q3Reason: value("q3Reason"),
      q4: value("q4"),
      q4Reason: value("q4Reason"),
      q5: value("q5"),
      q5ToolName: value("q5ToolName"),
      q6: value("q6"),
      q6Reason: value("q6Reason"),
      q7: value("q7"),
      q7Reason: value("q7Reason"),
      q8: value("q8"),
      q8Reason: value("q8Reason"),
      q9: value("q9"),
      q9Reason: value("q9Reason"),
      q10: value("q10"),
      q10Reason: value("q10Reason"),
      q11: value("q11"),
      q11Reason: value("q11Reason"),
      q12: value("q12"),
      q12Reason: value("q12Reason"),
      q13: value("q13"),
      q13Reason: value("q13Reason"),
      q14: value("q14"),
      q14Reason: value("q14Reason"),
      comments: value("comments"),
    };

    const postUrl = new URL(endpoint);
    postUrl.searchParams.set("submissionId", pendingSubmissionId);

    await fetch(postUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(data),
    });

    const result = await waitForSubmissionStatus(endpoint, pendingSubmissionId);
    if (!result.success) {
      pendingSubmissionId = null;
      throw new Error(result.error || "Google Sheets could not save your feedback.");
    }

    window.location.href = "success.html";
  } catch (error) {
    submissionError.textContent = error.message || "A network error occurred. Please check your connection and try again.";
    submissionError.hidden = false;
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
    submitButton.textContent = submitButtonLabel;
  }
});

resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("Reset all form fields and selections?");
  if (!confirmed) return;

  form.reset();
  updateSelectedYearDisplay();
  clearAllErrors();
  for (let questionNumber = 1; questionNumber <= 14; questionNumber += 1) {
    updateQuestionResponses(questionNumber);
  }
  submissionError.hidden = true;
  submissionError.textContent = "";
});

for (let questionNumber = 1; questionNumber <= 14; questionNumber += 1) {
  updateQuestionResponses(questionNumber);
}
updateSelectedYearDisplay();