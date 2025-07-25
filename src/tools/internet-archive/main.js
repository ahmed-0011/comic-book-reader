/**
 * @license
 * Copyright 2020-2024 Álvaro García
 * www.binarynonsense.com
 * SPDX-License-Identifier: BSD-2-Clause
 */

const fs = require("fs");
const path = require("path");
const core = require("../../core/main");
const { _ } = require("../../shared/main/i18n");
const reader = require("../../reader/main");
const contextMenu = require("../../shared/main/tools-menu-context");
const tools = require("../../shared/main/tools");
const utils = require("../../shared/main/utils");

///////////////////////////////////////////////////////////////////////////////
// SETUP //////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_isInitialized = false;
const g_queryPageSize = 50;

function init() {
  if (!g_isInitialized) {
    initOnIpcCallbacks();
    initHandleIpcCallbacks();
    g_isInitialized = true;
  }
}

exports.open = function () {
  // called by switchTool when opening tool
  init();
  const data = fs.readFileSync(path.join(__dirname, "index.html"));
  sendIpcToCoreRenderer("replace-inner-html", "#tools", data.toString());
  updateLocalizedText();

  let collectionsContent = `<option value="internetarchivebooks">Internet Archive Books</option>`;
  collectionsContent += `<option value="smithsonian">Smithsonian Libraries and Archives</option>`;
  collectionsContent += `<option value="americana">American Libraries</option>`;
  collectionsContent += `<option value="library_of_congress">The Library of Congress</option>`;
  collectionsContent += `<option value="wwIIarchive">WWII Archive</option>`;
  collectionsContent += `<option value="sciencefiction">The Science Fiction and Fantasy Fiction Collection</option>`;
  collectionsContent += `<option value="">${_(
    "tool-iab-collection-any"
  )}</option>`;

  let availabilityContent = `<option value="0">${_(
    "tool-iab-availability-always"
  )}</option>`;
  availabilityContent += `<option value="1">${_(
    "tool-iab-availability-any"
  )}</option>`;

  sendIpcToRenderer("show", collectionsContent, availabilityContent);
};

exports.close = function () {
  // called by switchTool when closing tool
  sendIpcToRenderer("close-modal");
  sendIpcToRenderer("hide"); // clean up
};

exports.onResize = function () {
  sendIpcToRenderer("update-window");
};

exports.onMaximize = function () {
  sendIpcToRenderer("update-window");
};

exports.onToggleFullScreen = function () {
  sendIpcToRenderer("update-window");
};

function onCloseClicked() {
  tools.switchTool("reader");
}

///////////////////////////////////////////////////////////////////////////////
// IPC SEND ///////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function sendIpcToRenderer(...args) {
  core.sendIpcToRenderer("tool-internet-archive", ...args);
}

function sendIpcToCoreRenderer(...args) {
  core.sendIpcToRenderer("core", ...args);
}

///////////////////////////////////////////////////////////////////////////////
// IPC RECEIVE ////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_onIpcCallbacks = {};

exports.onIpcFromRenderer = function (...args) {
  const callback = g_onIpcCallbacks[args[0]];
  if (callback) callback(...args.slice(1));
  return;
};

function on(id, callback) {
  g_onIpcCallbacks[id] = callback;
}

function initOnIpcCallbacks() {
  on("close", () => {
    onCloseClicked();
  });

  on("show-context-menu", (params) => {
    contextMenu.show("edit", params, onCloseClicked);
  });

  on("open", (comicData) => {
    reader.openBookFromCallback(comicData, getPageCallback);
    onCloseClicked();
  });

  on("search", async (text, pageNum, collection, availability) => {
    try {
      if (text.trim().length === 0) {
        throw "query's text is empty";
      }
      const axios = require("axios").default;
      let searchQuery = `q=(${encodeURIComponent(text)})`;
      let collectionQuery = "";
      if (collection && collection !== "")
        collectionQuery = `+AND+collection%3A(${collection})`;
      let readableQuery = "";
      if (availability == 0) {
        readableQuery = `+AND+lending___status%3A(is_readable)`;
      }
      const response = await axios.get(
        `https://archive.org/advancedsearch.php?${searchQuery}${collectionQuery}+AND+mediatype%3A(texts)${readableQuery}&fl[]=identifier&fl[]=imagecount&fl[]=title&fl[]=creator&sort[]=&sort[]=&sort[]=&rows=${g_queryPageSize}&page=${pageNum}&output=json`,
        { timeout: 10000 }
      );
      sendIpcToRenderer(
        "update-results",
        response.data,
        _("tool-shared-ui-search-nothing-found"),
        text,
        pageNum,
        g_queryPageSize,
        _("tool-shared-ui-search-item-open-acbr"),
        _("tool-shared-ui-search-item-open-browser")
      );
    } catch (error) {
      // console.error(error);
      sendIpcToRenderer(
        "update-results",
        undefined,
        _("tool-shared-ui-search-nothing-found")
      );
    }
  });

  on("open-url-in-browser", (url) => {
    utils.openURL(url);
  });
}

