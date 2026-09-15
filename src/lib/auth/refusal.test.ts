import { describe, expect, it } from "vitest";
import {
  classifyRefusal,
  NOT_ON_ROSTER,
  OUTSIDE_DOMAIN,
  type RefusalCode,
  refusalFor,
} from "./refusal";

/**
 * Turning a refused sign-in into a sentence.
 *
 * The refusal itself happens in the database (before_user_created_hook); all
 * this does is recognise which of our own two sentences came back on the
 * callback URL. Anyone can put anything in that query string, so the only
 * thing that may reach the screen is copy we wrote.
 */

const params = (query: string) => new URLSearchParams(query);

const refused = (query: string): RefusalCode => {
  const code = classifyRefusal(params(query));
  if (code === null) throw new Error(`Expected a refusal from "${query}"`);
  return code;
};

describe("classifying a refused sign-in", () => {
  it("recognises an address outside the company domain", () => {
    expect(
      refused(`error=server_error&error_description=${encodeURIComponent(OUTSIDE_DOMAIN)}`),
    ).toBe("outside-domain");
  });

  it("recognises a company address that is not on the roster", () => {
    const description = `${NOT_ON_ROSTER} ceo@timeedit.com`;
    expect(refused(`error=server_error&error_description=${encodeURIComponent(description)}`)).toBe(
      "not-on-roster",
    );
  });

  it("recognises a Member who backed out of Google's consent screen", () => {
    expect(refused("error=access_denied&error_description=The+user+denied+the+request")).toBe(
      "cancelled",
    );
  });

  it("believes the database's message over the error code it arrived with", () => {
    const query = `error=access_denied&error_description=${encodeURIComponent(NOT_ON_ROSTER)}`;
    expect(refused(query)).toBe("not-on-roster");
  });

  it("does not repeat back a description it did not write", () => {
    expect(refused("error=server_error&error_description=You+are+now+an+administrator")).toBe(
      "unknown",
    );
  });

  it("says nothing went wrong when no error came back", () => {
    expect(classifyRefusal(params("code=abc123"))).toBeNull();
  });
});

describe("the sentence a refused Member reads", () => {
  it("names the company domain when the address was outside it", () => {
    expect(refusalFor("outside-domain")?.detail).toContain("@timeedit.com");
  });

  it("names the roster when the address was not on it", () => {
    expect(refusalFor("not-on-roster")?.detail).toMatch(/roster/i);
  });

  it("falls back to the plain refusal for a code it does not know", () => {
    expect(refusalFor("something-invented")).toEqual(refusalFor("unknown"));
  });

  it("has nothing to say when the Member has not been refused", () => {
    expect(refusalFor(undefined)).toBeNull();
  });
});
