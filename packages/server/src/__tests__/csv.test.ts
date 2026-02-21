import { describe, it, expect } from "vitest";
import { parseCSVLine } from "../utils/csv.js";

describe("parseCSVLine", () => {
  it("parses simple comma-separated values", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around values", () => {
    expect(parseCSVLine("  a , b , c  ")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas inside", () => {
    expect(parseCSVLine('"hello, world",b,c')).toEqual([
      "hello, world",
      "b",
      "c",
    ]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', "b"]);
  });

  it("handles empty values", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles a single value", () => {
    expect(parseCSVLine("only")).toEqual(["only"]);
  });

  it("handles an empty string", () => {
    expect(parseCSVLine("")).toEqual([""]);
  });

  it("handles quoted field with newline characters preserved", () => {
    // Within a single line, newlines wouldn't appear, but if they do:
    expect(parseCSVLine('"line1\nline2",b')).toEqual(["line1\nline2", "b"]);
  });

  it("handles mixed quoted and unquoted fields", () => {
    expect(parseCSVLine('name,"New York, NY",10001')).toEqual([
      "name",
      "New York, NY",
      "10001",
    ]);
  });

  it("handles numeric values", () => {
    expect(parseCSVLine("1,2.5,300")).toEqual(["1", "2.5", "300"]);
  });
});
