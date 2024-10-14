function saveConfig() {
    const groupNameInput = document.getElementById("groupNameInput");
    const defaultTabGroupName = groupNameInput.value;

    // Save the default tab group name to Chrome storage
    chrome.storage.sync.set(
        { defaultTabGroupName: defaultTabGroupName },
        function() {
            console.log("Default tab group name saved:", defaultTabGroupName);
            // Optionally, provide feedback to the user that the configuration has been saved
        },
    );
    window.close();
}

// Function to load user configuration from Chrome storage (if available)
function loadConfig() {
    const groupNameInput = document.getElementById("groupNameInput");

    // Retrieve the default tab group name from Chrome storage
    chrome.storage.sync.get("defaultTabGroupName", function(data) {
        const defaultTabGroupName = data["defaultTabGroupName"];

        if (defaultTabGroupName) {
            groupNameInput.value = defaultTabGroupName;
        }
    });
}

// Load user configuration when the popup is opened
document.addEventListener("DOMContentLoaded", function() {
    loadConfig();

    // Save configuration when the "Save" button is clicked
    const saveButton = document.getElementById("saveButton");
    saveButton.addEventListener("click", saveConfig);
});
