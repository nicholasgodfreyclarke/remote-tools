import * as vscode from "vscode";
import { OutputChannel } from "vscode";
import { Client, ClientChannel, SFTPWrapper } from "ssh2";
import { EventEmitter } from "events";
import * as os from "os";
import * as format from "date-format";
import { CsvToExcel } from "./csvToExcel";
import { getSelectedText } from "./utils";

class RemoteSasEmitter extends EventEmitter {
  channel: OutputChannel;

  constructor(channel: OutputChannel, options?: any) {
    super(options);
    this.channel = channel;
  }

  emit(eventName: string, ...args: any[]): boolean {
    this.channel.appendLine("EMIT: " + eventName);
    return super.emit(eventName, ...args);
  }

  once(eventName: string, listener: (...args: any[]) => void): this {
    this.channel.appendLine("ONCE: " + eventName);
    super.once(eventName, listener);
    return this;
  }
}

const CSV_EXPORT_EVENT = "csv export complete";
const SAS_INITIALISED_EVENT = "sas initialised";
const WORKPATH_RETRIEVED_EVENT = "workpath retrieved";

const WORKPATH_START = "***INTERNAL_USE_WORKPATH_START***";
const WORKPATH_END = "***INTERNAL_USE_WORKPATH_END***";
const CSV_EXPORT_END = "***INTERNAL_USE_CSV_EXPORT_COMPLETE***";

interface Config {
  host: string;
  port: number;
  username: string;
  password: string;
  noterminal: boolean;
}

export class RemoteSAS {
  outputChannel: OutputChannel;
  debugChannel: OutputChannel;
  sasInitialized: boolean;
  workpath: string | null;
  awaitingWorkpath: boolean;
  emitter: RemoteSasEmitter;
  stream: ClientChannel | null;
  sftp: SFTPWrapper | null;
  csvToExcel: CsvToExcel;
  tempDir: string;
  configSection: string;

  constructor(
    configSection: string,
    csvToExcel: CsvToExcel,
    debugChannel: OutputChannel
  ) {
    this.configSection = configSection;

    this.sasInitialized = false;
    this.workpath = null;
    this.awaitingWorkpath = false;
    this.stream = null;
    this.sftp = null;

    this.tempDir = os.tmpdir();

    this.outputChannel = vscode.window.createOutputChannel("RemoteSAS");
    this.debugChannel = debugChannel;

    this.emitter = new RemoteSasEmitter(this.debugChannel);
    this.csvToExcel = csvToExcel;

    this.outputChannel.show();
  }

  getConfiguration(): Config {
    // Don't cache in case the user changes settings
    const config = vscode.workspace.getConfiguration(this.configSection);

    return {
      host: config.get("host"),
      port: config.get("port"),
      username: config.get("username"),
      password: config.get("password"),
      noterminal: config.get("noterminal"),
    };
  }

  writeOutput(text: string) {
    this.outputChannel.appendLine(text);
  }

  writeDebug(text: string) {
    this.debugChannel.appendLine(text);
  }

  showMessage(message: string, severity: "information" | "error") {
    // This method is used to ensure than messages shown to the user are also logged to debug
    if (severity === "information") {
      vscode.window.showInformationMessage(message);
    } else {
      vscode.window.showErrorMessage(message);
    }
    this.writeDebug(message);
  }

  initSSH() {
    let conn = new Client();

    this.showMessage("initializing connection", "information");

    conn
      .on("ready", () => {
        this.writeDebug("SSH Client :: ready");

        conn.shell((err, stream) => {
          if (err) {
            throw err;
          }

          this.stream = stream;

          stream
            .on("close", () => {
              this.writeDebug("Stream :: close");
              conn.end();
            })
            .on("data", (data: Buffer) => {
              let processedData = this.processData(data.toString());

              this.writeOutput(processedData);
            });

          // -nodms opens SAS in interactive mode
          // -noterminal stops SAS from attempting to connect to the X server with using proc export
          // (no idea why it tries to do this)
          // (also makes the output really ugly)
          // stream.stdin.write('sas -nodms -noterminal\n');

          // Remove -noterminal as it has an issue where if there is an error in a
          // data step it is unable to recover and SAS must be restarted

          // -LINESIZE MAX is for two reasons:
          // a) The default linesize is too small
          // b) Stops SAS from printing ***INTERNAL_USE_WORKPATH*** and the workpath on different lines - makes my job easier
          // stream.stdin.write('sas -nodms -LINESIZE MAX\n');

          if (this.getConfiguration().noterminal) {
            stream.stdin.write("sas -nodms -LINESIZE MAX\n");
          } else {
            stream.stdin.write("sas -nodms -noterminal -LINESIZE MAX\n");
          }
        });
      })
      .on("error", (e: Error) => {
        this.showMessage(e.message, "error");

        if (Object.keys(e).includes("code")) {
          if (e["code"] === "ENOTFOUND") {
            this.showMessage("Are you connected to VPN?", "information");
          }
        }
      })

      .on("end", () => {
        this.showMessage("connection ended", "information");
        this.sasInitialized = false;
      })

      .on("close", () => {
        this.showMessage("connection closed", "information");
        this.sasInitialized = false;
      })

      .on("timeout", () => {
        this.showMessage("connection timeout", "information");
        this.sasInitialized = false;
      })

      .connect(this.getConfiguration());
  }

  initFtp() {
    let conn = new Client();

    conn
      .on("ready", () => {
        this.writeDebug("SFTP Client :: ready");

        conn.sftp((err, sftp) => {
          if (err) {
            throw err;
          }
          this.sftp = sftp;
        });
      })
      .connect(this.getConfiguration());
  }

