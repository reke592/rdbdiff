import { Command } from "commander";
import { MySqlDiff } from "./mysql-diff";
import { Diff, ConnectionOptions, ComparisonOptions } from "./diff";
import { basename, dirname, resolve } from "path";
import { URL } from "url";
import { existsSync, mkdirSync, writeFileSync } from "fs";

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

program
  .command("compare <dbURL1> <dbURL2>")
  .option("-e", "eager check all errors in schema object")
  .option("-v", "show console logs regarding database connection activity")
  .option("-o <filename>", "output")
  .option("-t", "console.table if comparison issues were found.")
  .option("-p", "pretty output")
  .option("-a", "include A, B schema in output")
  .option("-w", "check whitespace in function and procedure definitions")
  .description(
    `DB URL format: <protocol>://<user>[:password]@<address>[:port]/<dbname>

    example:
    rdbdiff compare mysql://user@localhost:3308/db1 mysql://user@localhost:3308/db2
    rdbdiff compare mysql://user:secret@localhost:3308/db1 mysql://user:secret@localhost:3308/db2
    `
  )
  .summary("Check the difference between database schemas.")
  .action(async function () {
    const opts = this.opts();
    const args = this.args;
    const eager = opts["e"] || false;
    const verbose = opts["v"] || false;
    const outfile = opts["o"] || undefined;
    const outTable = opts["t"] || false;
    const pretty = opts["p"] || false;
    const all = opts["a"] || false;
    const whitespaces = opts["w"] || false;
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
    console.log("checking database schema. please wait..");
    await Promise.all([A.load(), B.load()]);
    const diff = A.compare(B);
    const ARecord = A.asRecord();
    const BRecord = B.asRecord();
    const output = {
      result: diff,
      ...(all ? { A: ARecord, B: BRecord } : {}),
    };

    // output
    if (outfile) {
      if (!existsSync(dirname(outfile))) {
        mkdirSync(dirname(outfile), { recursive: true });
      }
      console.log(`writing output to ${resolve(outfile)}`);
      writeFileSync(outfile, JSON.stringify(output, null, pretty ? 2 : 0));
    } else {
      console.log(JSON.stringify(output, null, pretty ? 2 : 0));
    }

    if (process.env.NODE_ENV === "test") {
      return;
    }

    // exit code
    if (diff.length) {
      console.error(
        `${diff.length} comparison issues were found between ${ARecord.label} and ${BRecord.label}.`
      );
      if (outTable) {
        console.table(diff);
      }
      process.exit(1);
    } else {
      process.exit(0);
    }
  });

module.exports = {
  program,
};
