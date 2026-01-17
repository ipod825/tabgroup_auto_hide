// background.js

const storage = chrome.storage.session || chrome.storage.local;

chrome.runtime.onInstalled.addListener(async function () {
  chrome.storage.sync.set({
    debug: false,
  });
});



chrome.commands.onCommand.addListener(async function (command) {
  if (command === "TAH_NextTab") {
    await FocusTab(1);
  } else if (command === "TAH_PreviousTab") {
    await FocusTab(-1);
  } else if (command === "TAH_MoveTabRight") {
    await MoveTab(1);
  } else if (command === "TAH_MoveTabLeft") {
    await MoveTab(-1);
  } else if (command === "TAH_MoveTabGroupRight") {
    await MoveTabGroup(1);
  } else if (command === "TAH_MoveTabGroupLeft") {
    await MoveTabGroup(-1);
  }
});


async function ahLog(message, ...optionalParams) {
  const data = await chrome.storage.sync.get("debug");
  if (data.debug) {
    const stack = new Error().stack;
    const caller = stack ? stack.split("\n")[2] : "unknown";
    console.log(message, ...optionalParams, caller);
  }
}

async function safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (e) {
    return null;
  }
}

async function getActiveTabInWindow(windowId) {
  const [tab] = await chrome.tabs.query({ windowId: windowId, active: true });
  return tab;
}

function getWindowKey(windowId) {
  return `mru_tabs_${windowId}`;
}

class MruTabs {
  constructor(windowId, capacity) {
    this.windowId = windowId;
    this.capacity = capacity;
  }

  async _load() {
    const key = getWindowKey(this.windowId);
    const result = await storage.get(key);
    return result[key] || [];
  }

  async _save(tabIds) {
    const key = getWindowKey(this.windowId);
    await storage.set({ [key]: tabIds });
  }

  async get(skipIf) {
    let tabIds = await this._load();
    ahLog(`MruTabs for window${this.windowId}\ntabs `, tabIds);

    if (tabIds.length === 0) {
      return null;
    }

    const reversedIds = [...tabIds].reverse();
    let dirty = false;

    for (const tabId of reversedIds) {
      const tab = await safeGetTab(tabId);

      if (!tab || tab.windowId !== this.windowId) {
        ahLog("deleting stale tab", tabId);
        tabIds = tabIds.filter((id) => id !== tabId);
        dirty = true;
        continue;
      }

      ahLog("skipIf check", skipIf ? skipIf(tab) : "none", tab);

      if (skipIf && skipIf(tab)) {
        continue;
      }

      if (dirty) {
        tabIds = tabIds.filter((id) => id !== tabId);
      } else {
        tabIds = tabIds.filter((id) => id !== tabId);
      }
      
      tabIds.push(tabId);
      await this._save(tabIds);
      
      return tab;
    }

    if (dirty) {
      await this._save(tabIds);
    }

    return null;
  }

  async put(tab) {
    if (!("index" in tab)) {
      return;
    }
    if (tab.windowId !== this.windowId) {
      return;
    }

    const tabId = tab.id;
    let tabIds = await this._load();

    tabIds = tabIds.filter((id) => id !== tabId);
    tabIds.push(tabId);

    if (tabIds.length > this.capacity) {
      tabIds.shift();
    }

    await this._save(tabIds);
  }
}

// === NEW LOGIC: Default Tab Group ===
async function checkAndMoveToDefaultGroup(tab) {
  // Check if ANY tab groups exist in this specific window
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  
  if (groups.length === 0) {
    ahLog("Default tab group creation is disabled. Tab would have been moved to default group.", tab.id);
  }
}

// === EVENT HANDLERS ===

chrome.tabs.onActivated.addListener(async function (activeInfo) {
  ahLog("onActivated ", activeInfo);
  
  const tab = await safeGetTab(activeInfo.tabId);
  if (tab) {
    const mru = new MruTabs(activeInfo.windowId, 10);
    await mru.put(tab);
  }

  await collapseUnfocusedTabGroups(activeInfo.windowId);
});

