chrome.runtime.onInstalled.addListener(async function () {
  chrome.storage.sync.set({
    defaultTabGroupName: "_",
  });
  await updateLastTabs("onInstalled");
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

let debug = false;
function ahLog(message, ...optionalParams) {
  if (debug) {
    console.log(message, ...optionalParams, new Error().stack.split("\n")[2]);
  }
}

async function safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (e) {
    return null;
  }
}

class MruTabs {
  constructor(windowId, capacity) {
    this.windowId = windowId;
    this.capacity = capacity;
    this.cache = new Map();
  }

  async get(skipIf) {
    ahLog(`MruTabs for window${this.windowId}\ntabs `, this.cache);
    if (this.cache.size == 0) {
      return null;
    }

    let tabId = null;
    let tab = null;
    let skipped = 0;
    while (tab == null && this.cache.size > skipped) {
      tabId = Array.from(this.cache.keys())[this.cache.size - 1];
      tab = await safeGetTab(tabId);
      if (tab == null || tab.windowId != this.windowId) {
        this.cache.delete(tabId);
        // Don't pick the tab if windowId mismatch.
        tab = null;
      } else if (skipIf && skipIf(tab)) {
        skipped++;
      }
    }

    this.cache.delete(tabId);
    this.cache.set(tabId, tab);
    return tab;
  }

  put(tab) {
    if (!("index" in tab)) {
      return;
    }
    let tabId = tab.id;
    if (this.cache.has(tabId)) {
      this.cache.delete(tabId);
    } else if (this.cache.size >= this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(tabId, tab);
  }
}

let LAST_TABS = new Map();
async function getCurrentWindowLastTabs() {
  let windowId = (await chrome.windows.getCurrent()).id;
  if (!LAST_TABS.has(windowId)) {
    LAST_TABS.set(windowId, new MruTabs(windowId, 10));
  }
  return LAST_TABS.get(windowId);
}

async function updateLastTabs(source) {
  ahLog(`updateLastTabs ${source}`);
  const tab = await getCurrentTab();
  let lastTabs = await getCurrentWindowLastTabs();
  lastTabs.put(tab);
  ahLog(`updateLastTabs ${source}`, lastTabs);
}

chrome.tabs.onActivated.addListener(async function (tab) {
  ahLog("onActivated ", tab);
  await updateLastTabs("onActivated");
  await collapseUnfocusedTabGroups();
});

chrome.tabs.onCreated.addListener(async function onCreatedHandler(tab) {
  ahLog("onCreated", tab);
  const lastTabs = await getCurrentWindowLastTabs();
  const lastTab = await lastTabs.get((tab) => tab.pinned);

  ahLog("lastTab in onCreated", lastTab);
  if (lastTab == null) {
    return;
  } else {
    await chrome.tabs.move(tab.id, {
      index: lastTab.index + 1,
    });
    if (lastTab.groupId != -1) {
      await chrome.tabs.group({
        tabIds: [tab.id],
        groupId: lastTab.groupId,
      });
    }
  }

  await updateLastTabs("onCreated");
  await collapseUnfocusedTabGroups();
});

async function moveTabToDefaultGroup(tab) {
  const data = await chrome.storage.sync.get("defaultTabGroupName");
  let defaultGroup = await chrome.tabGroups.query({
    title: data.defaultTabGroupName,
  });
  if (defaultGroup.length == 1) {
    await chrome.tabs.group({
      tabIds: [tab.id],
      groupId: defaultGroup[0].id,
    });
  } else {
    let newGroupId = await chrome.tabs.group({
      tabIds: [tab.id],
    });
    await chrome.tabGroups.update(newGroupId, {
      title: data.defaultTabGroupName,
    });
    await chrome.tabs.move(tab.id, {
      index: -1,
    });
  }
}

async function collapseUnfocusedTabGroups() {
  let currentTab = await getCurrentTab();
  let tabGroups = await chrome.tabGroups.query({});
  if (currentTab.groupId == -1) {
    return;
  }
  tabGroups.forEach((g) => {
    if (g.id != currentTab.groupId) {
      chrome.tabGroups.update(g.id, { collapsed: true });
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

async function FocusTab(direction) {
  let currentTab = await getCurrentTab();
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
  await collapseUnfocusedTabGroups();
}
