import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./client";
import { SamsTable } from "./tables/sams-table";

export function getSamsTable(client: DynamoDBDocumentClient = docClient, tableName?: string) {
  SamsTable.documentClient = client;
  if (tableName !== undefined) {
    SamsTable.tableName = tableName;
  }
  return SamsTable;
}
