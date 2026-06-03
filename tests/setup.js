import "@testing-library/jest-dom";

// Modules like @/lib/auth and @/lib/calendar-token fail closed if AUTH_SECRET
// is unset (throwing at import time). Provide a default for the test run so
// those modules can be imported. setupFiles runs before any test module is
// imported, so this beats ESM import hoisting in individual test files.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-default";
