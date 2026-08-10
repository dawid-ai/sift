import { describe, it, expect } from "vitest";
import { filterOptions } from "./filter-options";

const options = [
  { value: "", label: "All channels" },
  { value: "veritasium", label: "Veritasium" },
  { value: "3b1b", label: "3Blue1Brown" },
];

describe("filterOptions", () => {
  it("returns everything for a blank or whitespace query", () => {
    expect(filterOptions(options, "")).toEqual(options);
    expect(filterOptions(options, "   ")).toEqual(options);
  });
  it("matches a substring anywhere in the label, case-insensitively", () => {
    expect(filterOptions(options, "BLUE").map((o) => o.value)).toEqual(["3b1b"]);
    expect(filterOptions(options, "an").map((o) => o.value)).toEqual([""]);
  });
  it("matches on the label, not the value", () => {
    expect(filterOptions(options, "3b1b")).toEqual([]);
  });
  it("returns nothing when no label matches", () => {
    expect(filterOptions(options, "zzz")).toEqual([]);
  });
});
