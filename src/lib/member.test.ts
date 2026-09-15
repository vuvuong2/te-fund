import { afterEach, beforeEach, expect, it } from "vitest";
import { createFundDb, type FundTestDb, THU_VU, VU_VUONG } from "@/test/fund-db";
import { readSignedInMember } from "./member";

let db: FundTestDb;

beforeEach(async () => {
  db = await createFundDb();
});

afterEach(async () => {
  await db.close();
});

it("resolves the Member behind a signed-in Google account", async () => {
  const thu = await db.signInAs(THU_VU);

  expect(await readSignedInMember(db.dbFor(thu))).toMatchObject({ fullName: "Thu Vu" });
});

it("names the Member in full, because a given name is not enough to tell them apart", async () => {
  const vu = await db.signInAs(VU_VUONG);

  // Three of the six Members answer to "Vu".
  expect((await readSignedInMember(db.dbFor(vu)))?.fullName).toBe("Vu Vuong");
});

it("finds nobody for a visitor with no session", async () => {
  expect(await readSignedInMember(db.dbFor(null))).toBeNull();
});

it("finds nobody for a Google account with no Member behind it", async () => {
  const [stranger] = await db.query<{ id: string }>(
    `insert into auth.users (email) values ('ceo@timeedit.com') returning id`,
  );

  expect(await readSignedInMember(db.dbFor(stranger!.id))).toBeNull();
});