chrome.tabs.onCreated.addListener(async function onCreatedHandler(tab) {
  ahLog("onCreated", tab);
  
  const windowId = tab.windowId;
  const mru = new MruTabs(windowId, 10);
  
  const currentActiveTab = await getActiveTabInWindow(windowId);
  
  // 1. Position Logic
  if (currentActiveTab) {
    const lastTab = await mru.get(
      (t) => t.id == currentActiveTab.id || t.pinned,
    );

    ahLog("lastTab in onCreated", lastTab);
    
    if (lastTab != null) {
      // Move next to last unpinned tab
      await chrome.tabs.move(tab.id, {
        index: lastTab.index + 1,
      });

      // If last tab was in a group, join it
      if (lastTab.groupId != -1) {
        await chrome.tabs.group({
          tabIds: [tab.id],
          groupId: lastTab.groupId,
        });
      } else {
        // If last tab was NOT in a group, check if we need to create the default group
        await checkAndMoveToDefaultGroup(tab);
      }
    } else {
      // No suitable last tab found, checking default group logic anyway
      await checkAndMoveToDefaultGroup(tab);
    }
  } else {
    // Edge case: No active tab found? Just check default group logic
    await checkAndMoveToDefaultGroup(tab);
  }

  await collapseUnfocusedTabGroups(windowId);
});

async function collapseUnfocusedTabGroups(windowId) {
  const currentTab = await getActiveTabInWindow(windowId);
  if (!currentTab) return;

  const tabGroups = await chrome.tabGroups.query({ windowId: windowId });

  if (currentTab.groupId == -1) {
    return;
  }
  
  tabGroups.forEach((g) => {
    if (g.id != currentTab.groupId) {
      if (!g.collapsed) {
        chrome.tabGroups.update(g.id, { collapsed: true });
      }
    }
  });
}

async function getCurrentTab() {
  let [currentTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return currentTab;
}

// === COMMAND LOGIC ===

async function FocusTab(direction) {
  let currentTab = await getCurrentTab();
  if (!currentTab) return;

  const tabs = await chrome.tabs.query({ currentWindow: true });
  let index = 0;
  for (let i = 0; i < tabs.length; ++i) {
    if (tabs[i].id == currentTab.id) {
      index = i;
      break;
    }
  }
  index = (index + direction + tabs.length) % tabs.length;
  chrome.tabs.update(tabs[index].id, { active: true });
}

function wrapIndex(arraay, ind) {
  return (ind + arraay.length) % arraay.length;
}

function findTabWithDifferentGroup(tabs, currentIndex, direction) {
  let res = currentIndex;
  const currentGroupId = tabs[currentIndex].groupId;
  while (res >= 0 && res < tabs.length && tabs[res].groupId == currentGroupId) {
    res = res + direction;
  }
  return res;
}

async function MoveTabGroup(direction) {
  let currentTab = await getCurrentTab();
  if (!currentTab) return;

  if (currentTab.groupId == -1) {
    return MoveTab(direction);
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });

  let directNeighborIndex = findTabWithDifferentGroup(
    tabs,
    currentTab.index,
    direction,
  );
  let farNeighborIndex =
    findTabWithDifferentGroup(tabs, directNeighborIndex, direction) - direction;

  let tabsToMove = await chrome.tabs.query({ groupId: currentTab.groupId });
  if (direction < 0) {
    tabsToMove.reverse();
  }
  for (let i = 0; i < tabsToMove.length; ++i) {
    chrome.tabs.move(tabsToMove[i].id, {
      index: farNeighborIndex,
    });
  }
  chrome.tabs.group({
    tabIds: tabsToMove.map((t) => t.id),
    groupId: currentTab.groupId,
  });
}

async function MoveTab(direction) {
  let currentTab = await getCurrentTab();
  if (!currentTab) return;

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const curIndex = currentTab.index;

  let neighborIndex = wrapIndex(tabs, curIndex + direction);
  while (neighborIndex != curIndex && tabs[neighborIndex].pinned) {
    neighborIndex = wrapIndex(tabs, neighborIndex + direction);
  }
  if (neighborIndex == curIndex) {
    return;
  }

  const neighborGroupId = tabs[neighborIndex].groupId;
  const tabGroupDifferent = currentTab.groupId != neighborGroupId;
  if (tabGroupDifferent && neighborGroupId != -1) {
    neighborIndex -= direction;
  }
  chrome.tabs.move(currentTab.id, { index: neighborIndex });
  if (neighborGroupId != -1) {
    await chrome.tabs.group({
      tabIds: currentTab.id,
      groupId: neighborGroupId,
    });
  }
  
  await collapseUnfocusedTabGroups(currentTab.windowId);
}


