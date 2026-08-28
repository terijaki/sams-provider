import { describe, expect, it } from "vite-plus/test";
import { syncAssociationsFromSams } from "./associations";

describe("syncAssociationsFromSams", () => {
  it("stores associations from SAMS in the provider index", async () => {
    const upserted: Array<{ uuid: string; name: string; nameSlug: string; ttl: number }> = [];
    const result = await syncAssociationsFromSams({
      sams: {
        getAssociations: async ({ query }) => ({
          data: {
            content:
              query.page === 0
                ? [
                    { uuid: "assoc-1", name: "Assoc One" },
                    { uuid: "assoc-2", name: "Assoc Two" },
                  ]
                : [],
            last: query.page === 0 ? false : true,
          },
          error: undefined,
        }),
        getAssociationByUuid: async () => ({ data: undefined, error: undefined }),
      },
      associationsRepo: {
        upsertMany: async (items) => {
          upserted.push(...items);
        },
      },
    });

    expect(result.associations).toEqual([
      { uuid: "assoc-1", name: "Assoc One" },
      { uuid: "assoc-2", name: "Assoc Two" },
    ]);
    expect(upserted.map((item) => item.uuid)).toEqual(["assoc-1", "assoc-2"]);
  });
});
