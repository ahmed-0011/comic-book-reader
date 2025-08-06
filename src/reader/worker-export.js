/**
 * @license
 * Copyright 2020-2025 Álvaro García
 * www.binarynonsense.com
 * SPDX-License-Identifier: BSD-2-Clause
 */

const fs = require("fs");
const path = require("path");
const FileType = require("file-type");
const fileFormats = require("../shared/main/file-formats");
const { FileExtension, FileDataType } = require("../shared/main/constants");

let g_useUtilityProcess = false;

process.on("message", (message) => {
  g_useUtilityProcess = false;
  exportPage(
    message.data,
    message.outputFolderPath,
    message.sendToTool,
    message.tempSubFolderPath
  );
});

process.parentPort?.once("message", async (event) => {
  g_useUtilityProcess = true;
  let message = event.data;
  exportPage(
    message.data,
    message.outputFolderPath,
    message.sendToTool,
    message.tempSubFolderPath
  );
});

async function exportPage(
  fileData,
  outputFolderPath,
  sendToTool,
  tempSubFolderPath
) {
  try {
    let buf;
    if (fileData.type === FileDataType.ZIP) {
      // buf = fileFormats.extractZipEntryBuffer(
      //   fileData.path,
      //   fileData.pagesPaths[fileData.pageIndex],
      //   fileData.password
      // );
      const result = await fileFormats.extract7ZipEntryBuffer(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex],
        fileData.password,
        tempSubFolderPath,
        "zip"
      );
      if (result.success) {
        buf = result.data;
      } else {
        throw result.data;
      }
    } else if (fileData.type === FileDataType.RAR) {
      buf = await fileFormats.extractRarEntryBuffer(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex],
        fileData.password,
        tempSubFolderPath
      );
    } else if (fileData.type === FileDataType.SEVENZIP) {
      const result = await fileFormats.extract7ZipEntryBuffer(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex],
        fileData.password,
        tempSubFolderPath
      );
      if (result.success) {
        buf = result.data;
      } else {
        throw result.data;
      }
    } else if (fileData.type === FileDataType.EPUB_COMIC) {
      let data = await fileFormats.extractEpubImageBuffer(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex]
      );
      buf = data[0];
    } else if (fileData.type === FileDataType.IMGS_FOLDER) {
      const fullPath = path.join(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex]
      );
      buf = fs.readFileSync(fullPath);
    } else if (fileData.type === FileDataType.WWW) {
      const axios = require("axios").default;
      const response = await axios(fileData.pagesPaths[0], {
        responseType: "arraybuffer",
      });
      buf = Buffer.from(response.data, "binary");
    }

    // mostly duplicated code from main's exportPageSaveBuffer because I
    // don't know how to send the buffer back (send doesn't seem to work
    // for binary data)
    if (buf === undefined) {
      send([false, "Error: exportPage empty buffer"]);
    } else {
      (async () => {
        let fileType = await FileType.fromBuffer(buf);
        let fileExtension = "." + FileExtension.JPG;
        if (fileType !== undefined) {
          fileExtension = "." + fileType.ext;
        }
        let fileName =
          path.basename(fileData.name, path.extname(fileData.name)) +
          "_page_" +
          (fileData.pageIndex + 1);

        let outputFilePath = path.join(
          outputFolderPath,
          fileName + fileExtension
        );
        let i = 1;
        while (fs.existsSync(outputFilePath)) {
          i++;
          outputFilePath = path.join(
            outputFolderPath,
            fileName + "(" + i + ")" + fileExtension
          );
        }

        fs.writeFileSync(outputFilePath, buf, "binary");

        send([true, outputFilePath, sendToTool]);
      })();
    }
  } catch (err) {
    send([false, err]);
  }
}

function send(message) {
  if (g_useUtilityProcess) {
    process.parentPort.postMessage(message);
  } else {
    process.send(message);
  }
}
