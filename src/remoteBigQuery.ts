import { BigQuery, BigQueryDatetime } from "@google-cloud/bigquery";
import { writeToPath } from "@fast-csv/format";
import { CsvToExcel } from "./csvToExcel";
import * as os from "os";
import * as format from "date-format";
import { getSelectedText } from "./utils";
import { OutputChannel } from "vscode";

export class RemoteBigQuery {
  csvToExcel: CsvToExcel;
  tempDir: string;
  debugChannel: OutputChannel;

  constructor(csvToExcel: CsvToExcel, debugChannel: OutputChannel) {
    this.csvToExcel = csvToExcel;
    this.debugChannel = debugChannel;
    this.tempDir = os.tmpdir();
  }

  async executeQuery() {
    let text = getSelectedText()!;
    this.writeDebug("BQ EXECUTE: " + text);
    await this.openInExcel(text);
  }

  async openInExcel(query: string) {
    let exportDate = new Date();
    let timestamp = format.asString("yyyy_MM_dd_hh_mm_ss", exportDate);

    let resultsName = `bigquery_results`;
    let filename = `bigquery_results_${timestamp}.csv`;
    let filepath = `${this.tempDir}\\${filename}`;

    let rows = await this.getQueryResults(query);

    this.writeDebug("BQ WRITE TO: " + filepath);
    this.writeToCsv(rows, filepath);

    this.csvToExcel.open(filepath, resultsName, timestamp);
  }

  async getQueryResults(query: string) {
    const bigquery = new BigQuery();

    const options = {
      query: query,
    };

    const [job] = await bigquery.createQueryJob(options);
    const [rows] = await job.getQueryResults();

    return rows;
  }

  writeToCsv(rows: any[], filepath: string) {
    // TODO: Handle case where no rows are returned - throw error?
    if (rows.length > 0) {
      const fieldNames = Object.keys(rows[0]);
      const parsedRows = rows.map((r) => this.parseRow(r, fieldNames));
      const csvOptions = { headers: fieldNames, writeHeaders: true };

      writeToPath(filepath, parsedRows, csvOptions)
        .on("error", (err) => console.error(err))
        .on("finish", () => console.log("Done writing."));
    }
  }

  // ITableCell is of type any
  parseRow(row: any, fieldNames: string[]): string[] {
    let parsedRow: string[] = [];
    for (let fieldName of fieldNames) {
      let field = row[fieldName];

      let fieldParsers: Record<
        string,
        ((field: any) => string | undefined) | undefined
      > = {
        number: (field: number) => {
          return field.toString();
        },
        string: (field: string) => {
          return field;
        },
        object: (field: object) => {
          if (field === null) {
            return "";
          } else {
            let constructor: string = field.constructor.name;
            let parsingFunc = objectParsers[constructor];
            if (parsingFunc) {
              return parsingFunc(field);
            } else {
              return undefined;
            }
          }
        },
      };

      let objectParsers: Record<string, ((field: any) => string) | undefined> =
        {
          BigQueryDatetime: (field: BigQueryDatetime) => {
            return field.value;
          },
          Big: (field: any) => {
            return field.toString();
          },
        };

      let parsingFunc = fieldParsers[typeof field];
      if (parsingFunc !== undefined) {
        let parsedField = parsingFunc(field);
        if (parsedField !== undefined) {
          parsedRow.push(parsedField);
        } else {
          throw "unhandled object type " + field.constructor.name;
        }
      } else {
        throw "unhandled value type " + typeof field;
      }
    }

    return parsedRow;
  }

  writeDebug(text: string) {
    this.debugChannel.appendLine(text);
  }
}
