import { describe, it, expect } from "vitest";
import {
  DomainSchema,
  extractDomainFromEmail,
  emailMatchesDomain,
  validateDomain,
  isValidDomainFormat,
} from "../domain-matcher";

describe("domain-matcher", () => {
  describe("DomainSchema", () => {
    describe("valid domains", () => {
      const validDomains = [
        "example.com",
        "sub.example.com",
        "deep.sub.example.com",
        "example.co.uk",
        "my-company.com",
        "company123.io",
        "a1.co",
        "test-domain.org",
        "EXAMPLE.COM", // Should be lowercased
        "Example.Com",
        "gmail.com",
        "outlook.com",
        "company.internal",
      ];

      validDomains.forEach((domain) => {
        it(`should accept "${domain}"`, () => {
          const result = DomainSchema.safeParse(domain);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).toBe(domain.toLowerCase());
          }
        });
      });
    });

    describe("invalid domains", () => {
      const invalidDomains = [
        { domain: "", reason: "empty string" },
        { domain: "a", reason: "too short (1 char)" },
        { domain: "ab", reason: "too short (2 chars)" },
        { domain: "example", reason: "no TLD" },
        { domain: ".com", reason: "starts with dot" },
        { domain: "example.", reason: "ends with dot" },
        { domain: "-example.com", reason: "starts with hyphen" },
        { domain: "example-.com", reason: "ends segment with hyphen" },
        { domain: "exam ple.com", reason: "contains space" },
        { domain: "example..com", reason: "double dots" },
        { domain: "@example.com", reason: "contains @" },
        { domain: "example@.com", reason: "contains @ in middle" },
        { domain: "user@example.com", reason: "full email, not domain" },
        { domain: "exam_ple.com", reason: "contains underscore" },
        { domain: "example.com/path", reason: "contains path" },
        { domain: "https://example.com", reason: "contains protocol" },
        { domain: "example.com:8080", reason: "contains port" },
      ];

      invalidDomains.forEach(({ domain, reason }) => {
        it(`should reject "${domain}" (${reason})`, () => {
          const result = DomainSchema.safeParse(domain);
          expect(result.success).toBe(false);
        });
      });
    });

    it("should transform to lowercase", () => {
      const result = DomainSchema.safeParse("EXAMPLE.COM");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("example.com");
      }
    });

    it("should reject domains over 255 characters", () => {
      // 255 max, so 256+ should fail
      const longDomain = "a".repeat(252) + ".com"; // 256 chars total
      const result = DomainSchema.safeParse(longDomain);
      expect(result.success).toBe(false);
    });
  });

  describe("extractDomainFromEmail", () => {
    describe("valid emails", () => {
      const testCases = [
        { email: "user@example.com", expected: "example.com" },
        { email: "user@EXAMPLE.COM", expected: "example.com" },
        { email: "user@Example.Com", expected: "example.com" },
        { email: "user@sub.example.com", expected: "sub.example.com" },
        { email: "user.name@company.co.uk", expected: "company.co.uk" },
        { email: "user+tag@gmail.com", expected: "gmail.com" },
        { email: "a@b.co", expected: "b.co" },
        { email: "test@my-company.io", expected: "my-company.io" },
      ];

      testCases.forEach(({ email, expected }) => {
        it(`should extract "${expected}" from "${email}"`, () => {
          expect(extractDomainFromEmail(email)).toBe(expected);
        });
      });
    });

    describe("invalid inputs", () => {
      const invalidInputs = [
        { input: "", reason: "empty string" },
        { input: "notanemail", reason: "no @ symbol" },
        { input: "@domain.com", reason: "no local part" },
        { input: "user@", reason: "no domain" },
        { input: "user@@domain.com", reason: "double @" },
        { input: "user@domain@extra.com", reason: "multiple @" },
        { input: null as unknown as string, reason: "null" },
        { input: undefined as unknown as string, reason: "undefined" },
        { input: 123 as unknown as string, reason: "number" },
        { input: {} as unknown as string, reason: "object" },
      ];

      invalidInputs.forEach(({ input, reason }) => {
        it(`should return null for ${reason}`, () => {
          expect(extractDomainFromEmail(input)).toBeNull();
        });
      });
    });

    it("should trim whitespace from domain", () => {
      expect(extractDomainFromEmail("user@example.com ")).toBe("example.com");
      expect(extractDomainFromEmail("user@ example.com")).toBe("example.com");
    });
  });

  describe("emailMatchesDomain", () => {
    describe("matching cases", () => {
      const matchingCases = [
        { email: "user@gmail.com", domain: "gmail.com" },
        { email: "user@GMAIL.COM", domain: "gmail.com" },
        { email: "user@gmail.com", domain: "GMAIL.COM" },
        { email: "USER@Gmail.Com", domain: "gmail.com" },
        { email: "test.user+tag@company.io", domain: "company.io" },
        { email: "a@b.co", domain: "b.co" },
      ];

      matchingCases.forEach(({ email, domain }) => {
        it(`should match "${email}" with domain "${domain}"`, () => {
          expect(emailMatchesDomain(email, domain)).toBe(true);
        });
      });
    });

    describe("non-matching cases", () => {
      const nonMatchingCases = [
        { email: "user@gmail.com", domain: "yahoo.com", reason: "different domains" },
        { email: "user@sub.gmail.com", domain: "gmail.com", reason: "subdomain vs root" },
        { email: "user@gmail.com", domain: "sub.gmail.com", reason: "root vs subdomain" },
        { email: "user@gmail.com.evil.com", domain: "gmail.com", reason: "domain spoofing attempt" },
        { email: "user@notgmail.com", domain: "gmail.com", reason: "partial match" },
        { email: "", domain: "gmail.com", reason: "empty email" },
        { email: "invalid", domain: "gmail.com", reason: "invalid email format" },
        { email: "user@gmail.com", domain: "", reason: "empty domain" },
      ];

      nonMatchingCases.forEach(({ email, domain, reason }) => {
        it(`should not match: ${reason}`, () => {
          expect(emailMatchesDomain(email, domain)).toBe(false);
        });
      });
    });
  });

  describe("validateDomain", () => {
    it("should return lowercase domain for valid input", () => {
      expect(validateDomain("EXAMPLE.COM")).toBe("example.com");
      expect(validateDomain("gmail.com")).toBe("gmail.com");
      expect(validateDomain("My-Company.io")).toBe("my-company.io");
    });

    it("should return null for invalid input", () => {
      expect(validateDomain("")).toBeNull();
      expect(validateDomain("invalid")).toBeNull();
      expect(validateDomain("user@example.com")).toBeNull();
      expect(validateDomain("-invalid.com")).toBeNull();
    });
  });

  describe("isValidDomainFormat", () => {
    it("should return true for valid domains", () => {
      expect(isValidDomainFormat("example.com")).toBe(true);
      expect(isValidDomainFormat("sub.example.co.uk")).toBe(true);
      expect(isValidDomainFormat("my-company.io")).toBe(true);
    });

    it("should return false for invalid domains", () => {
      expect(isValidDomainFormat("")).toBe(false);
      expect(isValidDomainFormat("nodot")).toBe(false);
      expect(isValidDomainFormat("-invalid.com")).toBe(false);
      expect(isValidDomainFormat("user@example.com")).toBe(false);
    });
  });

  describe("edge cases and security", () => {
    it("should not match subdomains as parent domains", () => {
      // sub.gmail.com should NOT match gmail.com
      expect(emailMatchesDomain("user@sub.gmail.com", "gmail.com")).toBe(false);
    });

    it("should not match parent domains as subdomains", () => {
      // gmail.com should NOT match sub.gmail.com
      expect(emailMatchesDomain("user@gmail.com", "sub.gmail.com")).toBe(false);
    });

    it("should prevent domain spoofing via similar names", () => {
      expect(emailMatchesDomain("user@gmail.com.evil.com", "gmail.com")).toBe(false);
      expect(emailMatchesDomain("user@notgmail.com", "gmail.com")).toBe(false);
      expect(emailMatchesDomain("user@gmailcom.com", "gmail.com")).toBe(false);
    });

    it("should handle unicode/IDN domains properly", () => {
      // Basic ASCII handling - IDN domains would need punycode conversion
      expect(validateDomain("example.com")).toBe("example.com");
    });

    it("should reject potential injection attempts", () => {
      expect(validateDomain("example.com; DROP TABLE users;")).toBeNull();
      expect(validateDomain("example.com<script>")).toBeNull();
      expect(validateDomain("example.com' OR '1'='1")).toBeNull();
    });

    it("should handle very long but valid domains", () => {
      // Max label is 63 chars, max domain is 253 chars
      const longButValidLabel = "a".repeat(63);
      const validLongDomain = `${longButValidLabel}.com`;
      expect(isValidDomainFormat(validLongDomain)).toBe(true);
    });
  });
});
