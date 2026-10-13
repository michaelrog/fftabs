const output = document.getElementById("output");
const count = document.getElementById("count");
const copyButton = document.getElementById("copy");

// tabs.Tab properties to include, in output order. Missing ones are omitted.
const TAB_PROPERTIES = [
  "id",
  "index",
  "windowId",
  "highlighted",
  "hidden",
  "discarded",
  "incognito",
  "lastAccessed",
  "audible",
  "sharingState",
  "mutedInfo",
  "successorTabId",
  "groupId",
  "url",
  "title",
  "attention",
];

function pick(tab) {
  return Object.fromEntries(TAB_PROPERTIES.map((key) => [key, tab[key]]));
}

async function load() {
  const tabs = await browser.tabs.query({});
  output.value = JSON.stringify(tabs.map(pick), null, 2);
  count.textContent = `${tabs.length} tab${tabs.length === 1 ? "" : "s"}`;
}

async function copy() {
  await navigator.clipboard.writeText(output.value);
  copyButton.textContent = "Copied!";
  setTimeout(() => (copyButton.textContent = "Copy"), 1500);
}

copyButton.addEventListener("click", () => {
  copy().catch((err) => {
    copyButton.textContent = "Copy failed";
    console.error(err);
  });
});

load().catch((err) => {
  output.value = `Error: ${err.message}`;
});
