import "@testing-library/jest-dom";

// Modules like @/lib/auth and @/lib/calendar-token fail closed if AUTH_SECRET
// is unset (throwing at import time). Provide a default for the test run so
// those modules can be imported. setupFiles runs before any test module is
// imported, so this beats ESM import hoisting in individual test files.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-default";

// @/lib/db calls neon(process.env.DATABASE_URL) at import time, which throws
// with no connection string. A dummy URL lets pure functions in db-importing
// modules (e.g. scrimmageTeams.isGameFrozen) be unit-tested without a real DB —
// neon never actually connects until a query runs, which these tests don't do.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/testdb";
