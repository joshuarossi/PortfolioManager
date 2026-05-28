import { db, runMigrations } from "./index";

runMigrations();
console.log("Migrations complete");
