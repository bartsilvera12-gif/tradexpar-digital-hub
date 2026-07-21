import { describe, it, expect } from "vitest";
import { getDisplayProductName } from "./productHelpers";

describe("getDisplayProductName", () => {
  it("expande la abreviatura AURI de Fastrax", () => {
    expect(getDisplayProductName("AURI HEADSET FTX H10-BK NEGRO 124764")).toBe(
      "AURICULAR HEADSET FTX H10-BK NEGRO 124764"
    );
    expect(getDisplayProductName("AURI EARPHONE FTX E68-PK BT/MIC ROSA")).toBe(
      "AURICULAR EARPHONE FTX E68-PK BT/MIC ROSA"
    );
  });

  it("no toca nombres que ya dicen AURICULAR", () => {
    expect(getDisplayProductName("AURICULAR GAMER CON MICROFONO")).toBe(
      "AURICULAR GAMER CON MICROFONO"
    );
  });

  it("solo matchea palabra completa", () => {
    expect(getDisplayProductName("AURIS PRO")).toBe("AURIS PRO");
    expect(getDisplayProductName("SAURI 12")).toBe("SAURI 12");
  });

  it("respeta la caja del original", () => {
    expect(getDisplayProductName("auri earphone")).toBe("auricular earphone");
    expect(getDisplayProductName("Auri Earphone")).toBe("Auricular Earphone");
  });

  it("tolera nombres vacíos o nulos", () => {
    expect(getDisplayProductName("")).toBe("");
    expect(getDisplayProductName(null)).toBe("");
    expect(getDisplayProductName(undefined)).toBe("");
  });
});
