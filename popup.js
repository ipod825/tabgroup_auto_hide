// popup.js

document.addEventListener("DOMContentLoaded", function() {
  localizeHtmlPage();
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

function localizeHtmlPage() {
  //Localize by replacing __MSG_***__ meta tags
  var objects = document.getElementsByTagName('html');
  for (var j = 0; j < objects.length; j++)
  {
      var obj = objects[j];

      var valStrH = obj.innerHTML.toString();
      var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function(match, v1)
      {
          return v1 ? chrome.i18n.getMessage(v1) : "";
      });

      if(valNewH != valStrH)
      {
          obj.innerHTML = valNewH;
      }
  }
}

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
  await chrome.runtime.sendMessage({
    type: "toggleAutoHide",
    groupId: groupId
  });
  // Reload the list to reflect the changes
  loadTabGroups();
}