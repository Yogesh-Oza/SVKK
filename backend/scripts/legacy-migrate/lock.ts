import fs from "node:fs";
import path from "node:path";

export async function acquireMigrationLock(lockPath: string): Promise<() => Promise<void>> {
  await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
  let fh: fs.promises.FileHandle;
  try {
    fh = await fs.promises.open(lockPath, "wx");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EEXIST") {
      throw new Error(
        `Migration lock already held: ${lockPath}. Another import may be running, or delete the lock file if stale.`,
      );
    }
    throw e;
  }
  await fh.writeFile(String(process.pid), "utf8");
  await fh.close();

  let released = false;
  return async function release() {
    if (released) return;
    released = true;
    try {
      await fs.promises.unlink(lockPath);
    } catch {
      /* ignore */
    }
  };
}