  setup() {
    this.initSSH();
    this.initFtp();
  }

  executeCode() {
    this.writeDebug("SAS CALLED: executeCode");

    let text = getSelectedText()!;
    if (!this.sasInitialized) {
      this.emitter.once(SAS_INITIALISED_EVENT, () => {
        this.sasInitialized = true;
        this.sendCode(text);
      });
      this.setup();
    } else {
      this.sendCode(text);
    }
  }

  sendCode(text: string) {
    text = text.trim() + "\n";
    this.writeDebug("SAS SENDCODE: " + text);
    this.stream!.write(text);
  }

  processData(data: string) {
    // Need to trim as sometimes the text is prepended with a bunch of whitespace
    let text = data.trim();

    if (text.startsWith(WORKPATH_START)) {
      // If the line overflows -> cleanText with end with the next line number of the form "123?" -> remove it
      text = text.replace(/\d+\?$/, "").trim();
      if (text.endsWith(WORKPATH_END)) {
        this.workpath = text.split(" ")[1].trim();
        this.emitter.emit(WORKPATH_RETRIEVED_EVENT);
      } else {
        this.awaitingWorkpath = true;
        this.workpath = text.slice(
          WORKPATH_START.length,
          text.length - WORKPATH_START.length
        );
      }
    } else if (this.awaitingWorkpath) {
      if (text.endsWith(WORKPATH_END)) {
        this.awaitingWorkpath = false;
        this.workpath += text.slice(0, text.length - WORKPATH_END.length);
        this.workpath = this.workpath!.trim();
        this.emitter.emit(WORKPATH_RETRIEVED_EVENT);
      } else {
        this.workpath += text;
      }
    } else if (text.startsWith(CSV_EXPORT_END)) {
      this.emitter.emit(CSV_EXPORT_EVENT);
    } else if (text.startsWith("1?") && !this.sasInitialized) {
      this.emitter.emit(SAS_INITIALISED_EVENT);
    }

    return text;
  }

  viewFiveHundred() {
    this.viewData(500);
  }

  viewAll() {
    this.viewData();
  }

  viewData(obs?: number) {
    let selection = getSelectedText()!;

    let re = new RegExp("^[A-Za-z_][A-Za-z0-9_]{0,31}$");

    let lib: string;
    let datasetName: string;

    if (selection.indexOf(".") === -1) {
      lib = "work";
      datasetName = selection;

      if (re.exec(selection) === null) {
        this.showMessage(`Not a valid data name: ${selection}`, "information");
        return;
      }
    } else {
      let splitSelection = selection.split(".");

      if (splitSelection.length > 2) {
        this.showMessage(`Too many periods: ${selection}`, "information");
        return;
      }

      [lib, datasetName] = splitSelection;

      if (re.exec(lib) === null) {
        this.showMessage(`Not a valid library name: ${selection}`, "information");
        
        return;
      }
      if (re.exec(datasetName) === null) {
        this.showMessage(`Not a valid dataset name: ${selection}`, "information");
        return;
      }
    }

    if (!this.workpath) {
      // Set up listener before sending code
      this.emitter.once(WORKPATH_RETRIEVED_EVENT, () => {
        this.writeDebug("WORKPATH: " + this.workpath);
        this.openInExcel(lib, datasetName, obs);
      });
      const RETRIEVE_WORKPATH_COMMAND = `%put ${WORKPATH_START} %sysfunc(pathname(work)) ${WORKPATH_END};`;
      this.sendCode(RETRIEVE_WORKPATH_COMMAND);
    } else {
      this.openInExcel(lib, datasetName, obs);
    }
  }

  openInExcel(lib: string, datasetName: string, obs?: number) {
    let outfile = obs
      ? `${lib}_${datasetName}_${obs}_obs.csv`
      : `${lib}_${datasetName}.csv`;
    let remoteFilePath = `${this.workpath}/${outfile}`;

    // Due to PROC EXPORT attempting to connect to the X display, I have written
    // my own csv export below.
    // http://support.sas.com/techsup/notes/v8/3/610.html

    let exportObs = obs ? `(obs=${obs})` : "";

    let csvExportCode = `proc sql noprint;
          select quote(CATS(name)) into :csv_header SEPARATED BY ','
          from dictionary.columns
          where LIBNAME='${lib.toUpperCase()}' AND MEMNAME='${datasetName.toUpperCase()}';
          QUIT;
          DATA _null_;
          set ${lib}.${datasetName}${exportObs};
          file '${remoteFilePath}' dsd lrecl=32767;
          IF _N_=1 THEN PUT  "%BQUOTE(&csv_header)";
          put (_all_) (:);
          RUN;
          %put ${CSV_EXPORT_END};
          `;

    this.emitter.once(CSV_EXPORT_EVENT, () => {
      let exportDate = new Date();
      let timestamp = format.asString("yyyy_MM_dd_hh_mm_ss", exportDate);

      let resultsName = `${lib}.${datasetName}`;
      let localFilename = `${lib}_${datasetName}_${obs}_obs_${timestamp}.csv`;
      let localFilepath = `${this.tempDir}\\${localFilename}`;

      this.sftp!.fastGet(remoteFilePath, localFilepath, {}, (downloadError) => {
        if (downloadError) {
          throw downloadError;
        }
        this.writeDebug(remoteFilePath + " downloaded to " + localFilepath);
        this.csvToExcel.open(localFilepath, resultsName, timestamp);
      });
    });

    this.sendCode(csvExportCode);
  }
}
