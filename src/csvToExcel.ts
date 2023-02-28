import * as os from "os";
import * as format from "date-format";
import { spawn } from "child_process";

export class CsvToExcel {
  vsbScriptPath: string;
  tempDir: string;
  workbookName: string;
  sheetNum: number;

  constructor(vbsScriptPath: string) {
    this.vsbScriptPath = vbsScriptPath;
    this.tempDir = os.tmpdir();
    this.sheetNum = 1;

    this.workbookName =
      "Query Results " +
      format.asString("yyyy_MM_dd_hh_mm_ss", new Date()) +
      ".xlsx";
  }

  open(filepath: string, resultsetName: string, timestamp: string) {
    spawn("wscript.exe", [
      this.vsbScriptPath,
      this.tempDir,
      this.workbookName,
      filepath,
      this.sheetNum.toString(),
      resultsetName,
      timestamp,
    ]);
    this.sheetNum++;
  }
}
