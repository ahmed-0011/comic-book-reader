/**
 * @license
 * Copyright 2020-2025 Álvaro García
 * www.binarynonsense.com
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { on, sendIpcToMain, showNoBookContent } from "./renderer.js";
import { setScrollBarsPosition, setFilterClass } from "./renderer-ui.js";

export function initIpc() {
  initOnIpcCallbacks();
}

///////////////////////////////////////////////////////////////////////////////
// IPC RECEIVE ////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function initOnIpcCallbacks() {
  on("load-pdf", (filePath, pageIndex, password) => {
    loadPdf(filePath, pageIndex, password);
  });

  on("render-pdf-page", (pageIndex, rotation, scrollBarPos) => {
    showNoBookContent(false);
    renderPdfPage(pageIndex, rotation, scrollBarPos);
  });

  on("refresh-pdf-page", (rotation) => {
    refreshPdfPage(rotation);
  });

  on(
    "extract-pdf-image-buffer",
    (filePath, pageNum, outputFolderPath, password, sendToTool) => {
      extractPDFImageBuffer(
        filePath,
        pageNum,
        outputFolderPath,
        password,
        sendToTool
      );
    }
  );
}

///////////////////////////////////////////////////////////////////////////////
// PDF ////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_currentPdf = {};

export function cleanUp() {
  g_currentPdf = {};
}

function loadPdf(filePath, pageIndex, password) {
  // pdfjsLib.GlobalWorkerOptions.workerSrc =
  //   "../assets/libs/pdfjs-2.3.200/build/pdf.worker.js";
  let escapedInputFilePath = filePath.replaceAll("#", "%23");
  // hashtags must be escaped so PDF.js doesn't break trying to parse
  // the path, as it looks for patterns like #page=2&zoom=200
  var loadingTask = pdfjsLib.getDocument({
    url: escapedInputFilePath,
    password: password,
    isEvalSupported: false,
  });
  loadingTask.promise
    .then(function (pdf) {
      cleanUp();
      g_currentPdf.pdf = pdf;
      //console.log(g_currentPdf.pdf);
      g_currentPdf.pdf
        .getMetadata()
        .then(function (metadata) {
          sendIpcToMain(
            "pdf-loaded",
            filePath,
            pageIndex,
            g_currentPdf.pdf.numPages,
            {
              encrypted: password && password.trim() !== "",
              creator: metadata.info.Creator,
              producer: metadata.info.Producer,
              created: metadata.info.CreationDate,
              modified: metadata.info.ModDate,
              format: "PDF " + metadata.info.PDFFormatVersion,
              author: metadata.info.Author,
              subject: metadata.info.Subject,
              keywords: metadata.info.Keywords,
              title: metadata.info.Title,
            }
          );
        })
        .catch(function (error) {
          // keep on anyway
          sendIpcToMain(
            "pdf-loaded",
            filePath,
            pageIndex,
            g_currentPdf.pdf.numPages,
            { encrypted: password && password.trim() !== "" }
          );
        });
    })
    .catch((error) => {
      sendIpcToMain("pdf-load-failed", error);
    });
}

function refreshPdfPage(rotation) {
  if (g_currentPdf.page) {
    renderCurrentPDFPage(rotation, undefined, false);
  }
}

function renderPdfPage(pageIndex, rotation, scrollBarPos) {
  let pageNum = pageIndex + 1; // pdfjs counts from 1
  // ref: https://mozilla.github.io/pdf.js/examples/
  g_currentPdf.pdf.getPage(pageNum).then(
    function (page) {
      g_currentPdf.page = page;
      renderCurrentPDFPage(rotation, scrollBarPos, true);
    },
    function (reason) {
      // PDF loading error
      console.error(reason);
    }
  );
}

function renderCurrentPDFPage(rotation, scrollBarPos, sendPageLoaded) {
  // I recreate the canvas every time to avoid some rendering issues when rotating (low res)
  // there's probably a better way, but performance seems similar
  let containerDiv = document.getElementById("pages-container");
  containerDiv.innerHTML = "";
  var canvas = document.createElement("canvas");
  canvas.classList.add("page-canvas");
  canvas.classList.add("page");
  const pagesRowDiv = document.createElement("div");
  pagesRowDiv.classList.add("pages-row");
  containerDiv.appendChild(pagesRowDiv);
  pagesRowDiv.innerHTML = "";
  pagesRowDiv.appendChild(canvas);
  setFilterClass(canvas);
  var context = canvas.getContext("2d");

  var desiredWidth = canvas.offsetWidth;
  var viewport = g_currentPdf.page.getViewport({
    scale: 1,
    rotation,
  });
  var scale = desiredWidth / viewport.width;
  var scaledViewport = g_currentPdf.page.getViewport({
    scale: scale,
    rotation,
  });

  canvas.height = scaledViewport.height;
  canvas.width = desiredWidth;

  var renderContext = {
    canvasContext: context,
    viewport: scaledViewport,
  };

  let renderTask = g_currentPdf.page.render(renderContext);
  renderTask.promise.then(function () {
    setScrollBarsPosition(scrollBarPos);
    if (sendPageLoaded) {
      const [x1, y1, x2, y2] = g_currentPdf.page.view;
      const width = x2 - x1;
      const height = y2 - y1;
      sendIpcToMain("page-loaded", {
        dimensions: [width, height],
      });
    }
  });
}

async function extractPDFImageBuffer(
  filePath,
  pageNum,
  outputFolderPath,
  password,
  sendToTool
) {
  // pdfjsLib.GlobalWorkerOptions.workerSrc =
  //   "../assets/libs/pdfjs-2.3.200/build/pdf.worker.js";
  let escapedInputFilePath = filePath.replaceAll("#", "%23");
  // hashtags must be escaped so PDF.js doesn't break trying to parse
  // the path, as it looks for patterns like #page=2&zoom=200
  try {
    const pdf = await pdfjsLib.getDocument({
      url: escapedInputFilePath,
      password: password,
      isEvalSupported: false,
    }).promise;
    let page = await pdf.getPage(pageNum);
    let pageWidth = page.view[2]; // [left, top, width, height]
    let pageHeight = page.view[3];
    let userUnit = page.userUnit; // 1 unit = 1/72 inch
    let dpi = 300; // use userUnit some day (if > 1) to set dpi?
    let iPerUnit = 1 / 72;
    let scaleFactor = dpi * iPerUnit; // default: output a 300dpi image instead of 72dpi, which is the pdf default?
    // resize if too big?
    let bigSide = pageHeight;
    if (pageHeight < pageWidth) bigSide = pageWidth;
    let scaledSide = bigSide * scaleFactor;
    if (scaledSide > 5000) {
      console.log("reducing PDF scale factor, img too big");
      scaleFactor = 5000 / bigSide;
      dpi = parseInt(scaleFactor / iPerUnit);
    }
    // RENDER
    const canvas = document.createElement("canvas");
    let viewport = page.getViewport({
      scale: scaleFactor,
    });
    let context = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    ////////////////////////////
    // check embedded imgs size
    // ref: https://codepen.io/allandiego/pen/RwVGbyj
    const operatorList = await page.getOperatorList();
    const validTypes = [
      pdfjsLib.OPS.paintImageXObject,
      pdfjsLib.OPS.paintJpegXObject,
      //pdfjsLib.OPS.paintImageXObjectRepeat,
    ];
    let images = [];
    operatorList.fnArray.forEach((element, index) => {
      if (validTypes.includes(element)) {
        images.push(operatorList.argsArray[index][0]);
      }
    });
    if (images.length === 1) {
      // could be a comic book, let's extract the image
      const imageName = images[0];
      // page needs to have been rendered before for this to be filled
      let image;
      try {
        image = await page.objs.get(imageName);
      } catch (error) {
        image = undefined;
      }
      if (image !== undefined && image !== null) {
        const imageWidth = image.width;
        const imageHeight = image.height;
        if (imageWidth >= pageWidth && imageHeight >= pageHeight) {
          scaleFactor = imageWidth / pageWidth;
          dpi = parseInt(scaleFactor / iPerUnit);
          // render again with new dimensions
          viewport = page.getViewport({
            scale: scaleFactor,
          });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport: viewport })
            .promise;
        }
      }
    }
    //////////////////////////////
    let dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    page.cleanup();
    pdf.cleanup();
    pdf.destroy();
    sendIpcToMain(
      "pdf-page-dataurl-extracted",
      undefined,
      dataUrl,
      dpi,
      outputFolderPath,
      sendToTool
    );
  } catch (err) {
    console.log(err);
    sendIpcToMain(
      "pdf-page-dataurl-extracted",
      err,
      undefined,
      undefined,
      outputFolderPath,
      sendToTool
    );
  }
}
