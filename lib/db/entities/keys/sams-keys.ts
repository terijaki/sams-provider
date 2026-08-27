import { string } from "dynamodb-toolbox/schema/string";
import { SK_METADATA } from "../../key-constants";

export function samsMetadataKeys() {
  return {
    sk: string()
      .key()
      .savedAs("sk")
      .link(() => SK_METADATA)
      .hidden(),
  } as const;
}
