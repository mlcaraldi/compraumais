import { describe, expect, it } from "vitest";
import {
  excelSerialToIso,
  formatCents,
  maskPhone,
  normalizeDocument,
  normalizePhone,
  normalizeText,
  packTotal,
  parseBrDate,
  parseMoney,
  parseMoneyCents,
  parsePack,
  parseProductCode,
  titleCase,
} from "@/server/normalize";

describe("telefone", () => {
  it.each([
    ["5554996058391", "+5554996058391", "mobile", false],
    ["54999314042", "+5554999314042", "mobile", false],
    ["5436320079", "+555436320079", "landline", false],
    ["5496123757", "+5554996123757", "mobile", true],
    ["054 9961-23757", "+5554996123757", "mobile", false],
    ["(54) 99931-4042", "+5554999314042", "mobile", false],
    ["+55 (54) 3632-0079", "+555436320079", "landline", false],
    ["55 55 99999-1234", "+5555999991234", "mobile", false],
    ["0 15 54 99612-3757", "+5554996123757", "mobile", false],
    ["0 15 55 54 99612-3757", "+5554996123757", "mobile", false],
  ])("%s", (input, e164, kind, fixed) => {
    expect(normalizePhone(input)).toEqual({ e164, kind, fixedNinthDigit: fixed });
  });

  it.each(["996123757", "", null, "12345", "5004999314042", "54899314042", "(54) 1234-5678-99"])(
    "inválido: %s",
    (input) => {
      expect(normalizePhone(input)).toEqual({
        e164: null,
        kind: "invalid",
        fixedNinthDigit: false,
      });
    },
  );

  it("máscara para logs", () => {
    expect(maskPhone("+5554996051234")).toBe("+55549****1234");
  });
});

describe("CPF/CNPJ", () => {
  it("valida CPF e CNPJ conhecidos", () => {
    expect(normalizeDocument("529.982.247-25")).toEqual({
      digits: "52998224725",
      kind: "cpf",
      valid: true,
    });
    expect(normalizeDocument("11.222.333/0001-81")).toEqual({
      digits: "11222333000181",
      kind: "cnpj",
      valid: true,
    });
  });
  it("inválido não bloqueia", () => {
    expect(normalizeDocument("11111111111")).toMatchObject({ kind: "cpf", valid: false });
    expect(normalizeDocument("123")).toMatchObject({ kind: null, valid: false });
    expect(normalizeDocument(null)).toMatchObject({ digits: "", valid: false });
  });
  it("recupera zero à esquerda perdido pela planilha", () => {
    expect(normalizeDocument("1234567000195")).toEqual({
      digits: "01234567000195",
      kind: "cnpj",
      valid: true,
    });
    expect(normalizeDocument("1234567890")).toEqual({
      digits: "01234567890",
      kind: "cpf",
      valid: true,
    });
  });
});

describe("dinheiro", () => {
  it.each([
    ["R$ 1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["19,39", 19.39],
    ["R$19,39/kg", 19.39],
    ["R$ 4,95/pacote", 4.95],
    ["4.95", 4.95],
    ["1.234", 1234],
    [27.9, 27.9],
  ])("%s", (input, n) => {
    expect(parseMoney(input)).toBe(n);
  });
  it("centavos inteiros e formatação", () => {
    expect(parseMoneyCents("16,64")).toBe(1664);
    expect(parseMoneyCents("45,54")).toBe(4554);
    expect(parseMoneyCents("sem preço")).toBeNull();
    expect(formatCents(13470)).toBe("R$ 134,70");
    expect(formatCents(123456)).toBe("R$ 1.234,56");
  });
});

describe("embalagem", () => {
  it.each([
    ["PCT 5KG", { qty: 1, unitSize: 5000, unit: "g" }],
    ["2KG", { qty: 1, unitSize: 2000, unit: "g" }],
    ["20X400G", { qty: 20, unitSize: 400, unit: "g" }],
    ["CX C/12 UN", { qty: 12, unit: "un" }],
    ["1,05 kg", { qty: 1, unitSize: 1050, unit: "g" }],
    ["12X1L", { qty: 12, unitSize: 1000, unit: "ml" }],
    ["VG VAGEM 2KG CG CONFRESCOR", { qty: 1, unitSize: 2000, unit: "g" }],
    ["SALAME FATIADO 100 G CX C/12", { qty: 12, unitSize: 100, unit: "g" }],
    ["AZEITE 500ML", { qty: 1, unitSize: 500, unit: "ml" }],
  ])("%s", (input, expected) => {
    expect(parsePack(input)).toEqual(expected);
  });
  it("não adivinha", () => {
    expect(parsePack("MOLHO ESPECIAL")).toBeNull();
    expect(parsePack("")).toBeNull();
    expect(parsePack(null)).toBeNull();
  });
  it("total da embalagem", () => {
    expect(packTotal(parsePack("20X400G"))).toBe(8000);
    expect(packTotal(parsePack("CX C/12 UN"))).toBe(12);
    expect(packTotal(null)).toBeNull();
  });
});

describe("código de produto", () => {
  it.each([
    ["Cód. 134911", "134911", false],
    ["CÓDIGO 134.352", "134352", false],
    ["COD 169.115", "169115", false],
    ["134911", "134911", false],
    [108624, "108624", false],
    ["CÓD. 168.90", "16890", true],
    ["CÓD. 94.2", null, true],
    ["ABC", null, false],
    ["123", null, false],
    ["12345678", null, false],
  ])("%s", (input, code, ambiguous) => {
    expect(parseProductCode(input)).toEqual({ code, ambiguous });
  });
});

describe("datas", () => {
  it("serial do Excel", () => {
    expect(excelSerialToIso(43103)).toBe("2018-01-03");
    expect(excelSerialToIso(46296)).toBe("2026-10-01");
    expect(excelSerialToIso(0)).toBeNull();
  });
  it("dd/mm/aaaa e dd/mm", () => {
    const today = new Date("2026-10-07T12:00:00Z");
    expect(parseBrDate("14/12/2026", today)).toBe("2026-12-14");
    expect(parseBrDate("12/10", today)).toBe("2026-10-12");
    expect(parseBrDate("01/03", today)).toBe("2027-03-01");
    expect(parseBrDate("10/05", today)).toBe("2026-05-10");
    expect(parseBrDate("31/02/2026", today)).toBeNull();
    expect(parseBrDate("lixo", today)).toBeNull();
  });
});

describe("texto", () => {
  it("normaliza e corrige perú", () => {
    expect(normalizeText("  Peito de  perú (2 Farias) ")).toBe("PEITO DE PERU (2 FARIAS)");
    expect(normalizeText(null)).toBe("");
  });
  it("título", () => {
    expect(titleCase("RESTAURANTE E CAFE CULTURA")).toBe("Restaurante e Cafe Cultura");
  });
});
