import * as fs from "fs";
import * as path from "path";
import {extractZip, extractTar} from "@actions/tool-cache";
import {exec} from "@actions/exec";
import {SemverReleasesInstaller} from "./semver_releases_installer";
import {FixedVersion} from "../interfaces";

export abstract class NeovimReleasesInstaller extends SemverReleasesInstaller {
  readonly repository: string = "neovim/neovim";

  async install(vimVersion: FixedVersion): Promise<void> {
    const archiveFilePath = await this.downloadAsset(vimVersion);
    const ext = path.extname(archiveFilePath).toLowerCase();
    const installDir =
      ext === ".zip" ?
        await extractZip(archiveFilePath, this.installDir) :
        await extractTar(archiveFilePath, this.installDir);
    const dirs = fs.readdirSync(installDir);
    if (dirs.length !== 1) {
      throw new Error(`Unexpected archive entries: ${JSON.stringify(dirs)}`);
    }
    await exec("bash", ["-c", `mv '${dirs[0]}'/* .`], {cwd: installDir});
    fs.rmdirSync(path.join(installDir, dirs[0]));
  }

  getPath(): string {
    return path.join(this.installDir, "bin");
  }

  getExecutableName(): string {
    return "nvim";
  }
}
