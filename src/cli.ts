import { Command } from "commander";
import { MySqlDiff } from "./mysql-diff";
import { Diff, ConnectionOptions, ComparisonOptions } from "./diff";
import { basename, dirname, join, resolve } from "path";
import { URL } from "url";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dumpToFile } from "./utils";

type DiffOptions = Omit<ConnectionOptions, "client">;

const supported: Record<string, (options: DiffOptions) => Diff> = {
  "mysql:": (options) =>
    new MySqlDiff({
      client: "mysql",
      ...options,
    }),
};

function createConnection(url: URL, options: ComparisonOptions): Diff {
  if (!supported[url.protocol]) {
    throw new Error(
      `${url.protocol} not supported. protocols ${Object.keys(supported)}`
    );
  }
  return supported[url.protocol]({
    database: basename(url.pathname),
    host: url.hostname,
    port: Number(url.port) || undefined,
    user: url.username,
    password: url.password,
    options,
  });
}

const program = new Command();

const exitCode = (code?: number | string | null | undefined) => {
  if (process.env.NODE_ENV === "test") return;
  process.exit(code);
};

program
  .command("compare <dbURL1> <dbURL2>")
  .option("-e", "eager check all errors in schema object")
  .option("-a, --out-schema", "save A,B schema to a JSON file", false)
  .option("-p, --pretty", "pretty output", false)
  .option(
    "-t, --console-table",
    "console.table if comparison issues were found."
  )
  .option(
    "-v, --verbose",
    "show console logs regarding database connection activity"
  )
  .option(
    "-w, --whitespaces",
    "check whitespaces in function and procedure definitions"
  )
  .option("--out-dir <path>", "output directory")
  .option(
    "--out-comparison <filename>",
    "save comparison data to a JSON file",
    "comparison.json"
  )
  .option(
    "--show-create",
    "dump the create create statement of tables, functions stored procedure having comparison issues.",
    false
  )
  .description(
    `DB URL format: <protocol>://<user>[:password]@<address>[:port]/<dbname>

    example:
    sqldiff compare mysql://user@localhost:3308/db1 mysql://user@localhost:3308/db2
    sqldiff compare mysql://user:secret@localhost:3308/db1 mysql://user:secret@localhost:3308/db2
    `
  )
  .summary("Check the difference between database schemas.")
  .action(async function () {
    const opts = this.opts();
    const args = this.args;
    const eager = opts["e"] || false;
    const verbose = opts["v"] || false;
    const {
      showCreate,
      outDir,
      outSchema,
      outComparison,
      pretty,
      whitespaces,
      consoleTable,
    } = opts;
    const [dbUrl1, dbUrl2] = args;
    const url1 = URL.parse(dbUrl1);
    const url2 = URL.parse(dbUrl2);
    if (!url1) throw new Error(`invalid url: ${dbUrl1}`);
    if (!url2) throw new Error(`invalid url: ${dbUrl2}`);
    if (url1.protocol !== url2.protocol) {
      throw new Error(
        `protocol mismatch: ${url1.protocol} != ${url2.protocol}`
      );
    }
    const A = createConnection(url1, { eager, verbose, whitespaces });
    const B = createConnection(url2, { eager, verbose, whitespaces });

    // process
    console.log("checking database schema..");
    await Promise.all([A.load(), B.load()]);
    const diff = A.compare(B);
    const ARecord = A.asRecord();
    const BRecord = B.asRecord();

    // output
    const stringify = (data: any) => JSON.stringify(data, null, pretty ? 2 : 0);
    const dir = resolve(outDir || __dirname);

    if (outSchema) {
      const target = join(dir, "schema.json");
      console.log(`writing schema JSON to ${target}`);
      dumpToFile(target, stringify({ A: ARecord, B: BRecord }));
    }

    if (outComparison) {
      const target = join(dir, basename(outComparison));
      console.log(`writing output to ${target}`);
      dumpToFile(target, stringify(diff));
    }

    if (showCreate) {
      for (let item of diff) {
        // currently not supported show create index
        if (item.objectType === "index") continue;
        const [type, paramOrColumn] = item.objectType.split(".");
        const name = paramOrColumn ? item.in! : item.name;
        const [createA, createB] = await Promise.all([
          A.showCreate(type, name),
          B.showCreate(type, name),
        ]);
        if (createA) {
          dumpToFile(
            join(dir, "show-create", "A", type, name + ".sql"),
            createA
          );
        }
        if (createB) {
          dumpToFile(
            join(dir, "show-create", "B", type, name + ".sql"),
            createB
          );
        }
      }
    }

    if (consoleTable) {
      console.table(diff);
    }

    // close database connections
    await Promise.allSettled([A.disconnect(), B.disconnect()]);

    // exit code
    if (diff.length) {
      console.error(
        `${diff.length} comparison issues were found between ${ARecord.label} and ${BRecord.label}.`
      );
      exitCode(1);
    } else {
      exitCode(0);
    }
  });

module.exports = {
  program,
};
