// popup.js

document.addEventListener("DOMContentLoaded", function() {
  const debugCheckbox = document.getElementById("debugCheckbox");

  // Load debug setting
  chrome.storage.sync.get("debug", function(data) {
    debugCheckbox.checked = data.debug || false;
  });

  // Save debug setting when checkbox changes
  debugCheckbox.addEventListener("change", function() {
    chrome.storage.sync.set({ debug: debugCheckbox.checked });
  });
});