/**
 * @license
 * Copyright 2024-2025 Álvaro García
 * www.binarynonsense.com
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  sendIpcToMain as coreSendIpcToMain,
  sendIpcToMainAndWait as coreSendIpcToMainAndWait,
} from "../../core/renderer.js";
import * as modals from "../../shared/renderer/modals.js";

///////////////////////////////////////////////////////////////////////////////
// SETUP //////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_isInitialized = false;
let g_extraLocalization = {};

let g_searchInput;
let g_searchButton;
let g_lastSearchResults;

let g_favorites;

export function needsScrollToTopButtonUpdate() {
  return true;
}

function init(
  section,
  favorites,
  noResultsText,
  openInAcbrText,
  openInBrowserText,
  addToFavoritesText,
  removeFromFavoritesText
) {
  if (!g_isInitialized) {
    // things to start only once go here
    g_isInitialized = true;
  }
  document.getElementById("tools-columns-right").scrollIntoView({
    behavior: "instant",
    block: "start",
    inline: "nearest",
  });

  // menu buttons
  document
    .getElementById("tool-radio-back-button")
    .addEventListener("click", (event) => {
      sendIpcToMain("close");
    });
  // sections menu
  for (let index = 0; index < 4; index++) {
    document
      .getElementById(`tool-radio-section-${index}-button`)
      .addEventListener("click", (event) => {
        switchSection(index);
      });
  }

  ////////////////////////////////////////

  // favorites
  g_favorites = favorites;
  document
    .getElementById("tool-radio-clear-favorites-button")
    .addEventListener("click", (event) => {
      sendIpcToMain("on-clear-favorites-clicked");
    });

  // search
  g_searchButton = document.getElementById("tool-radio-search-button");
  g_searchButton.addEventListener("click", (event) => {
    onSearch();
  });

  g_searchInput = document.getElementById("tool-radio-search-input");
  g_searchInput.placeholder = g_extraLocalization.searchPlaceHolderText;
  g_searchInput.addEventListener("input", function (event) {
    if (g_searchInput.value !== "") {
      g_searchButton.classList.remove("tools-disabled");
    } else {
      g_searchButton.classList.add("tools-disabled");
    }
  });
  g_searchInput.addEventListener("keypress", function (event) {
    if (
      event.key === "Enter" &&
      !document
        .getElementById("tool-search-input-div")
        .classList.contains("set-display-none")
    ) {
      event.preventDefault();
      if (g_searchInput.value) {
        onSearch();
      }
    }
  });

  document
    .getElementById("tool-radio-open-radio-browser-button")
    .addEventListener("click", (event) => {
      openRadioBrowserLink(`https://www.radio-browser.info/`);
    });

  ////////////////////////////////////////

  switchSection(section);
  if (g_lastSearchResults) {
    updateSearchResults(
      g_lastSearchResults,
      noResultsText,
      openInAcbrText,
      openInBrowserText,
      addToFavoritesText,
      removeFromFavoritesText
    );
  }
  updateColumnsHeight();
}

export function initIpc() {
  initOnIpcCallbacks();
}

function updateColumnsHeight(scrollTop = false) {
  const left = document.getElementById("tools-columns-left");
  const right = document.getElementById("tools-columns-right");
  left.style.minHeight = right.offsetHeight + "px";
  if (scrollTop) {
    document.getElementById("tools-columns-right").scrollIntoView({
      behavior: "instant",
      block: "start",
      inline: "nearest",
    });
  }
}

function switchSection(id) {
  for (let index = 0; index < 4; index++) {
    if (id === index) {
      document
        .getElementById(`tool-radio-section-${index}-button`)
        .classList.add("tools-menu-button-selected");
      document
        .getElementById(`tool-radio-section-${index}-content-div`)
        .classList.remove("set-display-none");
    } else {
      document
        .getElementById(`tool-radio-section-${index}-button`)
        .classList.remove("tools-menu-button-selected");
      document
        .getElementById(`tool-radio-section-${index}-content-div`)
        .classList.add("set-display-none");
    }

    if (index === 1) {
      g_searchInput.focus();
    } else if (index === 0) {
      buildFavorites();
    }
  }
  updateColumnsHeight(true);
}

//////////////////////////////////////////////////////////////////////////////
// IPC SEND ///////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export function sendIpcToMain(...args) {
  coreSendIpcToMain("tool-radio", ...args);
}

async function sendIpcToMainAndWait(...args) {
  return await coreSendIpcToMainAndWait("tool-radio", ...args);
}

///////////////////////////////////////////////////////////////////////////////
// IPC RECEIVE ////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_onIpcCallbacks = {};

export function onIpcFromMain(args) {
  const callback = g_onIpcCallbacks[args[0]];
  if (callback) callback(...args.slice(1));
  return;
}

function on(id, callback) {
  g_onIpcCallbacks[id] = callback;
}

function initOnIpcCallbacks() {
  on("show", (...args) => {
    init(...args);
  });

  on("hide", () => {});

  on("update-localization", (localization, extraLocalization) => {
    for (let index = 0; index < localization.length; index++) {
      const element = localization[index];
      const domElement = document.querySelector("#" + element.id);
      if (domElement !== null) {
        domElement.innerHTML = element.text;
      }
    }
    g_extraLocalization = extraLocalization;
  });

  on("update-window", () => {
    updateColumnsHeight();
  });

  on("close-modal", () => {
    if (g_openModal) {
      modals.close(g_openModal);
      modalClosed();
    }
  });

  /////////////////////////////////////////////////////////////////////////////

  on("rebuild-favorites", (favorites) => {
    g_favorites = favorites;
    buildFavorites();
    updateColumnsHeight();
  });

  on("show-modal-clear-favorites", (...args) => {
    showModalClearFavorites(...args);
  });

  on(
    "on-favorites-reset",
    (
      favorites,
      noResultsText,
      openInAcbrText,
      openInBrowserText,
      addToFavoritesText,
      removeFromFavoritesText
    ) => {
      g_favorites = favorites;
      buildFavorites();
      if (g_lastSearchResults) {
        updateSearchResults(
          g_lastSearchResults,
          noResultsText,
          openInAcbrText,
          openInBrowserText,
          addToFavoritesText,
          removeFromFavoritesText
        );
      }
      updateColumnsHeight();
      closeModal();
    }
  );

  /////////////////////////////////////////////////////////////////////////////

  on("modal-update-title-text", (text) => {
    updateModalTitleText(text);
  });

  on("update-info-text", (text) => {
    updateInfoText(text);
  });

  on("update-log-text", (text) => {
    updateLogText(text);
  });

  /////////////////////////////////////////////////////////////////////////////

  on(
    "update-results",
    (
      searchResults,
      scrollToTop,
      noResultsText,
      openInAcbrText,
      openInBrowserText,
      addToFavoritesText,
      removeFromFavoritesText
    ) => {
      updateSearchResults(
        searchResults ? searchResults : g_lastSearchResults,
        scrollToTop,
        noResultsText,
        openInAcbrText,
        openInBrowserText,
        addToFavoritesText,
        removeFromFavoritesText
      );
      closeModal();
    }
  );

  /////////////////////////////////////////////////////////////////////////////

  on("show-modal-add-favorite", (...args) => {
    showModalAddFavorite(...args);
  });

  on("show-modal-favorite-options", (...args) => {
    showModalFavoriteOptions(...args);
  });

  on("show-modal-favorite-edit-name", (...args) => {
    showModalFavoriteEditName(...args);
  });

  on("show-modal-favorite-edit-url", (...args) => {
    showModalFavoriteEditURL(...args);
  });
}

///////////////////////////////////////////////////////////////////////////////
// TOOL ///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function buildFavorites() {
  const favoritesDiv = document.querySelector("#tool-radio-favorites-div");
  favoritesDiv.innerHTML = "";

  let listDiv = document.createElement("div");
  listDiv.classList.add("hs-path-cards-list-single");
  listDiv.style = "padding-top: 5px;";
  favoritesDiv.appendChild(listDiv);

  if (g_favorites) {
    let index = 0;
    for (; index < g_favorites.length; index++) {
      listDiv.appendChild(getNewCardDiv(g_favorites[index], index));
    }
  }
}

function getNewCardDiv(data, index) {
  const cardDiv = document.createElement("div");
  const iconHtml = `
  <i class="hs-path-card-image-file fas fa-file-audio fa-2x fa-fw"></i>`;
  const buttonHtml = `
  <div class="hs-path-card-button hs-path-interactive">
    <i class="fas fa-ellipsis-h"></i>
  </div>`;

  cardDiv.classList.add("hs-path-card");
  cardDiv.innerHTML = `<div class="hs-path-card-main hs-path-interactive">
  <div class="hs-path-card-image">
    ${iconHtml}
  </div>
  <div class="hs-path-card-content">
    <span>${data.name}</span
    ><span>${data.url}</span>
      </div>
  </div>
  ${buttonHtml}`;

  const mainCardDiv = cardDiv.querySelector(".hs-path-card-main");
  mainCardDiv.title = g_extraLocalization.modalOpenInPlayerTitleText;

  mainCardDiv.addEventListener("click", function (event) {
    showModalOpenInPlayer(
      { stationuuid: "", name: data.name, url_resolved: data.url },
      g_extraLocalization.modalOpenInPlayerTitleText,
      g_extraLocalization.modalCancelButtonText,
      g_extraLocalization.modalAddToPlaylistButtonText,
      g_extraLocalization.modalNewPlaylistButtonText
    );
  });

  const buttonDiv = cardDiv.querySelector(".hs-path-card-button");
  buttonDiv.title = g_extraLocalization.options;
  buttonDiv.addEventListener("click", function (event) {
    sendIpcToMain("on-favorite-options-clicked", index, data.url);
    event.stopPropagation();
  });

  return cardDiv;
}

////////////////////////////

function updateSearchResults(
  searchResults,
  scrollToTop,
  noResultsText,
  openInAcbrText,
  openInBrowserText,
  addToFavoritesText,
  removeFromFavoritesText
) {
  let scrollTopPos = document.getElementById("tools").scrollTop;
  // console.log(searchResults);
  g_lastSearchResults = searchResults;
  ///////////////////////////////////////////
  document
    .querySelector("#tool-search-results-h3")
    .classList.remove("set-display-none");
  const searchResultsDiv = document.querySelector(
    "#tool-radio-search-results-div"
  );
  searchResultsDiv.innerHTML = "";
  if (searchResults && searchResults.length > 0) {
    // list
    let ul = document.createElement("ul");
    ul.className = "tools-collection-ul";
    for (let index = 0; index < searchResults.length; index++) {
      const stationData = searchResults[index];
      // create html
      let li = document.createElement("li");
      li.className = "tools-buttons-list-li";
      let buttonSpan = document.createElement("span");
      buttonSpan.className = "tools-buttons-list-button";
      buttonSpan.innerHTML = `<i class="fas fa-file-audio fa-2x"></i>`;
      buttonSpan.title = openInAcbrText;
      let multilineText = document.createElement("span");
      multilineText.className = "tools-buttons-list-li-multiline-text";
      {
        let text = document.createElement("span");
        text.innerText = `${stationData.name}`;
        multilineText.appendChild(text);

        text = document.createElement("span");
        let extraData = `${stationData.bitrate} kbps | ${stationData.codec} | ${
          stationData.countrycode
        } | ${stationData.language} | ${stationData.tags.replaceAll(
          ",",
          ", "
        )}`;
        text.innerHTML = extraData;
        multilineText.appendChild(text);

        text = document.createElement("span");
        text.innerText = `${stationData.url_resolved}`;
        multilineText.appendChild(text);
      }
      buttonSpan.appendChild(multilineText);
      buttonSpan.addEventListener("click", (event) => {
        onSearchResultClicked(index, 0);
      });
      li.appendChild(buttonSpan);
      {
        let buttonSpan = document.createElement("span");
        buttonSpan.className = "tools-buttons-list-button";
        let isFavorited = false;
        for (let i = 0; i < g_favorites.length; i++) {
          if (g_favorites[i].url == stationData.url_resolved) {
            isFavorited = true;
            break;
          }
        }
        if (!isFavorited) {
          buttonSpan.innerHTML = `<i class="fa-regular fa-heart"></i>`;
          buttonSpan.title = addToFavoritesText;
          buttonSpan.addEventListener("click", (event) => {
            onSearchResultClicked(
              index,
              2,
              buttonSpan,
              `<i class="fa-solid fa-heart"></i>`,
              removeFromFavoritesText
            );
          });
        } else {
          buttonSpan.innerHTML = `<i class="fa-solid fa-heart"></i>`;
          buttonSpan.title = removeFromFavoritesText;
          buttonSpan.addEventListener("click", (event) => {
            onSearchResultClicked(
              index,
              3,
              buttonSpan,
              `<i class="fa-regular fa-heart"></i>`,
              addToFavoritesText
            );
          });
        }
        li.appendChild(buttonSpan);
      }
      {
        let buttonSpan = document.createElement("span");
        buttonSpan.className = "tools-buttons-list-button";
        buttonSpan.innerHTML = `<i class="fas fa-external-link-alt"></i>`;
        buttonSpan.title = openInBrowserText;
        buttonSpan.addEventListener("click", (event) => {
          onSearchResultClicked(index, 1);
        });
        li.appendChild(buttonSpan);
      }
      ul.appendChild(li);
    }
    searchResultsDiv.appendChild(ul);
  } else {
    let ul = document.createElement("ul");
    ul.className = "tools-collection-ul";
    let li = document.createElement("li");
    li.className = "tools-collection-li";
    let text = document.createElement("span");
    text.innerText = noResultsText;
    li.appendChild(text);
    ul.appendChild(li);
    searchResultsDiv.appendChild(ul);
  }
  ///////////////////////////////////////////
  updateColumnsHeight();
  if (scrollToTop) {
    document.getElementById("tools-columns-right").scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  } else {
    document.getElementById("tools").scrollTop = scrollTopPos;
  }
}

//////////////////////////////////////

async function onSearch() {
  if (!g_openModal) showSearchModal(); // TODO: check if first time?
  updateModalTitleText(g_extraLocalization.modalSearchingTitleText);
  sendIpcToMain("search", g_searchInput.value, {
    order: document.querySelector("#tool-radio-options-orderby-select").value,
    language: document.querySelector("#tool-radio-options-language-input")
      .value,
    countrycode: document.querySelector("#tool-radio-options-countrycode-input")
      .value,
    tag: document.querySelector("#tool-radio-options-tag-input").value,
    taglist: document.querySelector("#tool-radio-options-taglist-input").value,
  });
}

async function onSearchResultClicked(index, mode, element, innerHtml, tooltip) {
  if (!g_lastSearchResults) return;
  const stationData = g_lastSearchResults[index];
  if (mode === 0) {
    showModalOpenInPlayer(
      stationData,
      g_extraLocalization.modalOpenInPlayerTitleText,
      g_extraLocalization.modalCancelButtonText,
      g_extraLocalization.modalAddToPlaylistButtonText,
      g_extraLocalization.modalNewPlaylistButtonText
    );
  } else if (mode === 1) {
    openStationLink(stationData.url_resolved);
  } else if (mode === 2) {
    const stationData = g_lastSearchResults[index];
    // element.innerHTML = innerHtml;
    // element.title = tooltip;
    sendIpcToMain(
      "on-add-result-to-favorites-clicked",
      stationData.name,
      stationData.url_resolved
    );
  } else if (mode === 3) {
    const stationData = g_lastSearchResults[index];
    // element.innerHTML = innerHtml;
    // element.title = tooltip;
    sendIpcToMain(
      "on-remove-result-from-favorites-clicked",
      stationData.name,
      stationData.url_resolved
    );
  }
}

//////////////////////////////////////

function openRadioBrowserLink(url) {
  const tmp = document.createElement("a");
  tmp.href = url;
  if (tmp.host === "www.radio-browser.info") {
    sendIpcToMain("open-url-in-browser", url);
  }
}

function openStationLink(url) {
  sendIpcToMain("open-url-in-browser", url);
}

///////////////////////////////////////////////////////////////////////////////
// EVENT LISTENERS ////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

export function onInputEvent(type, event) {
  if (getOpenModal()) {
    modals.onInputEvent(getOpenModal(), type, event);
    return;
  }
  switch (type) {
    case "onkeydown": {
      if (event.key == "Tab") {
        event.preventDefault();
      }
      break;
    }
  }
}

export function onContextMenu(params) {
  if (getOpenModal()) {
    return;
  }
  sendIpcToMain("show-context-menu", params);
}

///////////////////////////////////////////////////////////////////////////////
// MODALS /////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_openModal;

export function getOpenModal() {
  return g_openModal;
}

function closeModal() {
  if (g_openModal) {
    modals.close(g_openModal);
    modalClosed();
  }
}

function modalClosed() {
  g_openModal = undefined;
}

function updateModalTitleText(text) {
  if (g_openModal) g_openModal.querySelector(".modal-title").innerHTML = text;
}

function updateInfoText(text) {
  if (g_openModal) g_openModal.querySelector(".modal-message").innerHTML = text;
}

function updateLogText(text, append = true) {
  if (g_openModal) {
    const log = g_openModal.querySelector(".modal-log");
    if (append) {
      log.innerHTML += "\n" + text;
    } else {
      log.innerHTML = text;
    }
    log.scrollTop = log.scrollHeight;
  }
}

function showSearchModal() {
  if (g_openModal) {
    return;
  }
  g_openModal = modals.show({
    title: " ",
    message: " ",
    zIndexDelta: 5,
    frameWidth: 600,
    close: {
      callback: () => {
        modalClosed();
      },
      // key: "Escape",
      hide: true,
    },
    progressBar: {},
  });
}

function showModalOpenInPlayer(
  stationData,
  title,
  textButtonBack,
  textButtonAddToPlayList,
  textButtonNewPlaylist,
  showFocus
) {
  if (g_openModal) {
    closeModal();
  }
  let buttons = [];
  buttons.push({
    text: textButtonAddToPlayList.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
      sendIpcToMain(
        "open",
        stationData.stationuuid,
        stationData.name,
        stationData.url_resolved,
        0
      );
    },
  });
  buttons.push({
    text: textButtonNewPlaylist.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
      sendIpcToMain(
        "open",
        stationData.stationuuid,
        stationData.name,
        stationData.url_resolved,
        1
      );
    },
  });
  buttons.push({
    text: textButtonBack.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
    },
  });
  g_openModal = modals.show({
    showFocus: showFocus,
    title: title,
    message: stationData.url_resolved,
    frameWidth: 400,
    zIndexDelta: 5,
    close: {
      callback: () => {
        modalClosed();
      },
      key: "Escape",
    },
    buttons: buttons,
  });
}

function showModalFavoriteOptions(
  index,
  url,
  title,
  textButtonBack,
  textButtonRemove,
  textButtonEditName,
  textButtonEditURL,
  textButtonMoveUp,
  textButtonMoveDown,
  showFocus
) {
  if (getOpenModal()) {
    return;
  }

  let buttons = [];
  buttons.push({
    text: textButtonEditName.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
      sendIpcToMain("on-modal-favorite-options-edit-name-clicked", index, url);
    },
  });
  buttons.push({
    text: textButtonEditURL.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
      sendIpcToMain("on-modal-favorite-options-edit-url-clicked", index, url);
    },
  });
  buttons.push({
    text: textButtonMoveUp.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
      sendIpcToMain("on-modal-favorite-options-move-clicked", index, url, 0);
    },
  });
  buttons.push({
    text: textButtonMoveDown.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
      sendIpcToMain("on-modal-favorite-options-move-clicked", index, url, 1);
    },
  });
  buttons.push({
    text: textButtonRemove.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
      sendIpcToMain("on-modal-favorite-options-remove-clicked", index, url);
    },
  });
  buttons.push({
    text: textButtonBack.toUpperCase(),
    fullWidth: true,
    callback: () => {
      modalClosed();
    },
  });

  g_openModal = modals.show({
    showFocus: showFocus,
    title: title,
    frameWidth: 400,
    zIndexDelta: 5,
    close: {
      callback: () => {
        modalClosed();
      },
      key: "Escape",
    },
    buttons: buttons,
  });
}

function showModalFavoriteEditName(
  index,
  url,
  name,
  title,
  textButton1,
  textButton2
) {
  if (getOpenModal()) {
    return;
  }

  g_openModal = modals.show({
    title: title,
    zIndexDelta: 5,
    input: { type: "text", default: name },
    close: {
      callback: () => {
        modalClosed();
      },
      key: "Escape",
    },
    buttons: [
      {
        text: textButton1.toUpperCase(),
        callback: (showFocus, value) => {
          sendIpcToMain(
            "on-modal-favorite-options-edit-name-ok-clicked",
            index,
            url,
            value
          );
          modalClosed();
        },
        key: "Enter",
      },
      {
        text: textButton2.toUpperCase(),
        callback: () => {
          modalClosed();
        },
      },
    ],
  });
}

function showModalFavoriteEditURL(index, url, title, textButton1, textButton2) {
  if (getOpenModal()) {
    return;
  }

  g_openModal = modals.show({
    title: title,
    zIndexDelta: 5,
    input: { type: "text", default: url },
    close: {
      callback: () => {
        modalClosed();
      },
      key: "Escape",
    },
    buttons: [
      {
        text: textButton1.toUpperCase(),
        callback: (showFocus, value) => {
          sendIpcToMain(
            "on-modal-favorite-options-edit-url-ok-clicked",
            index,
            url,
            value
          );
          modalClosed();
        },
        key: "Enter",
      },
      {
        text: textButton2.toUpperCase(),
        callback: () => {
          modalClosed();
        },
      },
    ],
  });
}

////

function showModalClearFavorites(title, message, textButton1, textButton2) {
  if (getOpenModal()) {
    return;
  }

  g_openModal = modals.show({
    title,
    message,
    zIndexDelta: 5,
    close: {
      callback: () => {
        modalClosed();
      },
      key: "Escape",
    },
    buttons: [
      {
        text: textButton1.toUpperCase(),
        callback: () => {
          sendIpcToMain("on-modal-reset-favorites-ok-clicked");
          modalClosed();
        },
      },
      {
        text: textButton2.toUpperCase(),
        callback: () => {
          modalClosed();
        },
      },
    ],
  });
}