// HANDLE

let g_handleIpcCallbacks = {};

async function handleIpcFromRenderer(...args) {
  const callback = g_handleIpcCallbacks[args[0]];
  if (callback) return await callback(...args.slice(1));
  return;
}
exports.handleIpcFromRenderer = handleIpcFromRenderer;

function handle(id, callback) {
  g_handleIpcCallbacks[id] = callback;
}

function initHandleIpcCallbacks() {}

///////////////////////////////////////////////////////////////////////////////
// TOOL ///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

async function getPageCallback(pageNum, fileData) {
  try {
    const axios = require("axios").default;
    let comicData = fileData.data;
    let imgUrl = `https://archive.org/download/${comicData.comicId}/page/n${
      pageNum - 1
    }/mode/1up`;
    const response = await axios.get(imgUrl, {
      timeout: 10000,
      responseType: "arraybuffer",
    });
    let buf = Buffer.from(response.data, "binary");
    let img64 = "data:image/jpg;base64," + buf.toString("base64");
    return { pageImgSrc: img64, pageImgUrl: imgUrl };
  } catch (error) {
    // console.error(error);
    return undefined;
  }
}
exports.getPageCallback = getPageCallback;

///////////////////////////////////////////////////////////////////////////////
// LOCALIZATION ///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function updateLocalizedText() {
  sendIpcToRenderer(
    "update-localization",
    _("tool-shared-ui-search-placeholder"),
    _("tool-shared-modal-title-searching"),
    getLocalization()
  );
}
exports.updateLocalizedText = updateLocalizedText;

function getLocalization() {
  return [
    {
      id: "tool-iab-title-text",
      text: _("menu-tools-iab").toUpperCase(),
    },
    {
      id: "tool-iab-back-button-text",
      text: _("tool-shared-ui-back-to-reader").toUpperCase(),
    },
    {
      id: "tool-iab-start-button-text",
      text: _("tool-shared-ui-convert").toUpperCase(),
    },
    //////////////////////////////////////////////
    {
      id: "tool-iab-section-0-text",
      text: _("tool-shared-tab-search"),
    },
    {
      id: "tool-iab-section-1-text",
      text: _("tool-shared-tab-options"),
    },
    {
      id: "tool-iab-section-2-text",
      text: _("tool-shared-tab-about"),
    },
    {
      id: "tool-iab-section-3-text",
      text: _("tool-shared-tab-donate"),
    },
    //////////////////////////////////////////////
    {
      id: "tool-iab-search-input-text",
      text: _("tool-shared-ui-search-input"),
    },
    {
      id: "tool-iab-search-input-placeholder-text",
      text: _("tool-shared-ui-search-placeholder"),
    },
    {
      id: "tool-iab-search-button-text",
      text: _("tool-shared-ui-search-button").toUpperCase(),
    },
    {
      id: "tool-iab-search-results-text",
      text: _("tool-shared-ui-search-results"),
    },
    //////////////////////////////////////////////
    {
      id: "tool-iab-options-text",
      text: _("tool-shared-ui-search-options"),
    },
    {
      id: "tool-iab-options-collections-text",
      text: _("tool-iab-options-collections-text"),
    },
    {
      id: "tool-iab-advanced-options-text",
      text: _("tool-shared-ui-advanced-search-options"),
    },
    {
      id: "tool-iab-options-availability-text",
      text: _("tool-iab-options-availability-text"),
    },
    //////////////////////////////////////////////
    {
      id: "tool-iab-about-text",
      text: _("tool-shared-tab-about"),
    },
    {
      id: "tool-iab-about-1-text",
      text: _(
        "tool-shared-ui-about-text-1",
        _("tool-shared-ui-about-text-1-books"),
        "Internet Archive"
      ),
    },
    {
      id: "tool-iab-about-2-text",
      text: _("tool-shared-ui-about-text-2"),
    },
    {
      id: "tool-iab-open-ia-browser-button-text",
      text: _(
        "tool-shared-ui-button-open-websitename-in-browser",
        "Internet Archive"
      ).toUpperCase(),
    },
    //////////////////////////////////////////////
    {
      id: "tool-iab-donate-text",
      text: _("tool-shared-ui-donateto-website", "Internet Archive"),
    },
    {
      id: "tool-iab-donate-1-text",
      text: _("tool-shared-ui-donate-text", "Internet Archive"),
    },
    {
      id: "tool-iab-open-donate-browser-button-text",
      text: _("tool-shared-ui-button-open-donate-browser").toUpperCase(),
    },
    //////////////////////////////////////////////
    {
      id: "tool-iab-modal-close-button-text",
      text: _("tool-shared-ui-close").toUpperCase(),
    },
    {
      id: "tool-iab-modal-cancel-button-text",
      text: _("tool-shared-ui-cancel").toUpperCase(),
    },
    {
      id: "tool-iab-modal-searching-title-text",
      text: _("tool-shared-modal-title-searching").toUpperCase(),
    },
  ];
}
