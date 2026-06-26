import { describe, it, expect } from "vitest";
import fs from "fs";

const db = JSON.parse(
  fs.readFileSync("./data/words-etymology-db.json", "utf8"),
);

const { words } = db;

describe("dictionary data", () => {
  it("contains honest as Old French", () => {
    const word = words.find((w) => w.word === "honest");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old French");
  });
  it("contains honesty as Old French", () => {
    const word = words.find((w) => w.word === "honesty");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old French");
  });
  it("contains honestly as Old French", () => {
    const word = words.find((w) => w.word === "honestly");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old French");
  });
  it("contains dishonest as Old French", () => {
    const word = words.find((w) => w.word === "dishonest");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old French");
  });
  it("contains dishonesty as Old French", () => {
    const word = words.find((w) => w.word === "dishonesty");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old French");
  });
  it("contains dishonestly as Old French", () => {
    const word = words.find((w) => w.word === "dishonestly");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old French");
  });
  /*
  it("contains unhonest as Old French", () => {
    const word = words.find((w) => w.word === "unhonest");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old French");
  });
  it("contains unhonesty as Latin", () => {
    const word = words.find((w) => w.word === "unhonesty");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Latin");
  });
  it("contains unhonestly as Latin", () => {
    const word = words.find((w) => w.word === "unhonestly");
    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Latin");
  });
*/
  it("contains look as Germanic", () => {
    const word = words.find((w) => w.word === "look");

    expect(word).toBeDefined();
    expect(word.source_lang).toBe("Old English");
  });

  /*
  it("has honesty redirecting to honest", () => {
    const honest = words.find((w) => w.word === "honestly");

    expect(honest).toBeDefined();
    expect(honest.source_lang).toBe("Old French");
  });
  */
});
