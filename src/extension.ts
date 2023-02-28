import * as vscode from "vscode";
import * as path from "path";
import { RemoteBigQuery } from "./remoteBigQuery";
import { RemoteSAS } from "./remoteSas";
import { CsvToExcel } from "./csvToExcel";

export async function activate(context: vscode.ExtensionContext) {
  console.log("RemoteTools activated");

  const vbsScriptPath = context.asAbsolutePath(
    path.join("resources", "view_data_in_excel.vbs")
  );

  const debugChannel = vscode.window.createOutputChannel("RemoteToolsDebug");

  const csvToExcel = new CsvToExcel(vbsScriptPath);
  const remoteSAS = new RemoteSAS("RemoteTools", csvToExcel, debugChannel);
  const remoteBigQuery = new RemoteBigQuery(csvToExcel, debugChannel);

  let disposableExecuteSasCode = vscode.commands.registerCommand(
    "RemoteTools.executeSasCode",
    () => {
      remoteSAS.executeCode();
    }
  );

  let disposableViewFiveHundredSas = vscode.commands.registerCommand(
    "RemoteTools.viewFiveHundredSas",
    () => {
      remoteSAS.viewFiveHundred();
    }
  );

  let disposableViewAllSas = vscode.commands.registerCommand(
    "RemoteTools.viewAllSas",
    () => {
      remoteSAS.viewAll();
    }
  );

  let disposableQueryBigQuery = vscode.commands.registerCommand(
    "RemoteTools.queryBigQuery",
    async () => {
      await remoteBigQuery.executeQuery();
    }
  );

  context.subscriptions.push(disposableExecuteSasCode);
  context.subscriptions.push(disposableViewFiveHundredSas);
  context.subscriptions.push(disposableViewAllSas);
  context.subscriptions.push(disposableQueryBigQuery);
}
