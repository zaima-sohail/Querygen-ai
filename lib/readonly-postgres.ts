
import { Pool } from "pg";

const readOnlyPool = new Pool({
  connectionString: process.env.READONLY_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default readOnlyPool;
