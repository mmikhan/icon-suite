"use strict";
/* global __static */
import fs from "fs";
import svgo from "svgo";
import Path from "path";
import copyDirectory from "@mazik/fs-easy-dir-copy";
import readdirRecursive from "@aboviq/readdir-recursive";
import { app, protocol, BrowserWindow, dialog, ipcMain } from "electron";
import {
  createProtocol,
  installVueDevtools
} from "vue-cli-plugin-electron-builder/lib";
const isDevelopment = process.env.NODE_ENV !== "production";

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

let willQuitApp = false;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } }
]);

makeSingleInstance();

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 675,
    minHeight: 210,
    title: app.name,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/configuration.html#node-integration for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION
    }
  });

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    createProtocol("app");
    // Load the index.html when not in development
    win.loadURL("app://./index.html");
  }

  win.on("page-title-updated", event => {
    event.preventDefault();
  });

  win.on("close", event => {
    if (willQuitApp) {
      win = null;
    } else {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }

  win.show();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    // Devtools extensions are broken in Electron 6.0.0 and greater
    // See https://github.com/nklayman/vue-cli-plugin-electron-builder/issues/378 for more info
    // Electron will not launch with Devtools extensions installed on Windows 10 with dark mode
    // If you are not using Windows 10 dark mode, you may uncomment these lines
    // In addition, if the linked issue is closed, you can upgrade electron and uncomment these lines
    try {
      await installVueDevtools();
    } catch (e) {
      console.error("Vue Devtools failed to install:", e.toString());
    }
  }
  createWindow();

  if (!fs.existsSync(`${app.getPath("userData")}/Icons`)) {
    try {
      fs.mkdirSync(`${app.getPath("userData")}/Icons/`, { recursive: true });
    } catch (error) {
      return dialog.showErrorBox(
        "An error occurred during Icons directory creation",
        error.toString()
      );
    }
  }
});

ipcMain.on("startup", event => {
  if (!fs.existsSync(`${app.getPath("userData")}/Icons`)) {
    try {
      fs.mkdirSync(`${app.getPath("userData")}/Icons/`, { recursive: true });
    } catch (error) {
      return dialog.showErrorBox(
        "An error occurred during Icons directory creation",
        error.toString()
      );
    }
  }

  getAllSvgIcons(`${app.getPath("userData")}/Icons`).then(response => {
    event.reply("get-icon-svg", response);
    event.reply("loading-status", false);
  });
});

ipcMain.on("import-icon-path", event => {
  dialog
    .showOpenDialog(win, {
      buttonLabel: "Import",
      properties: ["openDirectory"]
    })
    .then(result => {
      if (result.canceled) return;
      event.reply("loading-status", true);

      if (
        fs.existsSync(
          `${app.getPath("userData")}/Icons/${Path.basename(
            result.filePaths.toString()
          )}`
        )
      ) {
        event.reply("loading-status", false);

        throw new Error("Destination folder already exists.");
      }

      copyDirectory(
        `${result.filePaths.toString()}`,
        `${app.getPath("userData")}/Icons/${Path.basename(
          result.filePaths.toString()
        )}`
      )
        .then(() => {
          getAllSvgIcons(
            `${app.getPath("userData")}/Icons/${Path.basename(
              result.filePaths.toString()
            )}`
          ).then(response => {
            event.reply("get-icon-svg", response);
            event.reply("loading-status", false);
          });
        })
        .catch(error => {
          event.reply("loading-status", false);

          throw new Error(error);
        });
    })
    .catch(error => {
      dialog.showErrorBox("An error occurred during import", error.toString());
    });
});

ipcMain.on("export-icon", (event, Svg) => {
  dialog
    .showSaveDialog(win, {
      defaultPath: Svg.name,
      nameFieldLabel: "name field",
      properties: ["createDirectory", "showOverwriteConfirmation"]
    })
    .then(result => {
      if (result.canceled) return;

      try {
        fs.writeFileSync(result.filePath, Svg.icon);
      } catch (error) {
        alert(`An error occurred: ${event} – ${error.toString()}`);
      }
    });
});

ipcMain.on("onDragStart", (event, filePath) => {
  event.sender.startDrag({
    file: filePath,
    icon: Path.join(__static, "img/drag.png")
  });
});

ipcMain.on("error", (event, data) => {
  dialog.showErrorBox(`An error occurred: ${event} :`, data.toString());
});

app.on("before-quit", () => {
  willQuitApp = true;
});

// Make this app a single instance app.
//
// The main window will be restored and focused instead of a second window
// opened when a person attempts to launch a second instance.
//
// Returns true if the current version of the app should quit instead of
// launching.
function makeSingleInstance() {
  if (process.mas) return;

  app.requestSingleInstanceLock();

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();

      win.focus();
    }
  });
}

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", data => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}

async function getAllFiles(path) {
  const onlySvgFiles = ({ file }) => /.svg/.test(file);
  const ignoreGitDirectory = ({ stats, dir }) =>
    stats.isDirectory() && dir !== ".git";

  return await readdirRecursive(path, {
    filter: onlySvgFiles,
    recurse: ignoreGitDirectory
  });
}

async function getAllSvgIcons(path) {
  return await getAllFiles(path).then(response => {
    let icons = [];

    response.forEach(async item => {
      icons.push({
        name: Path.basename(item),
        size: fs.statSync(item).size,
        date: fs.statSync(item).birthtime,
        author: Path.basename(Path.dirname(item)),
        storage: `${app.getPath("userData")}/Icons`,
        path: Path.join(Path.dirname(item), Path.basename(item)),
        icon: await optimizeSvg(fs.readFileSync(item).toString(), item)
      });
    });

    return icons;
  });
}

async function optimizeSvg(svg, item) {
  const result = await new svgo({
    plugins: [
      {
        removeDimensions: true
      },
      {
        removeAttrs: {
          attrs: "(class)"
        }
      }
    ]
  }).optimize(svg, { path: item });

  return result.data;
}
