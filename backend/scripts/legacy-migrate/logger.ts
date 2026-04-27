import fs from "node:fs";
import path from "node:path";
import type { MigrationLogLine } from "./types.js";
import { migrationVersion } from "./config/migration.js";

export class JsonlLogger {
  private stream: fs.WriteStream;
  constructor(logFilePath: string) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    this.stream = fs.createWriteStream(logFilePath, { flags: "a" });
  }

  write(line: Omit<MigrationLogLine, "migrationVersion" | "ts"> & { migrationVersion?: string }) {
    const full: MigrationLogLine = {
      ...line,
      migrationVersion: line.migrationVersion ?? migrationVersion,
      ts: new Date().toISOString(),
    };
    this.stream.write(`${JSON.stringify(full)}\n`);
  }

  end(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.end(() => resolve());
      this.stream.on("error", reject);
    });
  }
}
