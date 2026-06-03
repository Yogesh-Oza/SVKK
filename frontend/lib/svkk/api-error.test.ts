import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";
import { getSvkkErrorCode, getSvkkErrorMessage } from "./api-error";

function axiosErrorWithBody(status: number, body: object): AxiosError {
  const response = { status, data: body } as AxiosResponse;
  return new AxiosError("Request failed", undefined, undefined, undefined, response);
}

describe("getSvkkErrorMessage", () => {
  it("returns API message from axios error body", () => {
    const err = axiosErrorWithBody(409, {
      code: "DUPLICATE_CSV_IMPORT",
      message: "This file was already imported successfully",
    });
    expect(getSvkkErrorMessage(err, "Import failed")).toBe(
      "This file was already imported successfully",
    );
  });

  it("falls back when body has no message", () => {
    expect(getSvkkErrorMessage(new Error("network"), "Import failed")).toBe("network");
    expect(getSvkkErrorMessage("x", "Import failed")).toBe("Import failed");
  });
});

describe("getSvkkErrorCode", () => {
  it("returns API code from axios error body", () => {
    const err = axiosErrorWithBody(409, {
      code: "DUPLICATE_CSV_IMPORT",
      message: "duplicate",
    });
    expect(getSvkkErrorCode(err)).toBe("DUPLICATE_CSV_IMPORT");
  });
});
