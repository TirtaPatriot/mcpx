// Dijalankan sebelum semua test: pakai database sementara agar data lokal tidak tersentuh.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "mcpx-test-")), "tokens.db");
delete process.env.ADMIN_PASSWORD;
delete process.env.PUBLIC_URL;
delete process.env.ALLOWED_REDIRECT_HOSTS;
