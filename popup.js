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

  // Load tab groups
  loadTabGroups();
});

async function loadTabGroups() {
  const [tabGroups, data] = await Promise.all([
    chrome.tabGroups.query({}),
    chrome.storage.sync.get("autoHideDisabledGroupIds"),
  ]);

  const autoHideDisabledGroupIds = data.autoHideDisabledGroupIds || [];
  const autoHideDisabledGroupsDiv = document.getElementById("autoHideDisabledGroups");
  autoHideDisabledGroupsDiv.innerHTML = "";

  for (const group of tabGroups) {
    const groupDiv = document.createElement("div");
    groupDiv.className = "group-item";
    groupDiv.dataset.groupId = group.id;
    if (autoHideDisabledGroupIds.includes(group.id)) {
      groupDiv.classList.add("auto-hide-disabled");
    }

    const groupTitle = document.createElement("span");
    groupTitle.textContent = group.title;
    groupDiv.appendChild(groupTitle);

    groupDiv.addEventListener("click", () => toggleAutoHide(group.id));

    autoHideDisabledGroupsDiv.appendChild(groupDiv);
  }
}

async function toggleAutoHide(groupId) {
  const data = await chrome.storage.sync.get("autoHideDisabledGroupIds");
  let autoHideDisabledGroupIds = data.autoHideDisabledGroupIds || [];

  const groupDiv = document.querySelector(`[data-group-id="${groupId}"]`);

  if (autoHideDisabledGroupIds.includes(groupId)) {
    autoHideDisabledGroupIds = autoHideDisabledGroupIds.filter(id => id !== groupId);
    if (groupDiv) {
      groupDiv.classList.remove("auto-hide-disabled");
    }
  } else {
    autoHideDisabledGroupIds.push(groupId);
    if (groupDiv) {
      groupDiv.classList.add("auto-hide-disabled");
    }
  }

  await chrome.storage.sync.set({ autoHideDisabledGroupIds });
  // Reload the list to reflect the changes
  loadTabGroups();
}