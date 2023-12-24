chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.set({
    defaultTabGroupName: "*",
  });
});

chrome.commands.onCommand.addListener(function (command) {
  if (command === "TAH_NextTab") {
    FocusTab(1);
  } else if (command === "TAH_PreviousTab") {
    FocusTab(-1);
  } else if (command === "TAH_MoveTabRight") {
    MoveTab(1);
  } else if (command === "TAH_MoveTabLeft") {
    MoveTab(-1);
  } else if (command === "TAH_MoveTabGroupRight") {
    MoveTabGroup(1);
  } else if (command === "TAH_MoveTabGroupLeft") {
    MoveTabGroup(-1);
  } else if (command === "TAH_OpenInCurrentGroup") {
    OpenTabInCurrentGroup(-1);
  }
});

chrome.tabs.onActivated.addListener(collapseUnfocusedTabGroups);

async function collapseUnfocusedTabGroups(_activeInfo) {
  let currentTab = await getCurrentTab();
  let tabGroups = await chrome.tabGroups.query({});
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

async function OpenTabInCurrentGroup() {
  let currentTab = await getCurrentTab();
  let newTab = await chrome.tabs.create({ index: currentTab.index + 1 });
  const data = await chrome.storage.sync.get("defaultTabGroupName");

  if (currentTab.groupId == -1) {
    let defaultGroup = await chrome.tabGroups.query({
      title: data.defaultTabGroupName,
    });
    if (defaultGroup.length == 1) {
      await chrome.tabs.group({
        tabIds: [newTab.id],
        groupId: defaultGroup[0].id,
      });
    } else {
      let newGroupId = await chrome.tabs.group({
        tabIds: [newTab.id],
      });
      await chrome.tabGroups.update(newGroupId, {
        title: data.defaultTabGroupName,
      });
      await chrome.tabs.move(newTab.id, {
        index: -1,
      });
    }
  } else {
    await chrome.tabs.group({
      tabIds: [newTab.id],
      groupId: currentTab.groupId,
    });
  }
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
  if (tabGroupDifferent && neighborIndex != 0 && neighborGroupId != -1) {
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
