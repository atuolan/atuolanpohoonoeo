/**
 * Unit Tests for XmlFuzzyRepair
 * Feature: group-chat
 */

import { describe, expect, it } from "vitest";
import { repairXmlTags } from "../XmlFuzzyRepair";

describe("XmlFuzzyRepair", () => {
  describe("extra spaces in tags", () => {
    it("removes leading space in opening tag", () => {
      const result = repairXmlTags("< msg>hello</msg>");
      expect(result.content).toBe("<msg>hello</msg>");
      expect(result.wasRepaired).toBe(true);
      expect(result.logs.some((l) => l.rule === "extra-space-in-tag")).toBe(
        true,
      );
    });

    it("removes leading space in closing tag", () => {
      const result = repairXmlTags("<msg>hello< /msg>");
      expect(result.content).toBe("<msg>hello</msg>");
      expect(result.wasRepaired).toBe(true);
    });

    it("handles spaces in recall and dm tags", () => {
      const r1 = repairXmlTags('< recall name="A">x</recall>');
      expect(r1.content).toBe('<recall name="A">x</recall>');

      const r2 = repairXmlTags('< dm name="A">x</dm>');
      expect(r2.content).toBe('<dm name="A">x</dm>');
    });
  });

  describe("extra symbols before tag name", () => {
    it("removes dash before tag name", () => {
      const result = repairXmlTags("<-pay>520</pay>");
      expect(result.content).toBe("<pay>520</pay>");
      expect(result.wasRepaired).toBe(true);
      expect(
        result.logs.some((l) => l.rule === "extra-symbol-before-tag"),
      ).toBe(true);
    });

    it("removes dash before msg tag", () => {
      const result = repairXmlTags('<-msg name="A">hello</msg>');
      expect(result.content).toBe('<msg name="A">hello</msg>');
    });
  });

  describe("spelling variants", () => {
    it("fixes <messge> to <msg>", () => {
      const result = repairXmlTags("<messge>hello</messge>");
      expect(result.content).toBe("<msg>hello</msg>");
      expect(result.logs.some((l) => l.rule === "spelling-variant")).toBe(true);
    });

    it("fixes <recal> to <recall>", () => {
      const result = repairXmlTags('<recal name="A">x</recal>');
      expect(result.content).toBe('<recall name="A">x</recall>');
    });

    it("fixes <group-acton> to <group-action>", () => {
      const result = repairXmlTags(
        '<group-acton type="rename" actor="A" value="B"/>',
      );
      expect(result.content).toBe(
        '<group-action type="rename" actor="A" value="B"/>',
      );
    });
  });

  describe("unclosed attribute quotes", () => {
    it("fixes missing closing quote on name attribute", () => {
      const result = repairXmlTags('<msg name="阿瓜>hello</msg>');
      expect(result.content).toBe('<msg name="阿瓜">hello</msg>');
      expect(result.wasRepaired).toBe(true);
      expect(
        result.logs.some((l) => l.rule === "unclosed-attribute-quote"),
      ).toBe(true);
    });

    it("fixes missing closing quote before next attribute", () => {
      const result = repairXmlTags('<msg name="阿瓜 type="sticker"/>');
      expect(result.content).toBe('<msg name="阿瓜" type="sticker"/>');
    });
  });

  describe("unclosed msg tags", () => {
    it("inserts </msg> before next <msg>", () => {
      const result = repairXmlTags(
        '<msg name="A">hello<msg name="B">world</msg>',
      );
      expect(result.content).toContain("</msg>");
      expect(result.content).toContain("hello</msg>");
      expect(result.wasRepaired).toBe(true);
      expect(result.logs.some((l) => l.rule === "unclosed-msg-tag")).toBe(true);
    });

    it("inserts </msg> before </output>", () => {
      const result = repairXmlTags('<output><msg name="A">hello</output>');
      expect(result.content).toBe('<output><msg name="A">hello</msg></output>');
    });
  });

  describe("no repair needed", () => {
    it("returns unchanged content when valid", () => {
      const valid = '<msg name="阿瓜">你好</msg>';
      const result = repairXmlTags(valid);
      expect(result.content).toBe(valid);
      expect(result.wasRepaired).toBe(false);
      expect(result.logs).toHaveLength(0);
    });
  });

  describe("repair logs", () => {
    it("records original and repaired for each fix", () => {
      const result = repairXmlTags("< msg>hello</msg>");
      expect(result.logs.length).toBeGreaterThan(0);
      for (const log of result.logs) {
        expect(log.original).toBeDefined();
        expect(log.repaired).toBeDefined();
        expect(log.rule).toBeDefined();
      }
    });
  });
});
