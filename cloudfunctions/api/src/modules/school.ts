import { db } from "../db.js";
import type { Handler } from "../types.js";

type SchoolDocument = {
  _id: string;
  name: string;
};

export const listSchools: Handler = async () => {
  const result = (await db
    .collection("schools")
    .where({ status: "ACTIVE" })
    .orderBy("name", "asc")
    .limit(100)
    .get()) as unknown as { data: SchoolDocument[] };
  return { schools: result.data.map((school) => ({ id: school._id, name: school.name })) };
};
