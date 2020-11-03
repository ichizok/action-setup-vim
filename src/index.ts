import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as io from "@actions/io";
import {ActionError} from "./action_error";
import {VimType, isVimType} from "./interfaces";
import * as cache from "@actions/cache";
import {getInstaller} from "./get_installer";
import {TEMP_PATH} from "./temp";

const actionVersion = "1.0.6";

function makeCacheKey(vimType: VimType, isGUI: boolean, vimVersion: string): string {
  return `${actionVersion}-${process.platform}-${vimType}-${isGUI ? "gui" : "cui"}-${vimVersion}`;
}


async function main(): Promise<void> {
  const installPath = path.join(TEMP_PATH, "vim");

  const vimType = core.getInput("vim_type").toLowerCase();
  if (!isVimType(vimType)) {
    throw new ActionError(`Invalid vim_type: ${vimType}`);
  }

  const download = core.getInput("download");
  const isGUI = core.getInput("gui") === "yes";
  const inputVimVersion = core.getInput("vim_version");
  const installer = getInstaller(installPath, vimType, isGUI, download, inputVimVersion);

  const fixedVersion = await installer.resolveVersion(inputVimVersion);
  core.info(`Vim version: ${fixedVersion}`);

  let installed = false;
  try {
    const stat = fs.statSync(installPath);
    installed = stat.isDirectory();
  } catch (e) {
    // path not exist
  }

  if (!installed) {
    if (process.platform === "darwin") {
      // Workaround:
      // Building Vim before v8.2.1119 on MacOS will fail because default Xcode was chaged to 12.
      // https://github.com/actions/virtual-environments/commit/c09dca28df69d9aaaeac5635257d23722810d307#diff-7a1606bd717fc0cf55f9419157117d9ca306f91bd2fdfc294720687d7be1b2c7R220
      // We change using version of Xcode to 11 to build old Vim.
      process.env["DEVELOPER_DIR"] = "/Applications/Xcode_11.7.app/Contents/Developer";
    }

    await io.mkdirP(installPath);

    const useCache = installer.installType == "build" && core.getInput("cache") === "true";

    if (useCache) {
      const cacheExists = await cache.restoreCache([installPath], makeCacheKey(vimType, isGUI, fixedVersion), []);
      if (!cacheExists) {
        await installer.install(fixedVersion);
        core.saveState("version", fixedVersion);
        core.saveState("install_path", installPath);
      }
    } else {
      core.info("Cache disabled");
      await installer.install(fixedVersion);
    }
  }

  core.addPath(installer.getPath(fixedVersion));
  core.setOutput("actual_vim_version", fixedVersion);
  core.setOutput("executable", installer.getExecutableName());
  core.setOutput("install_type", installer.installType);
}

async function post(): Promise<void> {
  const version = core.getState("version");
  if (version) {
    const vimType = core.getInput("vim_type").toLowerCase();
    const isGUI = core.getInput("gui") === "yes";
    const installPath = core.getState("install_path");
    if (isVimType(vimType)) {
      try {
        await cache.saveCache([installPath], makeCacheKey(vimType, isGUI, version));
      } catch (e) {
        if (!(/Cache already exists/.test(e.message))) {
          throw e;
        }
      }
    }
  }
}

async function run(): Promise<void> {
  const isPost = !!core.getState("isPost");
  if (isPost) {
    await post();
  } else {
    core.saveState("isPost", "true");
    await main();
  }
}


run().catch(e => {
  if (!(e instanceof ActionError) && e.stack) {
    core.error(e.stack);
  }
  const message = e.message || JSON.stringify(e);
  core.setFailed(message);
});